
## Why Lovable can't host the bot itself

Lovable's runtime is a serverless Cloudflare Worker. It cannot:
- run a long-lived WhatsApp socket (Workers terminate after each request),
- run Puppeteer/Chromium (whatsapp-web.js, venom-bot),
- persist auth state files on disk.

**Baileys** is the only one of the three that supports **pairing-code login by phone number** (no QR scan needed) — it's WebSocket-based, no browser. But it still needs a long-running Node process, so the bot itself runs on **Railway**. Lovable hosts the dashboard + database + AI calls.

## Architecture

```text
 ┌──────────────────────┐         ┌─────────────────────────┐
 │  Lovable app (this)  │         │  Railway: Baileys bot   │
 │  - Dashboard UI      │ ──HTTP─►│  - WhatsApp socket      │
 │  - Lovable Cloud DB  │◄──HTTP──│  - Pairing code login   │
 │  - /api/public/*     │         │  - Calls Lovable AI     │
 │    server routes     │         │    via dashboard API    │
 └──────────────────────┘         └─────────────────────────┘
```

## What gets built in Lovable

### 1. Dashboard (TanStack Start routes)
- `/` — landing/login
- `/dashboard` — status (connected / disconnected), pairing code display, last seen
- `/dashboard/settings` — welcome message text, business hours (timezone + start/end), away-mode toggle, AI system prompt
- `/dashboard/contacts` — list of contacts that have received the welcome (so it only fires once)
- `/dashboard/messages` — incoming messages + AI replies log

### 2. Lovable Cloud (database)
Tables:
- `bot_config` — single row: welcome_message, system_prompt, timezone, business_hours_start, business_hours_end, away_mode (manual override), enabled
- `contacts` — phone, first_seen_at, welcomed_at
- `messages` — phone, direction (in/out), body, replied_by_ai (bool), created_at
- `bot_session` — encrypted Baileys auth state (JSON blob), updated_at, status, last_pairing_code

User roles via `user_roles` table (admin only can access dashboard).

### 3. Server routes the Railway bot calls (`src/routes/api/public/bot/*`)
All protected with a shared `BOT_SHARED_SECRET` header.
- `POST /api/public/bot/session` — bot uploads/downloads encrypted Baileys creds (so re-deploys don't lose login)
- `POST /api/public/bot/incoming` — bot posts incoming message; server decides:
  - is bot enabled?
  - is sender already welcomed? if not → return welcome text + mark welcomed
  - is current time outside business hours OR away_mode on? if yes → call Lovable AI Gateway with system prompt + message → return AI reply
  - else → return `{ reply: null }` (don't reply, user is "online")
- `POST /api/public/bot/status` — bot reports connection state + pairing code; dashboard polls this

AI replies use `LOVABLE_API_KEY` + AI Gateway (default model `google/gemini-2.5-flash`).

## What you build/deploy on Railway (we'll provide the code)

A small Node project (`bot/` folder in this repo, deployed separately):
- `@whiskeysockets/baileys` for WhatsApp
- On boot: pulls saved auth from `/api/public/bot/session`. If none, calls `sock.requestPairingCode(phoneNumber)` and posts the 8-char code to `/status` so you can see it in the dashboard and enter it in WhatsApp → Linked Devices → Link with phone number.
- On every incoming message: forwards to `/incoming`, sends back whatever `reply` the server returns.
- Persists auth back to `/session` whenever creds update.

You'll add two env vars on Railway: `DASHBOARD_URL` and `BOT_SHARED_SECRET`.

## Triggers (matches your selection)

Server-side decision tree on each incoming message:
1. If sender is new → send welcome message, mark welcomed, **stop**.
2. Else if `away_mode` is on **OR** current time is outside business hours → AI reply.
3. Else → no reply (you're "online").

## Out of scope / caveats

- Baileys is unofficial; WhatsApp can ban numbers that look automated. Use a secondary number, keep reply volume reasonable.
- True "only when I'm offline" presence detection isn't reliable on Baileys; we approximate it with business hours + manual away toggle (industry standard for these bots).
- Media messages (images/voice) will be acknowledged but not understood by the AI in v1.

## Secrets needed later (won't request until you approve)

- `BOT_SHARED_SECRET` — random string, shared between Lovable and Railway
- `LOVABLE_API_KEY` — auto-provisioned when Cloud is enabled

## Build order

1. Enable Lovable Cloud, create tables, auth + admin role
2. Build dashboard UI (settings, status, logs)
3. Build `/api/public/bot/*` server routes with HMAC auth
4. Provide the Railway `bot/` Node project + a README with deploy steps
5. You deploy to Railway, link your number via pairing code shown in dashboard
