'use strict'

const rb = require('whatsapp-rust-bridge')
const { proto } = require('../../WAProto')

const BOT_MESSAGE_INFO = 'Bot Message'
const KEY_LENGTH = 32
const MSG_ID_HEX_RE = /^[0-9A-Fa-f]{32}$/

const unpadRandomMax16 = value => {
	const bytes = new Uint8Array(value)
	if (!bytes.length) {
		throw new Error('unpadPkcs7 given empty bytes')
	}
	const padLength = bytes[bytes.length - 1]
	if (padLength > bytes.length) {
		throw new Error(`unpad given ${bytes.length} bytes, but pad is ${padLength}`)
	}
	return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length - padLength)
}

const toBuffer = value => {
	if (Buffer.isBuffer(value)) return value
	if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
	return Buffer.from(value)
}

const normalizeLidJid = jid => {
	if (!jid || !jid.endsWith('@lid') || !jid.includes(':')) return jid
	return `${jid.split(':')[0]}@lid`
}

// Returns [ascii] normally, or [ascii, hex-decoded] when msgId is a 32-char hex string.
// WA can encode msgId as the hex-encoded form of its binary representation.
const msgIdForms = msgId => {
	const ascii = Buffer.from(msgId)
	if (!MSG_ID_HEX_RE.test(msgId)) return [ascii]
	const binary = Buffer.from(msgId, 'hex')
	return binary.equals(ascii) ? [ascii] : [ascii, binary]
}

// Ordered msgId candidates per the Rust BotMessageContext:
//   botEditTargetId when editing, stanzaId for the normal full response, metaTargetId as fallback.
const selectMsgIdCandidates = messageKey => {
	const seen = new Set()
	const result = []
	for (const id of [messageKey?.botEditTargetId, messageKey?.stanzaId, messageKey?.metaTargetId]) {
		const s = id ? String(id) : ''
		if (s && !seen.has(s)) {
			seen.add(s)
			result.push(s)
		}
	}
	return result
}

// Ordered target_sender_user_jid candidates: meId (already non-AD form) then normalized meLid.
const selectTargetJidCandidates = messageKey => {
	const seen = new Set()
	const result = []
	for (const jid of [messageKey?.meId, normalizeLidJid(messageKey?.meLid)]) {
		const s = jid ? String(jid) : ''
		if (s && !seen.has(s)) {
			seen.add(s)
			result.push(s)
		}
	}
	return result
}

const decodeDecryptedMsmsgMessage = decrypted => {
	const buf = toBuffer(decrypted)
	try {
		const unpadded = Buffer.from(unpadRandomMax16(buf))
		const decoded = proto.Message.decode(unpadded)
		const hasContent = Object.keys(decoded).some(k => k !== 'messageContextInfo' && decoded[k] != null)
		if (hasContent) return decoded
	} catch {}
	return proto.Message.decode(buf)
}

/**
 * Decrypts <enc type="msmsg"> bot messages.
 *
 * Two-pass HKDF — algorithm from bot_message.rs (BotMessageContext):
 *   k1    = HKDF(messageSecret, salt=∅, info="Bot Message",                     32)
 *   k2    = HKDF(k1,            salt=∅, info=msgID||target_sender_jid||bot_jid, 32)
 *   AAD   = msgID || 0x00 || bot_user_jid
 *   plain = AES-256-GCM.Decrypt(k2, encIv, encPayload, AAD)
 *
 * k1 is shared across all candidates and derived once.
 * AAD always uses bot_user_jid, never target_sender_jid.
 */
const decryptMsmsgBotMessage = async (messageSecret, messageKey, msMsg) => {
	if (!messageSecret || (messageSecret instanceof Uint8Array && !messageSecret.byteLength)) {
		throw new Error('Missing required messageSecret for msmsg decryption')
	}
	if (!messageKey?.participant) throw new Error('Missing required participant for msmsg decryption')
	if (!messageKey?.meId) throw new Error('Missing required meId for msmsg decryption')
	if (!msMsg?.encIv) throw new Error('Missing required encIv for msmsg decryption')
	if (!msMsg?.encPayload) throw new Error('Missing required encPayload for msmsg decryption')

	const msgIdCandidates = selectMsgIdCandidates(messageKey)
	if (!msgIdCandidates.length) throw new Error('Missing required target message id for msmsg decryption')

	const targetJidCandidates = selectTargetJidCandidates(messageKey)
	if (!targetJidCandidates.length) throw new Error('Missing required target JID for msmsg decryption')

	const botJidBuf = Buffer.from(String(messageKey.participant))
	const payload = toBuffer(msMsg.encPayload)
	const iv = toBuffer(msMsg.encIv)

	// k1 depends only on messageSecret — derive once and reuse across all candidates
	const baseKey = Buffer.from(rb.hkdf(toBuffer(messageSecret), KEY_LENGTH, { info: BOT_MESSAGE_INFO }))

	let lastError
	for (const msgId of msgIdCandidates) {
		for (const idBuf of msgIdForms(msgId)) {
			for (const targetJid of targetJidCandidates) {
				const info = Buffer.concat([idBuf, Buffer.from(targetJid), botJidBuf])
				const key = Buffer.from(rb.hkdf(baseKey, KEY_LENGTH, { info }))
				const aad = Buffer.concat([idBuf, Buffer.from([0x00]), botJidBuf])
				try {
					return Buffer.from(rb.aesDecryptGCM(payload, key, iv, aad))
				} catch (e) {
					lastError = e
				}
			}
		}
	}

	const err = new Error('msmsg decryption failed: all key derivation candidates exhausted')
	err.cause = lastError
	throw err
}

module.exports = {
	decodeDecryptedMsmsgMessage,
	decryptMsmsgBotMessage
}
