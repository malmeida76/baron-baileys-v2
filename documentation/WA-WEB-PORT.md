# WhatsApp-Web Protocol Port

Operations and stanza handlers reverse-engineered from **captured WhatsApp Web
traffic** and WA Web's own module catalog, then ported to this library. Every
item below maps to a real WA Web `WASmax*RPC` operation or a top-level stanza
seen on the wire.

> ⚠️ These are derived from captures and verified for **wire shape**, not yet
> round-tripped against live WhatsApp in every case. Treat the niche ones as
> "should work, verify on a live session".

---

## USync: Feature protocol

Query which features a device supports (`document`, `encrypt*`, `voip`,
`multi_agent`, …) via the standard USync mechanism.

```js
const { USyncQuery, USyncUser } = require('baron-baileys-v2/src/WAUSync')
const { USyncFeatureProtocol } = require('baron-baileys-v2/src/WAUSync/Protocols/USyncFeatureProtocol')

const query = new USyncQuery().withUser(new USyncUser().withId('49123456789@s.whatsapp.net'))
query.protocols.push(new USyncFeatureProtocol(['encrypt', 'voip'])) // or default = all features

const result = await sock.executeUSyncQuery(query)
// result.list[i].feature -> { encrypt: '2', voip: '1' }
```

---

## Privacy & account

```js
// Global "block messages from unknown accounts" toggle (xmlns w:comms:chat)
const status = await sock.getChatBlockingStatus() // 'blocked' | 'unblocked'
await sock.updateChatBlockingStatus('block') // or 'unblock'

// Pending TOS disclosures / notices (xmlns tos)
const notices = await sock.getUserDisclosures() // [{ t, version, type, ... }]

// Feature opt-out list
const optOut = await sock.getOptOutList()

// Push-notification settings (mainly web push)
const push = await sock.getPushConfig()
await sock.setPushConfig({ platform: 'web', endpoint, auth, p256dh })
```

---

## Business

```js
// Linked Facebook/Instagram accounts (WhatsApp-as-a-page)
const linked = await sock.getLinkedAccounts() // { pageInfo, linkState, node }

// Marketing-message / meta-verified / genai eligibility
const elig = await sock.getBusinessEligibility({ metaVerified: 1, marketingMessages: 1 })
// -> { status: 'success' | 'fail', ... }
```

---

## Groups & communities

```js
await sock.groupAcknowledge(groupJid) // <ack/>

// participants of a community's linked/sub groups
const linkedParts = await sock.groupGetLinkedParticipants(communityJid) // [{ jid, phoneNumber? }]

// join a community sub-group (may raise a membership-approval request)
const { approvalRequested } = await sock.groupJoinLinked(communityJid, subGroupJid)

// batch-fetch group profile pictures (single group? prefer profilePictureUrl)
const pics = await sock.getGroupProfilePictures([g1, g2], 'preview')

// sub-group suggestions
await sock.groupCreateSubGroupSuggestion(communityJid, suggestionNodes)
await sock.groupSubGroupSuggestionsAction(communityJid, 'approve', [{ creator, jid }])
```

### New group-metadata fields

`groupMetadata(jid)` now also returns the WA Web group-sharing settings:

| Field                    | Source tag                          | Values                              |
| ------------------------ | ----------------------------------- | ----------------------------------- |
| `memberShareHistoryMode` | `<member_share_group_history_mode>` | `all_member_share` \| `admin_share` |
| `memberLinkMode`         | `<member_link_mode>`                | `admin_link` \| `all_member_link`   |
| `limitSharing`           | `<limit_sharing_enabled>`           | `boolean` (presence flag)           |

---

## Calls

```js
// existing: createCallLink — now also toggle the link's waiting room
await sock.toggleCallLinkWaitingRoom(linkToken, true /* enabled */, 'audio')
```

### Top-level call signalling (incoming)

Some accounts receive call signalling as **top-level** stanzas (`<offer>`,
`<terminate>`, `<mute_v2>`, `<transport>`, … each carrying a `call-id`) instead
of wrapped in `<call>`. The library now additively routes these: it emits the
usual `call` event for state stanzas (`offer`/`terminate`/`accept`/`reject`/
`preaccept`) and acks all of them so WhatsApp doesn't redeliver. The existing
`<call>` path is unchanged.

```js
sock.ev.on('call', calls => {
	for (const c of calls) console.log(c.status, c.from, c.id) // works for both wrappings
})
```

---

## New events

| Event                            | When                                                                                       | Payload                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `business.privacy-settings-sync` | server pushes an SMB privacy/data-sharing sync (`<notification type="business"><privacy>`) | `{ jid, categories, attrs }`                                             |
| `coexistence.update`             | WA ⇄ Messenger/Instagram onboarding/offboarding push (`<notification type="hosted">`)      | `{ jid, kind: 'onboarding' \| 'offboarding', status?, productSurface? }` |

```js
sock.ev.on('coexistence.update', u => console.log(u.kind, u.status))
sock.ev.on('business.privacy-settings-sync', s => console.log(s.categories))
```

---

## Tests

See [`test/wa-web-protocol-port.test.js`](../test/wa-web-protocol-port.test.js)
(`USyncFeatureProtocol`, group-settings extraction, and IQ/call wire-shape locks).
