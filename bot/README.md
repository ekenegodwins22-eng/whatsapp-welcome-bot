# AwayBot — Railway WhatsApp worker (multi-tenant)

Single Railway deployment that serves every user of the dashboard. No per-user
configuration: when a user clicks **Connect WhatsApp** on the dashboard, the
worker picks it up automatically and starts a Baileys session for them.

## Environment variables

| Name | Required | Notes |
|------|----------|-------|
| `DASHBOARD_URL` | yes | Your deployed dashboard origin, with or without `/dashboard` |
| `BOT_SHARED_SECRET` | yes | Must match the secret stored in the dashboard |
| `AUTH_ROOT` | no | Default `./auth`. Mount a Railway volume here to persist sessions |
| `POLL_MS` | no | Reconcile interval, default `5000` |

`USER_ID` and `PHONE_NUMBER` are NOT needed anymore. Share the same Railway
worker with as many friends as you want — each dashboard account becomes its
own session.

## Deploy

```bash
cd bot
npm install
DASHBOARD_URL=https://your-dashboard-domain.com \
BOT_SHARED_SECRET=… \
npm start
```

On Railway: set the two required env vars and (optionally) mount a volume at
`/app/auth` with `AUTH_ROOT=/app/auth` so sessions survive restarts.

## How it works

The worker polls `/api/public/bot/pending` every few seconds:

- Any user with `status='pair_requested'` and a phone → the worker requests a
  pairing code, posts it back, and the dashboard displays it.
- Any user with stored `auth_state` → the worker (re)connects automatically on
  start or after a crash.
- Any user with `status='logout_requested'` → the worker logs them out and
  wipes their credentials.

Inbound DMs are forwarded to `/api/public/bot/incoming`, which decides whether
to send a welcome message, an Ollama AI reply, or stay silent based on the
user's settings.
