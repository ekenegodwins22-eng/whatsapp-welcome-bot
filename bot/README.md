# AwayBot — Railway WhatsApp worker

Node worker that connects to WhatsApp via Baileys and talks to your Lovable dashboard. Deploy to Railway (always-on Node host) — Lovable's Worker runtime cannot keep a WhatsApp socket alive.

## Environment variables

| Name | Example | Notes |
|------|---------|-------|
| `DASHBOARD_URL` | `https://ai-responder-pro.lovable.app` | Your published dashboard URL |
| `BOT_SHARED_SECRET` | (random string) | Must match the secret stored in Lovable |
| `USER_ID` | `8c2…` UUID | Your auth user id (shown on the dashboard) |

`PHONE_NUMBER` is no longer required — you enter your phone on the dashboard and the worker picks it up automatically.

## Deploy

```bash
cd bot
npm install
DASHBOARD_URL=… BOT_SHARED_SECRET=… USER_ID=… npm start
```

On Railway: set the three env vars and (optionally) mount a volume at `/app/auth` with `AUTH_DIR=/app/auth` so the session survives restarts.

## Linking your number

1. Open the dashboard, type your WhatsApp number with country code (no `+`), press **Get pairing code**.
2. Within a few seconds an 8-character code appears.
3. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead**, enter the code.
4. Status flips to **Connected**.

## How it decides to reply

The dashboard server decides; the bot just forwards messages:

1. New contact → send your **welcome message** (once).
2. Otherwise, if **Away mode** is on **or** time is outside business hours → AI reply via your Ollama endpoint (`qwen2.5:0.5b`).
3. Otherwise → stay silent.
