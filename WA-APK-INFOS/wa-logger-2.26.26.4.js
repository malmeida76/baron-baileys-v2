'use strict'

/**
 * wa-logger-2.26.26.4.js — full TX/RX stanza logger for WA 2.26.26.4
 *
 * Runtime class names (from jadx 2.26.26.4 "renamed from" comments):
 *   X.0Ol   — BinaryNode      A00=tag(String) A01=data(byte[]) A02=children(0Ol[]) A03=attrs(0Oj[])
 *   X.0Oj   — NodeAttr        A02=key A03=value A01=jid
 *   X.0vy   — BinaryDecoder   BPg() = RX choke-point (per-frame, post-TLS/deflate, pre-router)
 *   X.1JX   — BinaryWriter    CWR(0Ol, int) = TX choke-point
 *   X.1JP   — XmlWriter       CWQ(0Ol) = TX backup path
 *   X.1Kd   — ConnManager     A02/A03 = sendNode — do NOT hook: both route through CWR
 *   X.7Rx   — NodeRouter      AA0(0Ol, 5SN) = post-handshake router (RX fallback only)
 *   X.5SN   — RoutingContext  A09/A0E — skip: BPg already catches everything
 *
 * Hook strategy:
 *   TX — X.1JX.CWR only.  Single entry point before binary encode; no duplicates.
 *        [TX]     decoded XML structure (what is being sent)
 *        [TX-ENC] binary-encoded bytes before Noise encryption (raw wire format)
 *                 via static X.1JX.A01(node, OutputStream)
 *   RX — X.0vy.BPg only.  Single entry point after TLS decrypt + deflate decompress.
 *        Catches stream:features, challenge, success, failure AND all protocol stanzas.
 *        Fallback to X.7Rx.AA0 if BPg is unavailable (only installs when BPg fails).
 *        [RX-WIRE] raw frame bytes after Noise decrypt + deflate (from this.A00)
 *        [RX]      decoded XML structure (parsed BinaryNode)
 *
 * Usage:
 *   frida -U -f com.whatsapp -l wa-logger-2.26.26.4.js 2>&1 | tee wa.log
 *   frida -U com.whatsapp    -l wa-logger-2.26.26.4.js
 */

// ─── Utils ────────────────────────────────────────────────────────────────────

function ts() {
	const d = new Date()
	return (
		('0' + d.getHours()).slice(-2) +
		':' +
		('0' + d.getMinutes()).slice(-2) +
		':' +
		('0' + d.getSeconds()).slice(-2) +
		'.' +
		('00' + d.getMilliseconds()).slice(-3)
	)
}

function log(tag, msg) {
	console.log('[' + ts() + '][' + tag + '] ' + msg)
}

function safe(fn, fallback) {
	try {
		return fn()
	} catch (_) {
		return fallback !== undefined ? fallback : '<err>'
	}
}

function jstr(o) {
	if (o === null || o === undefined) return '<null>'
	return safe(function () {
		return o.toString()
	}, '<err>')
}

// ─── Java reflection helpers ──────────────────────────────────────────────────

const _fieldCache = {}
let _JArr = null

function getJArr() {
	if (!_JArr) _JArr = Java.use('java.lang.reflect.Array')
	return _JArr
}

function javaArrayLen(arr) {
	if (!arr) return 0
	try {
		return getJArr().getLength(arr)
	} catch (_) {
		return 0
	}
}

function javaArrayGet(arr, i) {
	try {
		return getJArr().get(arr, i)
	} catch (_) {
		return null
	}
}

function fv(obj, fieldName) {
	try {
		const cls = obj.getClass()
		const clsName = cls.getName()
		const cacheKey = clsName + '#' + fieldName

		let field = _fieldCache[cacheKey]
		if (!field) {
			let c = cls
			while (c) {
				try {
					field = c.getDeclaredField(fieldName)
					field.setAccessible(true)
					_fieldCache[cacheKey] = field
					break
				} catch (_) {
					c = c.getSuperclass()
					if (!c || c.getName() === 'java.lang.Object') break
				}
			}
		}
		if (!field) return null
		return field.get(obj)
	} catch (_) {
		return null
	}
}

// ─── Hex dump — no truncation ─────────────────────────────────────────────────
//
// maxBytes is optional; omit (or pass 0) for full output.
// Large binary payloads (e.g. encrypted messages) will be printed in full.

function hexN(arr, maxBytes) {
	const out = []
	try {
		const JArr = getJArr()
		const len = arr.length !== undefined ? arr.length : JArr.getLength(arr)
		const max = maxBytes > 0 ? Math.min(len, maxBytes) : len
		for (let i = 0; i < max; i++) {
			try {
				const b = JArr.getByte(arr, i)
				out.push(('0' + (b & 0xff).toString(16)).slice(-2))
			} catch (_) {
				const b = arr[i]
				if (b !== undefined && b !== null) out.push(('0' + (b & 0xff).toString(16)).slice(-2))
			}
		}
		if (len > max) out.push('…(' + len + 'B)')
	} catch (_) {}
	return out.join('')
}

// ─── Attr serialiser ──────────────────────────────────────────────────────────

function attrStr(attrsRaw) {
	if (!attrsRaw) return ''
	let s = ''
	try {
		const len = javaArrayLen(attrsRaw)
		for (let i = 0; i < len; i++) {
			const a = javaArrayGet(attrsRaw, i)
			if (!a) continue
			const key = safe(function () {
				return jstr(fv(a, 'A02'))
			}, '?')
			if (!key || key === '?' || key === '<null>') continue
			let val = ''
			const jid = safe(function () {
				return fv(a, 'A01')
			}, null)
			if (jid && jstr(jid) !== '<null>') {
				val = jstr(jid)
			} else {
				val = safe(function () {
					return jstr(fv(a, 'A03'))
				}, '')
			}
			s += ' ' + key + '="' + val + '"'
		}
	} catch (_) {}
	return s
}

// ─── Node → XML — no depth cap, no data truncation ───────────────────────────

function nodeToXml(node, depth) {
	if (!node) return '<null/>'
	depth = depth || 0
	if (depth > 50) return '<!-- max-depth-50 -->'
	const pad = '  '.repeat(depth)

	const tag = safe(function () {
		return jstr(fv(node, 'A00'))
	}, '?')
	const data = safe(function () {
		return fv(node, 'A01')
	}, null)
	const children = safe(function () {
		return fv(node, 'A02')
	}, null)
	const attrsRaw = safe(function () {
		return fv(node, 'A03')
	}, null)
	const attrs = safe(function () {
		return attrStr(attrsRaw)
	}, '')

	const dataLen = data
		? safe(function () {
				return getJArr().getLength(data)
			}, 0)
		: 0
	const childCount = javaArrayLen(children)

	if (!dataLen && !childCount) {
		return pad + '<' + tag + attrs + '/>'
	}

	let out = pad + '<' + tag + attrs + '>'

	if (dataLen > 0) {
		// Try to render as printable ASCII; fall back to full hex dump.
		const text = safe(function () {
			const JArr = getJArr()
			const chars = []
			for (let i = 0; i < dataLen; i++) {
				const b = JArr.getByte(data, i) & 0xff
				if (b !== 0x09 && b !== 0x0a && b !== 0x0d && (b < 0x20 || b > 0x7e)) return null
				chars.push(String.fromCharCode(b))
			}
			return chars.join('')
		}, null)
		if (text) {
			out += text
		} else {
			out += '[' + dataLen + 'B:' + hexN(data) + ']'
		}
	}

	if (childCount > 0) {
		for (let i = 0; i < childCount; i++) {
			const child = javaArrayGet(children, i)
			if (child) out += '\n' + nodeToXml(child, depth + 1)
		}
		out += '\n' + pad
	}

	out += '</' + tag + '>'
	return out
}

// ─── One-shot class/field debug (fires on first decoded node) ─────────────────

let _debugDone = false
function debugNode(node) {
	if (_debugDone) return
	_debugDone = true
	try {
		const cls = node.getClass()
		log('DEBUG-CLASS', cls.getName())
		const fields = cls.getDeclaredFields()
		for (let i = 0; i < fields.length; i++) {
			try {
				fields[i].setAccessible(true)
				const fname = fields[i].getName()
				const ftype = fields[i].getType().getName()
				const rawVal = fields[i].get(node)
				let vs = '<null>'
				if (rawVal !== null) {
					if (ftype === '[B') {
						vs = '[byte[] len=' + (rawVal.length !== undefined ? rawVal.length : javaArrayLen(rawVal)) + ']'
					} else if (ftype.startsWith('[')) {
						vs = '[array len=' + javaArrayLen(rawVal) + ' type=' + ftype + ']'
					} else {
						vs = jstr(rawVal) + ' (type=' + ftype + ')'
					}
				}
				log('DEBUG-FIELD', fname + ' = ' + vs)
			} catch (fe) {
				log('DEBUG-FIELD-ERR', fields[i].getName() + ': ' + fe.message)
			}
		}
	} catch (e) {
		log('DEBUG-ERR', e.message)
	}
}

// ─── Hook helper ─────────────────────────────────────────────────────────────

function tryHook(label, fn) {
	try {
		fn()
		log('HOOK', label + ' ✓')
	} catch (e) {
		log('HOOK-ERR', label + ': ' + e.message)
	}
}

// ─── TX hook ─────────────────────────────────────────────────────────────────

function hookTX() {
	// X.1JX.CWR is the single binary-encode entry point — every outgoing node
	// passes through here before write.  X.1Kd.A02/A03 (sendNode variants) both
	// route into CWR, so hooking those as well would produce duplicate lines.
	//
	// Per stanza we log two lines:
	//   [TX]      — decoded XML structure (what we are sending)
	//   [TX-ENC]  — binary-encoded bytes before Noise encryption (wire format)
	//               obtained by calling static X.1JX.A01(node, OutputStream)
	tryHook('X.1JX.CWR (TX)', function () {
		const W = Java.use('X.1JX')
		const BAOS = Java.use('java.io.ByteArrayOutputStream')
		W.CWR.overload('X.0Ol', 'int').implementation = function (node, prio) {
			debugNode(node)
			log('TX', nodeToXml(node, 0))
			// Encode the node via the same static serialiser CWR uses internally.
			// This gives the raw binary frame bytes BEFORE Noise encryption.
			// Header byte 0x00 = non-compressed (matches the uncompressed CWR path).
			try {
				const baos = BAOS.$new(8192)
				baos.write(0)
				W.A01(node, baos)
				const enc = baos.toByteArray()
				log('TX-ENC', '[' + javaArrayLen(enc) + 'B] ' + hexN(enc))
			} catch (encErr) {
				log('TX-ENC-ERR', encErr.message)
			}
			return this.CWR(node, prio)
		}
	})

	// Backup for builds that use the XML writer path instead of binary.
	tryHook('X.1JP.CWQ (TX-backup)', function () {
		const W = Java.use('X.1JP')
		W.CWQ.overload('X.0Ol').implementation = function (node) {
			log('TX-XML', nodeToXml(node, 0))
			return this.CWQ(node)
		}
	})
}

// ─── RX hook ─────────────────────────────────────────────────────────────────

function hookRX() {
	let rxBpgOk = false

	// PRIMARY: X.0vy.BPg() — per-frame read loop exit point.
	// Called once per incoming WA frame after:
	//   1. TLS frame reassembly
	//   2. Noise-protocol decryption
	//   3. Deflate decompression (if compressed flag set)
	// Returns the decoded X.0Ol (BinaryNode).
	//
	// This fires for EVERY node the server sends, including:
	//   stream:features, challenge, success, failure, iq, message,
	//   presence, notification, receipt, ack, call, blocklist, etc.
	// No tag filter — zero stanzas are skipped.
	//
	// Per stanza we log two lines:
	//   [RX-WIRE] — raw frame bytes after Noise decrypt + deflate (binary wire form)
	//               read from this.A00 which BPg() stores before parsing
	//   [RX]      — decoded XML structure (parsed BinaryNode)
	tryHook('X.0vy.BPg (RX)', function () {
		const Vy = Java.use('X.0vy')
		Vy.BPg.implementation = function () {
			const self = this
			const node = this.BPg()
			if (node) {
				// this.A00 holds the decrypted+decompressed frame bytes.
				// Use fv() because X.0vy also has a method named A00(int,InputStream)
				// and Frida 17 would return the method wrapper via .A00 directly.
				try {
					const raw = fv(self, 'A00')
					if (raw) {
						log('RX-WIRE', '[' + javaArrayLen(raw) + 'B] ' + hexN(raw))
					}
				} catch (_) {}
				log('RX', nodeToXml(node, 0))
			}
			return node
		}
		rxBpgOk = true
	})

	// FALLBACK: X.7Rx.AA0 — main post-handshake node router.
	// Only installed when BPg hook failed to avoid double-logging.
	// Does NOT see handshake stanzas (stream:features, challenge).
	if (!rxBpgOk) {
		tryHook('X.7Rx.AA0 (RX-fallback)', function () {
			const Rx = Java.use('X.7Rx')
			Rx.AA0.overload('X.0Ol', 'X.5SN').implementation = function (node, ctx) {
				log('RX', nodeToXml(node, 0))
				return this.AA0(node, ctx)
			}
		})
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Java.perform(function () {
	log('INIT', '=== wa-logger-2.26.26.4 starting ===')
	_JArr = Java.use('java.lang.reflect.Array')
	hookTX()
	hookRX()
	log('INIT', '=== hooks installed ===')
})
