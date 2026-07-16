# Changelog

## 2026-07-16

| Area | What changed |
| --- | --- |
| **CSToken / NCT** | NCT salt (`NctSaltSyncAction`, proto field 80) is now persisted to `authState.keys` under `nct-salt` when received via App-State-Sync. For 1-on-1 messages where no tctoken exists (cold contact), Baileys now computes `HMAC-SHA256(nctSalt, utf8("<user>@lid"))` and attaches it as `<cstoken>` in the outgoing stanza — matching WA Web behaviour. tctoken always takes priority; cstoken only fires as a fallback. |
| **Meta AI (`sendMetaAI`)** | New `sock.sendMetaAI(text, opts?)` function. Sends to the Hatch bot JID (`1807055946647697@s.whatsapp.net`) with all required proto fields: `ContextInfo.isSupportAiMessage = true`, `botMessageInvokerJid`, `botTargetId`, `BotMetadata.personaId = "meta_ai"`, `invokerJid`, `aiConversationContext`. Responses arrive as normal `messages.upsert` events. Pass `opts.conversationContext` (bytes from a previous AI reply's `botMetadata.aiConversationContext`) for multi-turn conversations. |
| **Newsletter** | `newsletterRevokeMessage(jid, serverId)` to delete a newsletter post. `newsletterGetServerId(jid, messageId)` with 5s timeout fallback. Newsletter `server_id` cache (`_nlServerIdCache` Map in chats.js) populated from `upsertMessage` and `handleNewsletterStatus`. `m.quotedNewsletterServerId` set on messages that quote a cached newsletter post. `newsletter.status` event now carries `messageId` field. Additional functions: `pinMessage`, `unpinMessage`, `viewStats`, `sendPost`, `labelPaidPartnership`, `blockUser`, Wamo ops (enable/disable/change sub, AFS, asset collection, adhoc notice, identity token, compliance info, user ID version), admin invite/revoke/accept, directory list/search/category preview, similar/recommended/following list, insights, poll voter list, reaction senders, view receipts, question response state update. |
| **WAProto** | Updated proto, `index.js`, `index.d.ts` to current version. |

---

## 2026-07-03

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

---

## 2026-06-30

| Area | What changed |
| --- | --- |
| **Username** (`@username`) | All 6 MEX query IDs corrected from WA 2.26.26.4 APK assets + live Frida capture. Two-step check→reserve flow with shared `session_id` documented. `reserved: true` fixed. |
| **Interop** | All 7 MEX query IDs corrected from WA 2.26.26.4 APK assets (all were off by 1–2). Source file table added to INTEROP.md. |
| **Docs** | INTEROP.md and USERNAME.md rewritten with real stanza examples and verified IDs. |
