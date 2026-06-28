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
      // POST { user_id, status, pairing_code?, phone_number?, last_error? }
      POST: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const body = (await request.json()) as {
          user_id?: string;
          status?: string;
          pairing_code?: string | null;
          phone_number?: string | null;
          last_error?: string | null;
        };
        if (!body.user_id) return new Response("missing user_id", { status: 400 });

        const patch: Record<string, unknown> = {
          user_id: body.user_id,
          status: body.status ?? "unknown",
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (body.pairing_code !== undefined) patch.pairing_code = body.pairing_code;
        if (body.phone_number !== undefined) patch.phone_number = body.phone_number;
        if (body.last_error !== undefined) patch.last_error = body.last_error;

        const { error } = await supabaseAdmin
          .from("bot_session")
          .upsert(patch, { onConflict: "user_id" });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
