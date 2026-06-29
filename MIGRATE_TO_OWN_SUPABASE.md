# Migrate to your own Supabase (project `ellzhlgybjfncpbyvdhy`)

Lovable Cloud hides the `SUPABASE_SERVICE_ROLE_KEY` from both you and the
agent, so you can't paste it into Vercel. The fix is to point the app at
*your* Supabase project, where you control every key.

## 1. Run the schema on your project

In the Supabase dashboard for `ellzhlgybjfncpbyvdhy` → **SQL Editor**, paste
and run [`supabase/migrations_consolidated.sql`](supabase/migrations_consolidated.sql).
It creates all tables, RLS policies, roles, the `has_role` function, and the
new-user trigger.

## 2. Enable auth providers

Authentication → Providers → **Email** ON. Disable "Confirm email" for
faster testing. Add Google later if you want it.

## 3. Set environment variables

**Vercel → Project Settings → Environment Variables** (Production +
Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ellzhlgybjfncpbyvdhy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable__IUwz22R_1x1Dgb1pJs1iw_7BhZ_S5C` |
| `SUPABASE_URL` | `https://ellzhlgybjfncpbyvdhy.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable__IUwz22R_1x1Dgb1pJs1iw_7BhZ_S5C` |
| `SUPABASE_SERVICE_ROLE_KEY` | your `service_role` JWT from Supabase → Settings → API |
| `BOT_SHARED_SECRET` | any long random string (same on Railway) |
| `OLLAMA_URL` | `https://ollama-fastapi-railway-deployment-qst2ba.fly.dev` |
| `OLLAMA_API_KEY` | your Ollama key |
| `OLLAMA_MODEL` | `qwen2.5:0.5b` |

Redeploy after saving.

## 4. Set the same on Railway (bot worker)

| Name | Value |
|---|---|
| `DASHBOARD_URL` | `https://whatsapp-welcome-bot.vercel.app` |
| `BOT_SHARED_SECRET` | same string you used on Vercel |

## 5. Rotate the keys you pasted in chat

Anything you shared in chat (DB password, service-role key, secret key) is
compromised. In Supabase → Settings → API click **Rotate** for both keys,
then update Vercel env vars with the new service-role key.

## 6. Local preview keeps using Lovable Cloud

The Lovable preview here still uses Lovable Cloud automatically. Vercel and
Railway use your own Supabase. You only need ONE working environment to
ship — Vercel.
