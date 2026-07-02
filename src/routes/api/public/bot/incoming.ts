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

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function callAi(
  messages: ChatMsg[],
  model: string,
): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("LOVABLE_API_KEY missing");
    return null;
  }
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) {
      console.error("AI gateway error", res.status, await res.text());
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

        // Pull recent conversation history for context (last 20 turns)
        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("direction, body, created_at")
          .eq("user_id", body.user_id)
          .eq("phone", body.phone)
          .order("created_at", { ascending: false })
          .limit(20);

        const historyMsgs: ChatMsg[] = (history ?? [])
          .reverse()
          .map((m) => ({
            role: m.direction === "in" ? "user" : "assistant",
            content: m.body,
          }));

        const systemPrompt = `${config.system_prompt}

You are replying inside a WhatsApp chat as a helpful, human-like assistant (think ChatGPT or Jarvis) on behalf of the account owner, who is currently away. Style rules:
- Keep replies short, warm, and natural for WhatsApp (1–4 sentences, no walls of text).
- Use ONLY the information given in the owner's prompt above and the conversation history. If the owner's prompt lists a business, products, prices, or a website, use those exact details to answer.
- NEVER invent facts, phone numbers, emails, addresses, order links, prices, product names, or policies. NEVER output bracketed placeholders like "[insert contact information]" or "[your website]".
- If the contact asks for something you don't have info for (an item not listed, a custom order, live support, refunds, etc.), do NOT make up an answer. Politely ask them for the details they'd like to share, tell them you'll pass it to the owner, and that the owner will reply personally when back online.
- If the owner's prompt includes a website URL, share that exact URL when relevant (e.g. for browsing products or placing orders). Do not shorten, rename, or guess a different URL.
- Never claim to be an AI language model unless asked directly.`;

        const aiReply = await callAi(
          [
            { role: "system", content: systemPrompt },
            ...historyMsgs,
            { role: "user", content: body.body },
          ],
          config.ai_model || "openai/gpt-5-mini",
        );
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
