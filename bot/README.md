# AwayBot — Railway WhatsApp worker

This folder is the Node.js bot that connects to WhatsApp via Baileys (unofficial)
and talks to your Lovable dashboard. **Do not deploy it to Lovable** — Lovable
runs on Cloudflare Workers, which can't keep a WhatsApp socket alive. Deploy it
to Railway (or any always-on Node host).

## Requirements

- A secondary WhatsApp number (Baileys is unofficial; never use your main number)
- Node 20+
- A Railway account

## Environment variables

| Name | Example | Notes |
|------|---------|-------|
| `DASHBOARD_URL` | `https://project--7199a11b-ad63-44d7-bc3a-3902774b3fb2.lovable.app` | Your Lovable app's stable URL |
| `BOT_SHARED_SECRET` | (random string) | Must match the secret you set in Lovable |
| `USER_ID` | `8c2…` UUID | Your Supabase auth user id (see below) |
| `PHONE_NUMBER` | `2348012345678` | Your WhatsApp number, country code, no `+` |

### Finding your USER_ID

1. Sign in to the dashboard.
2. Open browser devtools → Application → Local Storage → look for a key like
   `sb-…-auth-token`. Copy the `user.id` value (UUID).

## Deploy to Railway

```bash
# Local quick test first
cd bot
npm install
DASHBOARD_URL=… BOT_SHARED_SECRET=… USER_ID=… PHONE_NUMBER=… npm start
```

Then on Railway:

1. New Project → Deploy from GitHub repo (or `railway up` from this folder).
2. Set the four env vars above in the Railway service.
3. Add a persistent volume mounted at `/app/auth` so the WhatsApp session
   survives restarts. Set `AUTH_DIR=/app/auth` if you do.
4. Deploy. Watch the logs.

## Linking your number

On first boot the bot prints an 8-character pairing code (also shown on the
dashboard's Status page). On your phone:

> WhatsApp → **Settings → Linked Devices → Link a Device → Link with phone number instead**

Enter the code. The dashboard will switch to **Connected** within a few seconds.
The encrypted session is uploaded to your Lovable backend, so re-deploys keep
the link.

## How it decides to reply

The dashboard server makes the decision (the bot just forwards messages):

1. New contact → send your **welcome message** (once).
2. Otherwise, if **Away mode** is on **or** the time is outside business
   hours → send an **AI reply** (Lovable AI).
3. Otherwise → stay silent (you're "online").
