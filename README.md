# baron-baileys-v2

A high-performance WhatsApp Web library built on [Baileys](https://github.com/WhiskeySockets/Baileys), with critical paths accelerated via a [Rust WASM bridge](https://github.com/7ucg/whatsapp-rust-bridge).

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
- [Writing Custom Functionality](#writing-custom-functionality)
- [Rust WASM Bridge](#rust-wasm-bridge)

---

## What's Different

**Performance — Rust WASM**

| Area | Upstream Baileys | This fork |
|---|---|---|
| Binary decode | JS | Rust WASM |
| Noise handshake | JS | Rust WASM |
| AES / HMAC / HKDF | JS (`crypto`) | Rust WASM |
| Signal protocol | `libsignal-node` | Rust WASM |

**Extra Features**

| Feature | Notes |
|---|---|
| Meta AI / msmsg decrypt | Full `messageSecret`-encrypted AI message decryption |
| Meta AI message handling | Receive and process Meta AI bot responses |
| Rich AI composer | Send tables, lists, code blocks, LaTeX via Meta AI format |
| Interactive buttons | List, reply, template, cards, product list, PIX/PAY |
| Interop (FB/IG) | Near-parity with mobile & web for cross-platform JIDs |
| Anti-ban measures | Connection fingerprinting aligned with official clients |
| Album messages | Send multiple media as an album |
| Sticker packs | Sticker pack message support |
| Newsletter messages | Follower invite messages |

---

## Installation

```bash
npm install github:7ucg/baron-baileys-v2
# or
yarn add github:7ucg/baron-baileys-v2
```

**Requirements:** Node.js ≥ 20

**Optional peer dependencies:**

| Package | Purpose |
|---|---|
| `sharp` | Image processing / thumbnails |
| `jimp` | Fallback image processing |
| `audio-decode` | Voice message metadata |
| `link-preview-js` | Link preview generation |

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
    cachedGroupMetadata: async (jid) => groupCache.get(jid),

    // Improve retry system and enable poll vote decryption
    getMessage: async (key) => store.getMsg(key),

    // Suppress notifications on the phone while connected
    markOnlineOnConnect: false,
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

```js
// New/updated messages
sock.ev.on('messages.upsert', ({ messages, type }) => { })

// Message updates (read receipts, reactions, edits)
sock.ev.on('messages.update', updates => { })

// Chat list updates
sock.ev.on('chats.update', chats => { })

// Contacts
sock.ev.on('contacts.update', contacts => { })

// Group participant changes
sock.ev.on('group-participants.update', ({ id, participants, action }) => { })

// Presence (typing, online)
sock.ev.on('presence.update', ({ id, presences }) => { })

// Connection state
sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => { })
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
        sections: [{
            title: 'Section',
            rows: [{ title: 'Item 1', rowId: 'item1' }]
        }]
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
await sock.sendAlbumMessage(jid, [
    { image: { url: './1.jpg' } },
    { image: { url: './2.jpg' } },
    { video: { url: './3.mp4' } }
], { caption: 'Album' })
```

### Meta AI / Rich Responses

```js
// Rich AI response (table, list, code, LaTeX)
await sock.sendRichAIResponse(jid, {
    table: { headers: ['Name', 'Value'], rows: [['Foo', '1'], ['Bar', '2']] }
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
await sock.groupParticipantsUpdate(jid, ['49123@s.whatsapp.net'], 'add')    // add | remove | promote | demote

// Change name
await sock.groupUpdateSubject(jid, 'New Name')

// Change description
await sock.groupUpdateDescription(jid, 'Description')

// Change settings
await sock.groupSettingUpdate(jid, 'announcement')  // announcement | not_announcement | locked | unlocked

// Leave
await sock.groupLeave(jid)

// Invite link
const code = await sock.groupInviteCode(jid)
await sock.groupRevokeInvite(jid)
await sock.groupAcceptInvite(code)

// Metadata
const meta = await sock.groupMetadata(jid)

// Join requests
const requests = await sock.groupRequestParticipantsList(jid)
await sock.groupRequestParticipantsUpdate(jid, ['49123@s.whatsapp.net'], 'approve')  // approve | reject

// All groups
const all = await sock.groupFetchAllParticipating()

// Ephemeral
await sock.groupToggleEphemeral(jid, 86400)  // seconds, 0 = off
```

---

## Privacy

```js
// Block / Unblock
await sock.updateBlockStatus(jid, 'block')  // block | unblock

// Get settings
const privacy = await sock.fetchPrivacySettings()

// Get blocklist
const list = await sock.fetchBlocklist()

// Update individual settings
await sock.updateLastSeenPrivacy('contacts')           // all | contacts | contact_blacklist | none
await sock.updateOnlinePrivacy('all')
await sock.updateProfilePicturePrivacy('contacts')
await sock.updateStatusPrivacy('contacts')
await sock.updateReadReceiptsPrivacy('all')
await sock.updateGroupsAddPrivacy('contacts')
await sock.updateDefaultDisappearingMode(86400)
```

---

## User Queries

```js
// Check if number exists on WA
const [result] = await sock.onWhatsApp('49123456789')
console.log(result.exists, result.jid)

// Profile picture
const ppUrl = await sock.profilePictureUrl(jid, 'image')

// Status text
const status = await sock.fetchStatus(jid)

// Business profile
const biz = await sock.getBusinessProfile(jid)

// Presence (typing/online)
await sock.subscribePresence(jid)
sock.ev.on('presence.update', ({ id, presences }) => { })

// Chat history
await sock.fetchMessageHistory(50, oldestMsg.key, oldestMsg.messageTimestamp)
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
sock.ws.on('CB:iq,,result', node => { })
```

---

## Rust WASM Bridge

The native module lives at [7ucg/whatsapp-rust-bridge](https://github.com/7ucg/whatsapp-rust-bridge).  
Pre-built and bundled — **no Rust toolchain needed** to use this package.

Functions offloaded to Rust:

| Function | Description |
|---|---|
| `decodeNode` | WABinary protocol decoding |
| `NoiseSession` | Noise_XX_25519_AESGCM_SHA256 handshake + framing |
| `hkdf` | HKDF key derivation |
| `hmacSign` | HMAC-SHA256 signing |
| `sha256` | SHA-256 hashing |
| `aesEncrypt` / `aesDecrypt` | AES-256-CBC |
| `aesEncryptGCM` / `aesDecryptGCM` | AES-256-GCM |
| `aesEncryptCTR` / `aesDecryptCTR` | AES-256-CTR |

---

## License

MIT
