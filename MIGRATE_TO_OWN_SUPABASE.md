# Move to your own backend

Lovable Cloud hides the service-role credential from both you and the agent,
so you can't paste it into Vercel. The fix is to point the app at your own
backend project, where you control every key.

Status: schema and existing app data have been copied to the target database.

## 1. Run the schema on your project

Already done for the connected target. If you ever recreate the database,
run [`supabase/migrations_consolidated.sql`](supabase/migrations_consolidated.sql).

## 2. Enable auth providers

Authentication → Providers → **Email** ON. Disable "Confirm email" for
faster testing. Add Google later if you want it.

## 3. Set environment variables

**Vercel → Project Settings → Environment Variables** (Production +
Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your backend project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
| `SUPABASE_URL` | your backend project URL |
| `SUPABASE_PUBLISHABLE_KEY` | your publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key |
| `BOT_SHARED_SECRET` | any long random string (same on Railway) |
| `OLLAMA_URL` | `https://ollama-fastapi-railway-deployment-qst2ba.fly.dev` |
| `OLLAMA_API_KEY` | your Ollama key |
| `OLLAMA_MODEL` | `qwen2.5:0.5b` |

Redeploy after saving.

## 4. Set the same on Railway (bot worker)

| Name | Value |
|---|---|
| `DASHBOARD_URL` | your deployed dashboard origin |
| `BOT_SHARED_SECRET` | same string you used on Vercel |

## 5. Rotate the keys you pasted in chat

Anything you shared in chat (DB password, service-role key, secret key) is
compromised. In Supabase → Settings → API click **Rotate** for both keys,
then update Vercel env vars with the new service-role key.

## 6. Local preview keeps using Lovable Cloud

The Lovable preview here still uses Lovable Cloud automatically. Vercel and
Railway use your own Supabase. You only need ONE working environment to
ship — Vercel.
