import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}
function checkAuth(request: Request) {
  const secret = request.headers.get("x-bot-secret");
  return secret && secret === process.env.BOT_SHARED_SECRET;
}

// GET /api/public/bot/pending
// Returns every user the worker should manage: anyone requesting pairing,
// anyone with stored credentials, anyone requesting logout.
export const Route = createFileRoute("/api/public/bot/pending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("bot_session")
          .select("user_id, phone_number, status, auth_state, updated_at");

        if (error) return new Response(error.message, { status: 500 });

        const list = (data ?? [])
          .filter(
            (r) =>
              r.status === "pair_requested" ||
              r.status === "logout_requested" ||
              r.auth_state != null,
          )
          .map((r) => ({
            user_id: r.user_id,
            phone_number: r.phone_number,
            status: r.status,
            has_auth_state: r.auth_state != null,
            updated_at: r.updated_at,
          }));

        return Response.json({ users: list });
      },
    },
  },
});
