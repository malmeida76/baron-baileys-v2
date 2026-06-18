# WhatsApp Protocol Reference (from APK source)

This document catalogues all WhatsApp IQ/stanza namespaces and protocols found in WhatsApp 2.26.20.8 APK sources that are relevant for understanding the full protocol surface. Protocols already documented elsewhere are cross-referenced but not repeated.

---

## Namespace Overview

| Namespace (`xmlns`) | Used For | Notes |
|---------------------|----------|-------|
| `w:g2` | Groups v2, Communities, AI Groups | See [COMMUNITIES.md](COMMUNITIES.md) |
| `w:mex` | MEX social features (GraphQL-over-WS) | See [MEX.md](MEX.md) |
| `usync` | Bulk user data queries | See [USYNC.md](USYNC.md) |
| `w:interop` | DMA interoperability (BirdyChat, Haiket) | See [INTEROP.md](INTEROP.md) |
| `status` | Status privacy (who can see your status) | See below |
| `w:pay` | Payments UPI/India IQ | See below |
| `w:stats` | WAM statistics reporting | See below |
| `encrypt` | Signal pre-key fetch and key exchange | See below |
| `privatestats` | Privacy-preserving credential exchange | See [BAN-SYSTEM.md](BAN-SYSTEM.md) |
| `tos` | Terms of Service / CTWA consent disclosure | See below |
| `fb:thrift_iq` | Legacy bug reporting | See below |

---

## Status Privacy (`xmlns="status"`)

### GET privacy settings

```
→ IQ type="get" xmlns="status"
    <privacy/>
← IQ type="result"
    <privacy>
      <list type="contacts"/>   ← current setting
    </privacy>
```

### SET privacy list

```
→ IQ type="set" xmlns="status"
    <privacy>
      <list type="contacts">          ← "contacts" | "whitelist" | "blacklist"
        <user jid="491234@s.whatsapp.net"/>
        <user jid="491987@s.whatsapp.net"/>
      </list>
      <list type="customlist" id="list-id" listname="Close Friends" emoji="⭐" selected="true">
        <user jid="491234@s.whatsapp.net"/>
      </list>
      <list type="customlist" id="old-list-id" deleted="true"/>   ← delete a custom list
    </privacy>
← IQ type="result"
```

**`statusDistribution` values (internal enum):**

| Value | `type` attr |
|-------|-------------|
| 0 | `contacts` |
| 1 | `whitelist` |
| 2 | `blacklist` |
| 4 | `null` (all) |

**Custom list fields:**
- `id` — list UUID
- `listname` — human-readable name
- `emoji` — list emoji (e.g. `⭐`)
- `deleted="true"` — marks list for deletion
- `selected="true"` — currently active list
- `<user jid="..."/>` children — members

**Timeout:** 32 seconds. Retry with feature flag 3843.

---

## Calls / VoIP — Stanza Protocol

WhatsApp calls use a custom `<call>` message stanza (not IQ). The stanzas are built via `VoipStanzaChildNode` and sent as `<message>` to the recipient's JID or to `@call`.

### Call stanza tags

| Tag | Direction | Description |
|-----|-----------|-------------|
| `offer` | outgoing | Initiate a call |
| `accept` | outgoing | Accept an incoming call |
| `reject` | outgoing | Decline an incoming call |
| `terminate` | both | End a call |
| `video` | both | Video call metadata |
| `enc_rekey` | both | Re-encrypt call key (for reconnects) |
| `lobby` | both | Call lobby (group calls) |
| `link_join` | outgoing | Join via call link |
| `link_query` | outgoing | Query call link info |
| `link_create` | outgoing | Create a call link |

### Stanza structure (offer)

```xml
<call to="{recipient_jid}" id="{stanza_id}" call-id="{call_id}">
  <offer>
    <destination>
      <device jid="{device_jid}">
        <enc v="2" type="pkmsg">{encrypted_call_key}</enc>
      </device>
      <device jid="{companion_jid}">
        <enc v="2" type="pkmsg">{encrypted_call_key}</enc>
      </device>
    </destination>
    <device-identity>{binary_identity}</device-identity>   ← companion mode only
  </offer>
</call>
```

### Encryption node fields

| Field | Value | Meaning |
|-------|-------|---------|
| `v` | `"2"` | Signal protocol version |
| `type` | `"pkmsg"` | PreKey message (first message) |
| `type` | `"msg"` | Normal message (subsequent) |
| data | binary | Encrypted call session key (protobuf `CallMessage`) |

### `terminate` retry behavior

- If call was active (`CallState.ACTIVE`) or connected: `terminate` is sent **with retry**
- If bot call or lonely-connected state: sent **without retry**
- `preSendTerminate()` cleans up pending offer stanzas first

### `enc_rekey` — Re-keying

Used when a device reconnects mid-call. Sends a new encrypted E2E key to the specific device that reconnected. Includes retry counter (`0–4`) in the `enc` node.

### Bot calls (AI Group calls)

If `callInfo.isBotCall == true`, the offer payload includes extra fields:
- `adType` — external ad reply type
- `callEntryPoint` — feature flag 24935
- `nativeFlowCallButtonPayload` — native flow payload
- `deeplinkPayload` — deep link payload

---

## Payments UPI (`xmlns="w:pay"`)

Indian UPI payments use IQ stanzas with `xmlns="w:pay"`:

### Get UPI bank list

```
→ IQ xmlns="w:pay" type="get" id="{stanza_id}"
    <upi action="upi-get-banks" version="2" provider-type="CREDIT">
      <popular-banks>0,1</popular-banks>
      <account-type>CREDIT,CREDIT_LINE,CURRENT,DEFAULT</account-type>
    </upi>
← IQ type="result"
    <upi>
      <banks>...</banks>
    </upi>
```

**`provider-type` values:**
- `CREDIT`, `CREDIT_LINE`, `CURRENT`, `DEFAULT`

**`account-type` values:**
- `CREDIT`, `CREDIT_LINE`, `CURRENT`, `DEFAULT`

> Most payment operations (PIX Brazil, mandate management, payment keys) go through HTTPS GraphQL — see [GRAPHQL.md](GRAPHQL.md).

---

## WAM Statistics (`xmlns="w:stats"`)

WhatsApp Application Metrics (WAM) are sent as IQ stanzas from `JniBridge.java` case `w:stats`:

```
→ IQ xmlns="w:stats" type="set"
    <wam>{binary_metrics_payload}</wam>
← IQ type="result"
```

This is fully handled natively by `libwa.so` — no application-level involvement needed. The payload is a binary protobuf containing telemetry data.

---

## Encryption Key Exchange (`xmlns="encrypt"`)

Used during device registration and key refresh to upload/fetch Signal pre-keys:

### Upload pre-keys

```
→ IQ xmlns="encrypt" type="set"
    <registration>{registration_id}</registration>
    <type>{key_type}</type>
    <identity>{identity_key_bytes}</identity>
    <list>
      <key>
        <id>{pre_key_id}</id>
        <value>{pre_key_bytes}</value>
      </key>
      ...
    </list>
    <skey>
      <id>{signed_pre_key_id}</id>
      <value>{signed_pre_key_bytes}</value>
      <signature>{signature_bytes}</signature>
    </skey>
← IQ type="result"
```

### Fetch pre-key for a device

```
→ IQ xmlns="encrypt" type="get"
    <user jid="{target_jid}" reason="identity">
      <key/>
    </user>
← IQ type="result"
    <user jid="{jid}">
      <registration>{id}</registration>
      <type>{key_type}</type>
      <identity>{bytes}</identity>
      <key>
        <id>{id}</id>
        <value>{bytes}</value>
      </key>
      <skey>
        <id>{id}</id>
        <value>{bytes}</value>
        <signature>{bytes}</signature>
      </skey>
    </user>
```

---

## Terms of Service / CTWA Disclosure (`xmlns="tos"`)

Used for CTWA (Click-To-WhatsApp Ad) consumer consent disclosure:

```
→ IQ xmlns="tos" type="set" smax_id="130"
    <ctwa_consumer_consent version="{version}" value="true" timestamp="{unix_ts}"/>
← IQ type="result"
```

Also used for interop TOS acceptance during init:
```
→ SET xmlns="tos" <trackable id="20240306" result="105"/>   (TOS shown)
→ SET xmlns="tos" <trackable id="20240306" result="160"/>   (TOS accepted)
```
See [INTEROP.md](INTEROP.md) for the interop TOS flow.

---

## Bug Reporting (`xmlns="fb:thrift_iq"`)

Legacy bug report submission (tag 105):

```
→ IQ xmlns="fb:thrift_iq" type="set" tag="105"
    {thrift-encoded bug report payload}
← IQ type="result"
```

Modern path uses MEX mutation `RequestPeerLogsUploadForBugMutation`:
```js
await sock.requestPeerLogsUpload('bug-id')
```
See [REGISTRATION.md](REGISTRATION.md).

---

## SyncD — App State Sync (`xmlns="w:sync:app:state"`)

SyncD synchronizes app state (chats, contacts, settings) between multi-device instances. The protocol runs over peer messages (not IQ directly) — data is exchanged between companion devices via encrypted protobuf payloads.

### Peer message types (sent as Signal-encrypted messages between devices)

| Type string | Meaning |
|-------------|---------|
| `syncd-key-share` | Share syncd encryption key with new device |
| `syncd-key-request` | Request syncd key from primary device |
| `syncd-fatal-exception-notification` | Notify primary of fatal syncd error |
| `companion_syncd_snapshot_fatal_recovery` | Recovery from snapshot corruption |

### Collection names (app state categories)

| Collection | What it syncs |
|-----------|---------------|
| `critical_block` | Chat mutes, pin, archive (critical) |
| `default` | General chat settings |
| `regular_high` | Messages, media |
| `regular_low` | Less critical state |
| `md_msg_hist` | Multi-device message history |

### Dirty sync trigger

When the server sends `<ib><dirty type="account"/>...</ib>`, the client re-uploads all app state keys:

```
← IQ/notification  <ib><dirty type="account" t="{ts}"/></ib>
→ IQ xmlns="w:sync:app:state" type="set"
    {collection patches}
← IQ type="result"
```

---

## Companion Device Pairing (Linked Devices)

### QR code → companion link flow

1. Primary device generates QR code (contains: ref + public key + identity key)
2. Companion scans QR → sends `<iq xmlns="md">` registration
3. Server confirms device linked
4. Primary sends history sync to companion via `syncd-key-share`

### Peer message delivery (`<message type="peer">`)

Companion-to-primary messages use Signal-encrypted peer messages:

```xml
<message to="{primary_jid}" type="peer">
  <enc v="2" type="pkmsg">{encrypted_protobuf}</enc>
</message>
```

The protobuf `SyncActionMessage` contains the actual app state mutation.

---

## Privacy Settings (MEX-based)

Status privacy uses IQ (`xmlns="status"`) — see above.  
All other privacy settings use MEX queries — see [PRIVACY.md](PRIVACY.md).

Known MEX privacy features (confirmed from `MexPrivacySettingsHandler`):

| Feature name | What it controls |
|-------------|-----------------|
| `LAST_SEEN` | Who sees your last seen |
| `ONLINE` | Who sees when you're online |
| `PROFILE_PHOTO` | Who sees your profile picture |
| `STATUS` | Who sees your status |
| `READ_RECEIPTS` | Read receipt visibility |
| `GROUPS` | Who can add you to groups |
| `CALLS` | Who can call you |
| `SCREENSHOT` | Screenshot blocking |
| `LIVE_LOCATION` | Live location sharing |
| `MESSAGES` | Who can message you |
| `LINKED_PROFILES` | FB/IG profile linking visibility |
| `COVER_PHOTO` | Cover photo visibility |
| `GROUPCREATION` | Who can create groups with you |
| `DEPENDENT_ACCOUNT_MESSAGES` | Messages in managed accounts |

---

## Protocol Infrastructure

### VoipStanzaChildNode

The calling subsystem uses its own node type instead of `C12140br` (the standard binary stanza node):

```java
VoipStanzaChildNode node = new VoipStanzaChildNode.Builder("enc")
    .addAttribute("v", "2")
    .addAttribute("type", "pkmsg")
    .setData(encryptedBytes)
    .build()
```

`VoipStanzaChildNode.fromProtocolTreeNode(C12140br)` converts between the two formats.

### ProtocolJniHelper

JNI bridge for native protocol tree manipulation. Used by the native calling stack (`libwa.so`) to build IQ stanzas from C++ code before they're handed back to the Java/Kotlin layer.

---

## Unknown / Not yet reversed

These namespaces appear in the codebase but were not fully analyzed:

| Namespace | Likely purpose |
|-----------|---------------|
| `w:auth:backup:token` | Auth backup token exchange |
| `w:auth:key` | Auth key operations |
| `w:b` | Internal (unknown) |
| `w:comms` | Communications (unknown) |
| `w:comms:chat` | Chat communications (unknown) |
| `w:biz` | Business features (see `business.js`) |
| `w:biz:catalog` | Business catalog |
| `w:biz:merchant_info` | Merchant info |
| `w:qr` | QR code operations (separate from MEX qrCodeScan) |
| `urn:xmpp:whatsapp:account` | Account operations |
| `urn:xmpp:whatsapp:push` | Push notification tokens |
| `urn:xmpp:ping` | XMPP keepalive ping |
