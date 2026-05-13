import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAuth(request: Request) {
  const secret = request.headers.get("x-bot-secret");
  return secret && secret === process.env.BOT_SHARED_SECRET;
}

export const Route = createFileRoute("/api/public/bot/session")({
  server: {
    handlers: {
      // GET ?user_id=...  → return saved auth_state
      GET: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const url = new URL(request.url);
        const userId = url.searchParams.get("user_id");
        if (!userId) return new Response("missing user_id", { status: 400 });

        const { data, error } = await supabaseAdmin
          .from("bot_session")
          .select("auth_state, status, phone_number")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) return new Response(error.message, { status: 500 });
        return Response.json(data ?? { auth_state: null });
      },

      // POST { user_id, auth_state } → upsert auth_state
      POST: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const body = (await request.json()) as {
          user_id?: string;
          auth_state?: unknown;
          phone_number?: string;
        };
        if (!body.user_id) return new Response("missing user_id", { status: 400 });

        const { error } = await supabaseAdmin.from("bot_session").upsert(
          {
            user_id: body.user_id,
            auth_state: body.auth_state ?? null,
            phone_number: body.phone_number ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
