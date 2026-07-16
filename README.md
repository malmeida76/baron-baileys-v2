# baron-baileys-v2

A high-performance WhatsApp Web library built on [Baileys](https://github.com/WhiskeySockets/Baileys), with critical paths accelerated via a [Rust WASM bridge](https://github.com/7ucg/whatsapp-rust-bridge).

---

## Updated — 2026-07-16

| Area | What changed |
| --- | --- |
| **CSToken / NCT** | NCT salt (`NctSaltSyncAction`, proto field 80) is now persisted to `authState.keys` under `nct-salt` when received via App-State-Sync. For 1-on-1 messages where no tctoken exists (cold contact), Baileys now computes `HMAC-SHA256(nctSalt, utf8("<user>@lid"))` and attaches it as `<cstoken>` in the outgoing stanza — matching WA Web behaviour. tctoken always takes priority; cstoken only fires as a fallback. |
| **Meta AI (`sendMetaAI`)** | New `sock.sendMetaAI(text, opts?)` function. Sends to the Hatch bot JID (`1807055946647697@s.whatsapp.net`) with all required proto fields: `ContextInfo.isSupportAiMessage = true`, `botMessageInvokerJid`, `botTargetId`, `BotMetadata.personaId = "meta_ai"`, `invokerJid`, `aiConversationContext`. Responses arrive as normal `messages.upsert` events. Pass `opts.conversationContext` (bytes from a previous AI reply's `botMetadata.aiConversationContext`) for multi-turn conversations. |

---

## Updated — 2026-07-03

| Area | What changed |
| --- | --- |
| **WAProto** | Updated to 2.3000.1042596003: `BackupTerminate` and `BackupVideoState` message types added. |
| **Interop** | `masqueradeAsPrimary` commented with root-cause note (401 on groups). Interop opt-in now always logs a warning that inbound messages won't arrive without device-0 fan-out. `initInterop()` gated on `creds.interopEnabled` (undefined = always run; `false` = skip reconnects). `presence.update` and `interop.fbid-update` events carry `isIosInterop` from `creds.interopIosEnabled`. USync `stella_addressbook_restriction_type` surfaced on contact nodes. |
| **frskmsg / group decrypt** | Enc nodes sorted so `pkmsg`/`msg` is processed before `skmsg`/`frskmsg` in the same stanza — fixes cases where SenderKeyDistributionMessage wasn't installed before GroupCipher.decrypt. `fastRatchetKeySenderKeyDistributionMessage` (proto field 15) now handled instead of silently dropped. |
| **ABProps** | `fetchABProps()` wired into `executeInitQueries`. Stella flags emit `interop.feature-update`. Media AB props (`hd_image_dual_upload`, `hd_video_dual_upload`, `hevc_video_dual_upload`, `partial_pjpeg_enabled`, `multi_scan_pjpeg`, `media_poll`) cached in `creds.mediaAbProps` and consumed by media download. |
| **Signal / prekeys** | `key_cipher_suite` attr (`0x05` = Curve25519, `0x2a` = Kyber-1024) read from incoming `<key>`/`<skey>` nodes in `injectE2ESessions` and written on outgoing prekey upload nodes. |
| **Groups** | `membershipApprovalMode`, `joinPermissions`, `isDefaultSubgroup`, `isGeneralSubgroup`, `isHiddenSubgroup` on group metadata; `uuid` field on participants. Communities: `linkLimit` from `parent_group_link_limit`; `suspendAppealStatus`, `allowMemberSuggestM3/ForAdmin`, `subgroupPollInterval`; all 4 MEX query functions now parse responses; duplicate method definitions removed; participant `pn`/`lid` fields extracted. |
| **Privacy** | `fetchPrivacySettings` now parses `online`, `enhanced_block`, `mdPrivacyV2`, `syncdClearChat`, `syncdAntiTamperingEnabled`, `keyRotationEnabled` — stored in `creds.privacySettings` + `settings.update`. Blocklist fetch emits `blocklist.set`. `storePrivacyTokens` helper persists per-contact tokens. `executeUSyncQuery` wrapper auto-stores tokens and emits `contacts.update` for blocked-by entries. Blocked-by detection from USync error codes 401/403/405. |
| **Presence** | `presenceSubscribe(jid, opts)` accepts `presenceType`, `presenceName`, `groupJid`; attaches stored privacy tokens as `<privacy_token>` child. |
| **VoIP / call signalling** | Full signal type coverage: 13→preaccept, 15→video_state, 17→group_info, 20→video_state_ack, 21→flow_control, 23→accept_ack, 1002/1007→peer_state, 1008→enc_rekey. Extended terminate reasons: `RejectDoNotDisturb`, `MicPermissionDenied`, `CameraPermissionDenied`, `RemoteBusy`, `RemoteOffline`. `mute_v2` added to `CALL_STATE_TAGS`; `call.muted` bool extracted from attrs/`<audio>` child; signal type 12 → mute. |
| **Call offer callKey** | Incoming `<call><offer>` Signal-decrypts `<enc>` child to extract SRTP session key. `call.callKey` (Buffer) on the `call` event. |
| **Waiting room** | `<waiting_room_request>` parsed: `call.status = 'waiting_room_request'`, `call.peerJid` from stanza. Registered in `CALL_STATE_TAGS` and the `CB:` loop. |
| **Newsletter** | `NewsletterRole`, `NewsletterState`, `NewsletterReactionSetting` enums exported. `enrichNewsletterMetadata` adds `role`, `newsletterState`, `reactionSetting`, `dsaEligibilityCountries`, `dsaDecision`, `pinnedMessage`, `hasQuestionsFeature`, `hasMusicFeature`, `viewsCount`, `subscriberCount`. DSA country deduplication across two server fields. `CB:status` handler for server-pushed newsletter status stanzas (text/media/reaction/revoke): parses `server_id`, `t`, `<meta>` edit timestamps + `interaction_type`, engagement counters; ACKs and emits `newsletter.status`. |
| **Message decode** | `story_reply`, `feed_reshare`, `native_flow_response`, `companion_enc_static`, `avatar_sticker`, `genai_sticker`, `account_authentication_request`, `motion_video`, `motion_photo` routed through unicast decrypt. Post-decode tags: XMA, `native_flow_response`, `call_permission_request`, product/order/catalog, `isAvatarSticker`, `isAiSticker`, `viewOnceType`, `verifiedNameLevel`. New types: `StickerPackMessage`, `SplitPaymentMessage`, `PaymentInviteMessage`, `PaymentReminderMessage`, `AIMediaCollection`; `nativeFlowResponse` with `name=md_smb_quick_reply` → `smbQuickReply`. Payment types tagged with `paymentInfo`. `isHostedDevice` for `@hosted`/`@hosted.lid` senders; `isNonE2EE` for plaintext enc. |
| **Media** | `getMediaProp()` reads `creds.mediaAbProps`. Download tries directPath-derived URL first, falls back to `mediaUrl`. PJPEG progressive headers (`X-WhatsApp-PJPEG`, `X-WhatsApp-Multi-Scan-PJPEG`) sent when AB props enabled. Public `downloadMediaChunk(msg, type, start, end)` and `streamMediaChunks(msg, type, opts)` async generator for progressive/chunked downloads. |
| **Business** | `fetchBusinessProfile` parses `verified_name` cert. USync business protocol extracts `businessHours` (structured), `businessAddress`, `catalogStatus`, `cartEnabled`, `webCartEnabled`, `commerceExperience`. |
| **JID** | `BOT_WHATSAPP_NET` constant; `WAJIDDomains.BOT`; `jidDecode` handles `@bot.whatsapp.net`; `isJidBot` covers both `@bot` and `@bot.whatsapp.net`; `isJidLid` alias. |
| **USync** | `USyncUser.withTcToken()` + `USyncStatusProtocol` sends `<tctoken>` per user in status queries. `USyncFeatureProtocol` camelCase key mapping for `encrypt_v2`, `voip_legacy`, `multi_agent`, `bot_eligible`. `USyncDisappearingModeProtocol` returns raw Unix timestamp instead of Date. |
| **Status privacy** | `sendMessage(jid, content, { statusPrivacy: 'contacts' \| 'allowlist' \| 'denylist' })` appends `<meta status_setting="..." session_scope="status">` to `status@broadcast` sends. |
| **WAM telemetry** | `Login` and `WebcSocketConnect` events fired and flushed after `CB:success`. 30s periodic flush; cleared on disconnect. |
| **Android / iOS browser** | `Browsers.android()` / `Browsers.iOS()` set correct `UserAgent.Platform` and skip `webInfo`. |
| **historySyncConfig** | All `IHistorySyncConfig` fields: `supportManusHistory`, `supportHatchHistory`, `supportInlineContacts`, `supportGuestChat`, `supportGroupHistory`, `supportCallLogHistory`, numeric limits. |
| **MEX dataPath fixes** | 9 wrong `xwa2_` dataPath strings in `registration.js`; 3 undefined `CLIENT_PERSIST_GQL_IDS` refs in `graphql.js`; 2 WAMO ops added. |
| **Code structure** | `Utils/messages.js` split into `messages.js` + `message-inspect.js`. Duplicate WAProto require removed. |
| **Tests** | 4 fixed: `preaccept` call status, `USyncDisappearingModeProtocol.setAt`, `USYNC_FEATURES` count. |

## Updated — 2026-06-30

| Area                       | What changed                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Username** (`@username`) | All 6 MEX query IDs corrected from WA 2.26.26.4 APK assets + live Frida capture. Two-step check→reserve flow with shared `session_id` documented. `reserved: true` fixed. |
| **Interop**                | All 7 MEX query IDs corrected from WA 2.26.26.4 APK assets (all were off by 1–2). Source file table added to INTEROP.md.                                                  |
| **Docs**                   | INTEROP.md and USERNAME.md rewritten with real stanza examples and verified IDs.                                                                                          |

---

## Index

- [What's Different](#whats-different)
- [Installation](#installation)
- [Connecting Account](#connecting-account)
  - [QR Code](#qr-code)
  - [Pairing Code](#pairing-code)
  - [Receive Full History](#receive-full-history)
- [Socket Config Notes](#socket-config-notes)
- [Saving & Restoring Sessions](#saving--restoring-sessions)
- [Handling Events](#handling-events)
- [Anti-Ban System](#anti-ban-system)
  - [RateLimiter](#ratelimiter--throttle-outbound-messages)
  - [WarmUp](#warmup--gradual-daily-limit-increase-for-new-numbers)
  - [HealthMonitor](#healthmonitor--detect-ban-risk)
  - [TimelockGuard](#timelockguard--handle-wa-463-reachout-blocks)
  - [PresenceChoreographer](#presencechoreographer--human-like-typing-simulation)
  - [wrapSocket](#wrapsocket--apply-all-anti-ban-layers-at-once)
- [Sending Messages](#sending-messages)
  - [Text & Basic](#text--basic)
  - [Buttons & Interactive](#buttons--interactive)
  - [Media](#media)
  - [Meta AI / Rich Responses](#meta-ai--rich-responses)
  - [Status / Stories](#status--stories)
- [Modifying Messages](#modifying-messages)
- [Manipulating Media](#manipulating-media)
- [Groups](#groups)
- [Privacy](#privacy)
- [User Queries](#user-queries)
- [Change Profile](#change-profile)
- [Chat Modifiers](#chat-modifiers)
- [MEX — WhatsApp's Internal GraphQL](#mex--whatsapps-internal-graphql)
- [Writing Custom Functionality](#writing-custom-functionality)
- [Rust WASM Bridge](#rust-wasm-bridge)

---

## MEX — WhatsApp's Internal GraphQL

All WhatsApp features (privacy, passkeys, profiles, usernames, integrity checks, …) run over MEX — WhatsApp's GraphQL-over-WebSocket protocol. Every method is available directly on your socket:

```js
// Privacy
await sock.setPrivacySetting('LAST_SEEN', 'CONTACTS') // UPPERCASE enums
await sock.updateGroupsAddPrivacy('contact_blacklist') // lowercase IQ helpers also available

// Contact integrity — verify a JID is on WhatsApp before opening a chat
const result = await sock.contactIntegrityQuery(['491234567890@s.whatsapp.net'])

// Username lookup
const user = await sock.findUserByUsername('baron')
// { jid: '49123456789@s.whatsapp.net', contact: false } or null

// About text
const abouts = await sock.getTextStatusList(['491234567890@s.whatsapp.net'])

// Error handling — all MEX methods throw Boom on failure
try {
	await sock.setPrivacySetting('LAST_SEEN', 'NONE')
} catch (err) {
	// err.output.statusCode: 400 bad request, 403 not available, 404 not found
}
```

See [MEX.md](documentation/MEX.md) for full documentation.

---

## Feature Documentation

| Topic                                                                      | File                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| MEX — WhatsApp's internal GraphQL protocol                                 | [MEX.md](documentation/MEX.md)                         |
| USync — Bulk user data queries (devices, status, picture, LID)             | [USYNC.md](documentation/USYNC.md)                     |
| HTTPS GraphQL — Meta AI, Events, Payments                                  | [GRAPHQL.md](documentation/GRAPHQL.md)                 |
| Privacy, Profile & Account                                                 | [PRIVACY.md](documentation/PRIVACY.md)                 |
| Registration, Passkeys & Account Management                                | [REGISTRATION.md](documentation/REGISTRATION.md)       |
| Managed Accounts, Payments Passkey & IPLS                                  | [MANAGED-ACCOUNT.md](documentation/MANAGED-ACCOUNT.md) |
| Communities & AI Groups                                                    | [COMMUNITIES.md](documentation/COMMUNITIES.md)         |
| Interoperability (BirdyChat, Haiket, DMA)                                  | [INTEROP.md](documentation/INTEROP.md)                 |
| Username (`@username`)                                                     | [USERNAME.md](documentation/USERNAME.md)               |
| Anti-Ban System                                                            | [ANTIBAN.md](documentation/ANTIBAN.md)                 |
| Ban & Enforcement System (APK internals)                                   | [BAN-SYSTEM.md](documentation/BAN-SYSTEM.md)           |
| WhatsApp Protocol Reference (APK namespaces)                               | [PROTOCOLS.md](documentation/PROTOCOLS.md)             |
| WA-Web Protocol Port (chat-block, call links, group settings, coexistence) | [WA-WEB-PORT.md](documentation/WA-WEB-PORT.md)         |

---

## What's Different

**Performance — Rust WASM**

| Area              | Upstream Baileys | This fork |
| ----------------- | ---------------- | --------- |
| Binary decode     | JS               | Rust WASM |
| Noise handshake   | JS               | Rust WASM |
| AES / HMAC / HKDF | JS (`crypto`)    | Rust WASM |
| Signal protocol   | `libsignal-node` | Rust WASM |

**Extra Features**

| Feature                   | Notes                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meta AI / msmsg decrypt   | Full `messageSecret`-encrypted AI message decryption                                                                                                                                                                                       |
| Meta AI message handling  | Receive and process Meta AI bot responses                                                                                                                                                                                                  |
| Rich AI composer          | Send tables, lists, code blocks, LaTeX via Meta AI format                                                                                                                                                                                  |
| Interactive buttons       | List, reply, template, cards, product list, PIX/PAY                                                                                                                                                                                        |
| Interop (FB/IG)           | Near-parity with mobile & web for cross-platform JIDs                                                                                                                                                                                      |
| Anti-ban measures         | Connection fingerprinting aligned with official clients                                                                                                                                                                                    |
| Album messages            | Send multiple media as an album                                                                                                                                                                                                            |
| Sticker packs             | Sticker pack message support                                                                                                                                                                                                               |
| Newsletter messages       | Follower invite messages                                                                                                                                                                                                                   |
| WA-Web protocol port      | Chat-block toggle, call-link waiting room, community sub-group ops, group sharing settings, spam reporting, TOS acceptance, mex group/newsletter events, account dirty/device-sync events — [WA-WEB-PORT.md](documentation/WA-WEB-PORT.md) |
| Top-level call signalling | Emits `call` for both `<call>`-wrapped and top-level `<offer>`/`<terminate>` stanzas (+ acks them)                                                                                                                                         |
| Call `callKey`            | Incoming offer `<enc>` Signal-decrypted; `call.callKey` (raw SRTP key bytes) populated on the `call` event                                                                                                                                 |
| Waiting room              | `call.status = 'waiting_room_request'` + `call.peerJid` when a participant enters a call link's waiting room                                                                                                                               |
| Newsletter status recv    | `newsletter.status` event for server-pushed `<status>` stanzas: text/media/reaction/revoke, engagement counters, edit timestamps                                                                                                           |
| Status audience privacy   | `sendMessage(jid, content, { statusPrivacy: 'contacts' \| 'allowlist' \| 'denylist' })` controls who receives a status broadcast                                                                                                           |
| WAM telemetry             | `Login` and `WebcSocketConnect` WAM events fired after connect; 30s periodic flush to `w:stats` IQ                                                                                                                                         |

---

## Installation

```bash
npm install github:7ucg/baron-baileys-v2
# or
yarn add github:7ucg/baron-baileys-v2
```

**Requirements:** Node.js ≥ 20

**Optional peer dependencies:**

| Package           | Purpose                       |
| ----------------- | ----------------------------- |
| `sharp`           | Image processing / thumbnails |
| `jimp`            | Fallback image processing     |
| `audio-decode`    | Voice message metadata        |
| `link-preview-js` | Link preview generation       |

---

## Connecting Account

### QR Code

```js
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baron-baileys-v2')
const { Boom } = require('@hapi/boom')

const { state, saveCreds } = await useMultiFileAuthState('./auth')

const sock = makeWASocket({ auth: state, printQRInTerminal: true })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
	if (connection === 'close') {
		const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
		if (shouldReconnect) connect()
	}
})
```

### Pairing Code

```js
const sock = makeWASocket({ auth: state, printQRInTerminal: false })

if (!state.creds.registered) {
	const code = await sock.requestPairingCode('49123456789') // phone number without +
	console.log('Pairing code:', code)
}
```

### Receive Full History

```js
const sock = makeWASocket({
	auth: state,
	syncFullHistory: true
})
```

---

## Socket Config Notes

```js
const sock = makeWASocket({
	auth: state,

	// Cache group metadata to reduce WA queries (recommended)
	cachedGroupMetadata: async jid => groupCache.get(jid),

	// Improve retry system and enable poll vote decryption
	getMessage: async key => store.getMsg(key),

	// Suppress notifications on the phone while connected
	markOnlineOnConnect: false
})
```

---

## Saving & Restoring Sessions

```js
const { useMultiFileAuthState } = require('baron-baileys-v2')

const { state, saveCreds } = await useMultiFileAuthState('./auth')
// Pass state to makeWASocket, call saveCreds on creds.update
sock.ev.on('creds.update', saveCreds)
```

---

## Handling Events

### Messages

```js
// New or received messages
sock.ev.on('messages.upsert', ({ messages, type }) => {})

// Status updates (read receipts, delivery, edits, reactions)
sock.ev.on('messages.update', updates => {})

// Message deleted / cleared
sock.ev.on('messages.delete', ({ keys }) => {})

// Media decryption key update
sock.ev.on('messages.media-update', updates => {})

// Reaction on a message
sock.ev.on('messages.reaction', reactions => {})

// Comment on a message
sock.ev.on('message.comment', ({ message, comment }) => {})

// Message quarantined by WA
sock.ev.on('message.quarantined', ({ message }) => {})

// Poll — new option added
sock.ev.on('poll.add-option', ({ key, senderTimestampMs }) => {})
```

### Chats & Contacts

```js
sock.ev.on('chats.upsert', chats => {})
sock.ev.on('chats.update', chats => {})
sock.ev.on('chats.delete', ids => {})
sock.ev.on('chats.lock', ({ id, locked }) => {})

sock.ev.on('contacts.upsert', contacts => {})
sock.ev.on('contacts.update', contacts => {})

// Blocklist changed
sock.ev.on('blocklist.update', ({ blocklist, type }) => {})
```

### Groups

```js
sock.ev.on('groups.upsert', groups => {})
sock.ev.on('groups.update', updates => {})
sock.ev.on('group-participants.update', ({ id, participants, action }) => {})

// Someone requested to join
sock.ev.on('group.join-request', ({ id, participant, action }) => {})

// Member tag / mention update
sock.ev.on('group.member-tag.update', ({ id, participant }) => {})
```

### Newsletters

```js
sock.ev.on('newsletter-settings.update', update => {})
sock.ev.on('newsletter-participants.update', update => {})
sock.ev.on('newsletter.reaction', update => {})
sock.ev.on('newsletter.view', update => {})
sock.ev.on('newsletter.live-update', update => {})
sock.ev.on('newsletter.pin', update => {})
sock.ev.on('newsletter.invite', update => {})
```

### Connection & Auth

```js
sock.ev.on('connection.update', ({ connection, qr, lastDisconnect, isOnline, reachoutTimeLock }) => {})
sock.ev.on('creds.update', saveCreds)

// Security alert (e.g. linked device removed)
sock.ev.on('security.alert', data => {})

// Identity key change for a contact
sock.ev.on('identity.update', ({ jid }) => {})

// Server config received
sock.ev.on('server.config', config => {})
```

### Calls

```js
// `call` fires for both <call>-wrapped and top-level (<offer>/<terminate>) signalling
sock.ev.on('call', calls => {})
sock.ev.on('call.scheduled', ({ call }) => {})
sock.ev.on('call.schedule-cancelled', ({ call }) => {})

// Call links — create + toggle the link's waiting room
const token = await sock.createCallLink('audio')
await sock.toggleCallLinkWaitingRoom(token, true, 'audio')

// WA-Web coexistence (FB/IG) & business privacy-sync pushes
sock.ev.on('coexistence.update', u => {}) // { kind: 'onboarding' | 'offboarding', status?, productSurface? }
sock.ev.on('business.privacy-settings-sync', s => {})
```

### Labels

```js
sock.ev.on('labels.edit', ({ label }) => {})
sock.ev.on('labels.association', ({ association, type }) => {})
sock.ev.on('labels.reorder', ({ labelIds }) => {})
```

### Presence & Devices

```js
sock.ev.on('presence.update', ({ id, presences }) => {})
sock.ev.on('devices.update', ({ id, devices, isSelf }) => {})
```

### Bot / Meta AI

```js
sock.ev.on('bot.feedback', ({ message }) => {})
sock.ev.on('bot.stop-generation', ({ message }) => {})
sock.ev.on('bot.welcome-request', ({ message }) => {})
sock.ev.on('bot.psi-metadata', ({ message }) => {})
sock.ev.on('bot.query-fanout', ({ message }) => {})
sock.ev.on('bot.media-collection', ({ message }) => {})
sock.ev.on('bot.memu-onboarding', ({ message }) => {})
```

### Sync & Settings

```js
sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {})
sock.ev.on('messaging-history.status', ({ progress, hasMore }) => {})
sock.ev.on('settings.update', ({ setting, value }) => {})
sock.ev.on('lid-mapping.update', ({ lid, pn }) => {})
sock.ev.on('status.psa', ({ message }) => {})
sock.ev.on('status.mention', ({ message }) => {})
sock.ev.on('media.notify', ({ message }) => {})
sock.ev.on('reminder.update', ({ message }) => {})
sock.ev.on('payment.split', ({ message }) => {})
sock.ev.on('payment.reminder', ({ message }) => {})
sock.ev.on('cloud.thread.control', ({ message }) => {})
sock.ev.on('galaxy.flow.completed', ({ message }) => {})
```

### Decrypt Poll Votes

```js
const { getAggregateVotesInPollMessage } = require('baron-baileys-v2')

sock.ev.on('messages.update', async updates => {
	for (const { key, update } of updates) {
		if (update.pollUpdates) {
			const pollCreation = await getMessage(key)
			if (pollCreation) {
				const votes = getAggregateVotesInPollMessage({ message: pollCreation, pollUpdates: update.pollUpdates })
				console.log(votes)
			}
		}
	}
})
```

---

## Anti-Ban System

Import from `baron-baileys-v2/src/antiban.js`:

```js
const {
	AntiBan,
	RateLimiter,
	WarmUp,
	HealthMonitor,
	TimelockGuard,
	ReplyRatioGuard,
	ContactGraphWarmer,
	PresenceChoreographer,
	PostReconnectThrottle,
	RetryReasonTracker,
	LidResolver,
	JidCanonicalizer,
	MessageQueue,
	Scheduler,
	wrapSocket
} = require('baron-baileys-v2/src/antiban')
```

### RateLimiter — throttle outbound messages

```js
const limiter = new RateLimiter({
	maxPerMinute: 15,
	maxPerHour: 500,
	maxPerDay: 3000,
	minDelayMs: 1000,
	maxDelayMs: 4000,
	newChatDelayMs: 2000,
	maxIdenticalMessages: 10 // per 30-minute window
})

const delay = await limiter.getDelay(jid, text)
if (delay === -1) return // blocked
if (delay > 0) await sleep(delay)

await sock.sendMessage(jid, { text })
limiter.record(jid, text)
```

### WarmUp — gradual daily limit increase for new numbers

```js
const warmup = new WarmUp({ warmUpDays: 5, day1Limit: 30, growthFactor: 1.8 })

if (!warmup.canSend()) return
await sock.sendMessage(jid, { text })
warmup.record()

console.log(warmup.getStatus())
// { phase: 'warming', day: 2, totalDays: 5, todayLimit: 54, todaySent: 12, progress: 40 }
```

### HealthMonitor — detect ban risk

```js
const health = new HealthMonitor({ autoPauseAt: 'critical' })

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
	if (connection === 'close') health.recordDisconnect(lastDisconnect?.error)
	if (connection === 'open') health.recordReconnect()
})

const status = health.getStatus()
// { risk: 'low'|'medium'|'high'|'critical', score, recommendation, stats }

if (health.isPaused()) return // auto-pauses at configured risk level
```

### TimelockGuard — handle WA 463 reachout blocks

```js
const guard = new TimelockGuard()

// Feed connection.update events
sock.ev.on('connection.update', ({ reachoutTimeLock }) => {
	if (reachoutTimeLock) guard.onTimelockUpdate(reachoutTimeLock)
})

// Check before sending to new contacts
const { allowed, reason } = guard.canSend(jid)
if (!allowed) return console.log(reason)
```

### PresenceChoreographer — human-like typing simulation

```js
const choreo = new PresenceChoreographer({
	enabled: true,
	typingWPM: 45,
	enableCircadianRhythm: true,
	timezone: 'Europe/Berlin'
})

const plan = choreo.computeTypingPlan(text.length)
await choreo.executeTypingPlan(sock, jid, plan)
await sock.sendMessage(jid, { text })
```

### wrapSocket — apply all anti-ban layers at once

```js
const { wrapSocket } = require('baron-baileys-v2/src/antiban')

// 'moderate' is the default — use 'conservative' or 'aggressive' to tune
const wrappedSock = wrapSocket(sock, 'moderate')
// All outbound sendMessage calls are now automatically rate-limited,
// presence-simulated, and timelock-aware.

// Or pass individual overrides:
const wrappedSock2 = wrapSocket(sock, { preset: 'moderate', maxPerMinute: 20 })
```

---

## Sending Messages

### Text & Basic

```js
// Text
await sock.sendMessage(jid, { text: 'Hello!' })

// Quote
await sock.sendMessage(jid, { text: 'Reply' }, { quoted: msg })

// Mention
await sock.sendMessage(jid, { text: '@49123456789', mentions: ['49123456789@s.whatsapp.net'] })

// Forward
await sock.sendMessage(jid, { forward: msg })

// Location
await sock.sendMessage(jid, { location: { degreesLatitude: 52.5, degreesLongitude: 13.4 } })

// Live Location
await sock.sendMessage(jid, {
	liveLocation: { degreesLatitude: 52.5, degreesLongitude: 13.4 },
	accuracyInMeters: 10,
	speedInMps: 0,
	degreesClockwisefromMagneticNorth: 0,
	caption: 'Live',
	sequenceNumber: 1
})

// Contact
await sock.sendMessage(jid, { contacts: { displayName: 'Name', contacts: [{ vcard: '...' }] } })

// Reaction
await sock.sendMessage(jid, { react: { text: '👍', key: msg.key } })

// Pin
await sock.sendMessage(jid, { pin: { type: 1, time: 86400, key: msg.key } })

// Poll
await sock.sendMessage(jid, {
	poll: { name: 'Vote?', values: ['Yes', 'No'], selectableCount: 1 }
})

// Call
await sock.sendMessage(jid, { call: { callId: '...', callType: 'audio' } })
```

### Buttons & Interactive

```js
// Reply buttons
await sock.sendMessage(jid, {
	buttonsMessage: {
		text: 'Choose:',
		buttons: [
			{ buttonId: '1', buttonText: { displayText: 'Option A' } },
			{ buttonId: '2', buttonText: { displayText: 'Option B' } }
		]
	}
})

// List message
await sock.sendMessage(jid, {
	listMessage: {
		title: 'Menu',
		description: 'Pick one',
		buttonText: 'Open',
		listType: 1,
		sections: [
			{
				title: 'Section',
				rows: [{ title: 'Item 1', rowId: 'item1' }]
			}
		]
	}
})

// Template buttons
await sock.sendMessage(jid, {
	templateMessage: {
		hydratedTemplate: {
			hydratedContentText: 'Hello',
			hydratedButtons: [
				{ quickReplyButton: { displayText: 'Yes', id: 'yes' } },
				{ urlButton: { displayText: 'Visit', url: 'https://example.com' } }
			]
		}
	}
})

// Interactive message
await sock.sendMessage(jid, {
	interactiveMessage: {
		body: { text: 'Choose' },
		footer: { text: 'Footer' },
		nativeFlowMessage: {
			buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Yes', id: 'yes' }) }]
		}
	}
})
```

### Media

```js
// Image
await sock.sendMessage(jid, { image: { url: './image.jpg' }, caption: 'Caption' })

// Video
await sock.sendMessage(jid, { video: { url: './video.mp4' }, caption: 'Video' })

// Audio
await sock.sendMessage(jid, { audio: { url: './audio.mp3' }, mimetype: 'audio/mp4' })

// Voice note (PTT)
await sock.sendMessage(jid, { audio: { url: './audio.ogg' }, mimetype: 'audio/ogg; codecs=opus', ptt: true })

// GIF
await sock.sendMessage(jid, { video: { url: './anim.mp4' }, gifPlayback: true })

// PTV (video note)
await sock.sendMessage(jid, { video: { url: './clip.mp4' }, ptv: true })

// View once
await sock.sendMessage(jid, { image: { url: './secret.jpg' }, viewOnce: true })

// Album
await sock.sendAlbumMessage(
	jid,
	[{ image: { url: './1.jpg' } }, { image: { url: './2.jpg' } }, { video: { url: './3.mp4' } }],
	{ caption: 'Album' }
)
```

### Meta AI / Rich Responses

```js
// Send a message to Meta AI (Hatch bot) and receive the reply via messages.upsert
const msgId = await sock.sendMetaAI('Was ist die Hauptstadt von Deutschland?')

// Multi-turn: pass aiConversationContext from the previous AI reply
let conversationCtx
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const msg of messages) {
    if (msg.key.remoteJid !== '1807055946647697@s.whatsapp.net') continue
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text
    if (text) console.log('[Meta AI]', text)
    const ctx = msg.message?.messageContextInfo?.botMetadata?.aiConversationContext
    if (ctx?.length) conversationCtx = ctx
  }
})

// Follow-up in the same conversation thread
await sock.sendMetaAI('Und die Bevölkerung?', { conversationContext: conversationCtx })

// Rich AI response (table, list, code, LaTeX)
await sock.sendRichAIResponse(jid, {
	table: {
		headers: ['Name', 'Value'],
		rows: [
			['Foo', '1'],
			['Bar', '2']
		]
	}
})

await sock.sendRichAIResponse(jid, {
	list: { items: ['Item 1', 'Item 2', 'Item 3'] }
})

await sock.sendRichAIResponse(jid, {
	codeBlock: { language: 'js', code: 'console.log("hello")' }
})

await sock.sendRichAIResponse(jid, {
	latex: 'E = mc^2'
})

// Capture & resend a Meta AI unified response
await sock.captureAndResendUnifiedResponse(jid, metaAiMsg)
```

### Status / Stories

```js
// Status with mentions
await sock.sendMessage('status@broadcast', {
	text: 'Hello @49123',
	mentions: ['49123@s.whatsapp.net'],
	statusMentionedJids: ['49123@s.whatsapp.net']
})

// Status sticker interaction
await sock.sendMessage('status@broadcast', {
	stickerInteraction: { sticker: { url: './sticker.webp' }, reactionKey: msg.key }
})

// Quote a status
await sock.sendMessage(jid, { text: 'Reply to status' }, { quoted: statusMsg })
```

---

## Modifying Messages

```js
// Delete for everyone
await sock.sendMessage(jid, { delete: msg.key })

// Edit
await sock.sendMessage(jid, { edit: msg.key, text: 'Updated text' })
```

---

## Manipulating Media

```js
const { downloadMediaMessage } = require('baron-baileys-v2')

// Download
const buffer = await downloadMediaMessage(msg, 'buffer', {})

// Re-upload to WhatsApp
const { url } = await sock.waUploadToServer(buffer, { mimetype: 'image/jpeg' })
```

---

## Groups

```js
// Create
const group = await sock.groupCreate('Name', ['49123@s.whatsapp.net'])

// Add / Remove / Promote / Demote
await sock.groupParticipantsUpdate(jid, ['49123@s.whatsapp.net'], 'add') // add | remove | promote | demote

// Change name
await sock.groupUpdateSubject(jid, 'New Name')

// Change description
await sock.groupUpdateDescription(jid, 'Description')

// Change settings
await sock.groupSettingUpdate(jid, 'announcement') // announcement | not_announcement | locked | unlocked

// Leave
await sock.groupLeave(jid)

// Invite link
const code = await sock.groupInviteCode(jid)
await sock.groupRevokeInvite(jid)
await sock.groupAcceptInvite(code)

// Metadata (now also returns memberShareHistoryMode, memberLinkMode, limitSharing)
const meta = await sock.groupMetadata(jid)

// Join requests
const requests = await sock.groupRequestParticipantsList(jid)
await sock.groupRequestParticipantsUpdate(jid, ['49123@s.whatsapp.net'], 'approve') // approve | reject

// All groups
const all = await sock.groupFetchAllParticipating()

// Ephemeral
await sock.groupToggleEphemeral(jid, 86400) // seconds, 0 = off

// Acknowledge a group
await sock.groupAcknowledge(jid)

// Communities — linked/sub-group participants, join a sub-group, batch profile pictures
const linkedParts = await sock.groupGetLinkedParticipants(communityJid)
await sock.groupJoinLinked(communityJid, subGroupJid)
const pics = await sock.getGroupProfilePictures([jid1, jid2], 'preview')
```

---

## Privacy

```js
// Block / Unblock
await sock.updateBlockStatus(jid, 'block') // block | unblock

// Get settings
const privacy = await sock.fetchPrivacySettings()
// { last: 'all', online: 'all', profile: 'contacts', groupadd: 'all', calladd: 'all', ... }

// Force fresh fetch (bypass cache)
const fresh = await sock.fetchPrivacySettings(true)

// Get blocklist
const list = await sock.fetchBlocklist()

// Update individual settings (IQ-based, lowercase values, works on all accounts)
await sock.updateLastSeenPrivacy('contacts') // all | contacts | contact_blacklist | none
await sock.updateOnlinePrivacy('all')
await sock.updateProfilePicturePrivacy('contacts')
await sock.updateStatusPrivacy('contacts')
await sock.updateReadReceiptsPrivacy('all')
await sock.updateGroupsAddPrivacy('contacts')
await sock.updateCallPrivacy('all')
await sock.updateDefaultDisappearingMode(86400) // seconds, 0 = off

// Set via MEX GraphQL (UPPERCASE values required)
await sock.setPrivacySetting('LAST_SEEN', 'CONTACTS')
await sock.setPrivacySetting('GROUPS', 'CONTACT_BLACKLIST')
await sock.setPrivacySetting('CALLS', 'NONE')

// Manage contact lists for CONTACT_BLACKLIST / CONTACTS settings
await sock.updatePrivacyContactList('groupadd', 'contact_blacklist', [jid1, jid2])
const current = await sock.getPrivacyContactList('groupadd', 'contact_blacklist')

// "Block messages from unknown accounts" toggle (WA Web w:comms:chat)
const blockStatus = await sock.getChatBlockingStatus() // 'blocked' | 'unblocked'
await sock.updateChatBlockingStatus('block') // block | unblock

// Pending TOS disclosures · feature opt-out list · push config
const notices = await sock.getUserDisclosures()
const optOut = await sock.getOptOutList()
const push = await sock.getPushConfig()
```

See [MEX.md](documentation/MEX.md) for full MEX usage and error handling.

---

## User Queries

```js
// Check if number exists on WA
const results = await sock.onWhatsApp('49123456789')
// results[0] === { jid: '49123456789@s.whatsapp.net', exists: true }

// Profile picture
const ppUrl = await sock.profilePictureUrl(jid, 'image')

// Status text (legacy)
const status = await sock.fetchStatus(jid)

// About text (MEX)
const abouts = await sock.getTextStatusList([jid])
// [{ jid, text: 'Hey there!', emoji: '👋', timestamp: 1234567890 }]

// Business profile
const biz = await sock.getBusinessProfile(jid)

// Presence (typing/online)
await sock.subscribePresence(jid)
sock.ev.on('presence.update', ({ id, presences }) => {})

// Chat history
await sock.fetchMessageHistory(50, oldestMsg.key, oldestMsg.messageTimestamp)

// Find user by @username
const user = await sock.findUserByUsername('someusername')
// { jid: '49123456789@s.whatsapp.net', contact: false } or null

// Verify a JID before opening a chat
const integrity = await sock.contactIntegrityQuery([jid])
```

---

## Change Profile

```js
// Status
await sock.updateProfileStatus('My status')

// Name
await sock.updateProfileName('New Name')

// Picture
await sock.updateProfilePicture(jid, { url: './photo.jpg' })

// Remove picture
await sock.removeProfilePicture(jid)
```

---

## Chat Modifiers

```js
// Archive
await sock.chatModify({ archive: true, lastMessages: [msg] }, jid)

// Mute (ms timestamp)
await sock.chatModify({ mute: Date.now() + 8 * 60 * 60 * 1000 }, jid)

// Mark read/unread
await sock.chatModify({ markRead: false, lastMessages: [msg] }, jid)

// Delete message for me
await sock.chatModify({ clear: { messages: [{ id: msg.key.id, fromMe: msg.key.fromMe }] } }, jid)

// Delete chat
await sock.chatModify({ delete: true, lastMessages: [msg] }, jid)

// Star / Unstar
await sock.chatModify({ star: { messages: [{ id: msg.key.id, fromMe: msg.key.fromMe }], star: true } }, jid)

// Disappearing messages
await sock.sendMessage(jid, { disappearingMessagesInChat: 86400 })
```

---

## Writing Custom Functionality

```js
// Enable debug logs
const sock = makeWASocket({ logger: pino({ level: 'debug' }) })

// Raw websocket events
sock.ws.on('CB:message', node => console.log(node))

// Register callback for specific WA nodes
sock.ws.on('CB:iq,,result', node => {})
```

---

## Rust WASM Bridge

The native module lives at [7ucg/whatsapp-rust-bridge](https://github.com/7ucg/whatsapp-rust-bridge).  
Pre-built and bundled — **no Rust toolchain needed** to use this package.

Functions offloaded to Rust:

| Function                          | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `decodeNode`                      | WABinary protocol decoding                       |
| `NoiseSession`                    | Noise_XX_25519_AESGCM_SHA256 handshake + framing |
| `hkdf`                            | HKDF key derivation                              |
| `hmacSign`                        | HMAC-SHA256 signing                              |
| `sha256`                          | SHA-256 hashing                                  |
| `aesEncrypt` / `aesDecrypt`       | AES-256-CBC                                      |
| `aesEncryptGCM` / `aesDecryptGCM` | AES-256-GCM                                      |
| `aesEncryptCTR` / `aesDecryptCTR` | AES-256-CTR                                      |

---

## License

MIT
