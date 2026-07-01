import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}
function checkAuth(request: Request) {
  const secret = request.headers.get("x-bot-secret");
  return secret && secret === process.env.BOT_SHARED_SECRET;
}

function isOutsideBusinessHours(
  tz: string,
  startHour: number,
  endHour: number,
): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(fmt.format(new Date()), 10);
    if (Number.isNaN(hour)) return false;
    if (startHour <= endHour) {
      return hour < startHour || hour >= endHour;
    }
    return hour < startHour && hour >= endHour;
  } catch {
    return false;
  }
}

async function callAi(
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  const baseUrl = process.env.OLLAMA_URL;
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: false,
      }),
    });
    if (!res.ok) {
      console.error("Ollama error", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error("AI call failed", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/bot/incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkAuth(request)) return unauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = (await request.json()) as {
          user_id?: string;
          phone?: string;
          body?: string;
          display_name?: string;
        };
        if (!body.user_id || !body.phone || typeof body.body !== "string") {
          return new Response("missing fields", { status: 400 });
        }

        await supabaseAdmin.from("messages").insert({
          user_id: body.user_id,
          phone: body.phone,
          direction: "in",
          body: body.body,
        });

        const { data: config } = await supabaseAdmin
          .from("bot_config")
          .select("*")
          .eq("user_id", body.user_id)
          .maybeSingle();

        if (!config || !config.enabled) {
          return Response.json({ reply: null, reason: "disabled" });
        }

        const { data: existing } = await supabaseAdmin
          .from("contacts")
          .select("id, welcomed_at")
          .eq("user_id", body.user_id)
          .eq("phone", body.phone)
          .maybeSingle();

        let isNewContact = false;
        if (!existing) {
          isNewContact = true;
          await supabaseAdmin.from("contacts").insert({
            user_id: body.user_id,
            phone: body.phone,
            display_name: body.display_name ?? null,
          });
        }

        if (isNewContact || !existing?.welcomed_at) {
          await supabaseAdmin
            .from("contacts")
            .update({ welcomed_at: new Date().toISOString() })
            .eq("user_id", body.user_id)
            .eq("phone", body.phone);

          await supabaseAdmin.from("messages").insert({
            user_id: body.user_id,
            phone: body.phone,
            direction: "out",
            body: config.welcome_message,
            replied_by_ai: false,
          });

          return Response.json({ reply: config.welcome_message, reason: "welcome" });
        }

        const offHours = isOutsideBusinessHours(
          config.timezone,
          config.business_hours_start,
          config.business_hours_end,
        );
        const shouldReply = config.away_mode || offHours;
        if (!shouldReply) {
          return Response.json({ reply: null, reason: "online" });
        }

        const aiReply = await callAi(config.system_prompt, body.body);
        if (!aiReply) {
          return Response.json({ reply: null, reason: "ai_failed" });
        }

        await supabaseAdmin.from("messages").insert({
          user_id: body.user_id,
          phone: body.phone,
          direction: "out",
          body: aiReply,
          replied_by_ai: true,
        });

        return Response.json({ reply: aiReply, reason: "ai" });
      },
    },
  },
});
