# Antiban Protection

The antiban system is based on [baileys-antiban](https://github.com/kobie3717) by [@kobie3717](https://github.com/kobie3717) and has been bundled directly into baron-baileys-v2.

Every socket created with `makeWASocket()` is **automatically protected** — no extra setup required.

## How It Works

Every `sendMessage()` call goes through multiple guards in order:

- **Rate Limiting** — 15/min, 500/h, 3000/day (moderate defaults)
- **Warmup** — new numbers start at 30 messages/day, scaling ~1.8× daily for 5 days
- **Circadian Rhythm** — slows down automatically during low-activity hours (2–6 AM)
- **Timelock** — on 463 errors, new contacts are blocked until the timelock expires
- **Human Delays** — 1–4s jittered pause between messages, plus typing simulation
- **Session Health** — auto-pauses when error rate signals a ban risk
- **Identical Message Guard** — blocks the same content after 10 sends within 30 minutes

## Basic Usage

```js
const sock = makeWASocket({ auth: state })

try {
	await sock.sendMessage(jid, { text: 'Hello' })
} catch (err) {
	if (err.message.includes('[baileys-antiban]')) {
		console.log('Blocked:', err.message)
		// wait, skip, or queue the message
	} else {
		throw err
	}
}
```

## Opt-out

```js
const sock = makeWASocket({ antiban: false, auth: state })
```

## Presets

Three built-in presets trade throughput for safety:

| Setting              | conservative | **moderate** (default) | aggressive |
| -------------------- | ------------ | ---------------------- | ---------- |
| Max/minute           | 6            | **15**                 | 25         |
| Max/hour             | 150          | **500**                | 1200       |
| Max/day              | 1000         | **3000**               | 6000       |
| Min delay            | 2000ms       | **1000ms**             | 600ms      |
| Max delay            | 6000ms       | **4000ms**             | 2500ms     |
| New chat extra delay | 3000ms       | **2000ms**             | 1500ms     |
| Warmup days          | 7            | **5**                  | 3          |
| Day 1 limit          | 20           | **30**                 | 50         |
| Auto-pause at        | high         | **critical**           | critical   |
| Inactivity reset     | 120h         | **168h**               | 96h        |

```js
// Use a preset
const sock = makeWASocket({ antiban: { preset: 'moderate' }, auth: state })

// Override individual settings on top of a preset
const sock = makeWASocket({
	antiban: { preset: 'moderate', maxPerMinute: 20 },
	auth: state
})
```

## sock.antiban — Stats & Diagnostics

```js
const stats = sock.antiban.getStats()
// {
//   messagesAllowed: 312,
//   messagesBlocked: 4,
//   totalDelayMs: 487000,
//   health:      { risk: 'low', score: 0, paused: false },
//   warmUp:      { phase: 'graduated', day: 5, totalDays: 5, todayLimit: -1, todaySent: 47 },
//   rateLimiter: { lastMinute: 3, lastHour: 47, lastDay: 312, limits: { perMinute: 15, perHour: 500, perDay: 3000 } }
// }
```

### Individual Guards

```js
// Health — is antiban paused due to ban risk?
const health = sock.antiban.health.getStatus()
// { risk: 'low'|'medium'|'high'|'critical', score: 0, paused: false, recommendation: '...' }

// Warmup status
const warmup = sock.antiban.warmUp.getStatus()
// { phase: 'warming'|'graduated', day: 3, totalDays: 5, todayLimit: 97, todaySent: 12 }

// Rate limiter counts
const rate = sock.antiban.rateLimiter.getStats()
// { lastMinute: 3, lastHour: 47, lastDay: 312, limits: { perMinute: 15, ... } }

// Timelock (463 errors)
const tl = sock.antiban.timelock.getState()
// { isActive: false, errorCount: 0 }
```

### Manual Pause / Resume

```js
sock.antiban.pause() // stop all sends
sock.antiban.resume() // re-enable
```

### Cleanup on Disconnect

```js
sock.ev.on('connection.update', ({ connection }) => {
	if (connection === 'close') {
		sock.antiban.destroy() // stops all internal timers
	}
})
```

## Error Messages

| Error text            | Meaning                                  |
| --------------------- | ---------------------------------------- |
| `rate limit exceeded` | Minute/hour/day cap hit                  |
| `warm-up daily limit` | Number is in warmup, today's cap reached |
| `timelock active`     | 463 error is active, new contact blocked |
| `health risk`         | Health guard paused all sends            |

## Using AntiBan Standalone (without makeWASocket)

Import and use the guards individually or via `wrapSocket`:

```js
const { wrapSocket, AntiBan, RateLimiter, WarmUp } = require('baron-baileys-v2/src/antiban')

// Wrap an existing Baileys socket
const wrapped = wrapSocket(sock, 'moderate')
// wrapped.sendMessage is now rate-limited and guarded

// Or create AntiBan manually
const ab = new AntiBan('moderate')

const decision = await ab.beforeSend(jid, text)
if (!decision.allowed) {
	console.log('Blocked:', decision.reason)
	return
}
if (decision.delayMs > 0) await sleep(decision.delayMs)

await sock.sendMessage(jid, { text })
ab.afterSend(jid, text)
```

## Persist State Across Restarts

Warmup progress and known chats survive restarts when you pass a file path:

```js
const sock = makeWASocket({
	antiban: { preset: 'moderate', persist: './antiban-state.json' },
	auth: state
})
```

The state file is written with a 5s debounce after every send, and immediately on ban/restriction events.

## Credits

Antiban logic by [@kobie3717](https://github.com/kobie3717) — [baileys-antiban](https://github.com/kobie3717/baileys-antiban)
