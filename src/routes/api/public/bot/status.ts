import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}
function checkAuth(request: Request) {
  const secret = request.headers.get("x-bot-secret");
  return secret && secret === process.env.BOT_SHARED_SECRET;
}

export const Route = createFileRoute("/api/public/bot/status")({
  server: {
    handlers: {
      // POST { user_id, status, pairing_code?, phone_number? }
      POST: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const body = (await request.json()) as {
          user_id?: string;
          status?: string;
          pairing_code?: string | null;
          phone_number?: string | null;
        };
        if (!body.user_id) return new Response("missing user_id", { status: 400 });

        const { error } = await supabaseAdmin.from("bot_session").upsert(
          {
            user_id: body.user_id,
            status: body.status ?? "unknown",
            pairing_code: body.pairing_code ?? null,
            phone_number: body.phone_number ?? null,
            last_seen_at: new Date().toISOString(),
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
