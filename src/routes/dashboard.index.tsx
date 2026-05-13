import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: StatusPage,
});

type Session = {
  status: string;
  pairing_code: string | null;
  phone_number: string | null;
  last_seen_at: string | null;
};

function StatusPage() {
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const [s, c] = await Promise.all([
        supabase
          .from("bot_session")
          .select("status, pairing_code, phone_number, last_seen_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("bot_config")
          .select("enabled, away_mode")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setSession(s.data);
      if (c.data) {
        setEnabled(c.data.enabled);
        setAway(c.data.away_mode);
      } else {
        // create default row
        await supabase.from("bot_config").insert({ user_id: user.id });
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  async function updateConfig(patch: { enabled?: boolean; away_mode?: boolean }) {
    if (!user) return;
    const { error } = await supabase
      .from("bot_config")
      .update(patch)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  const status = session?.status ?? "disconnected";
  const statusVariant: Record<string, string> = {
    connected: "bg-green-500/15 text-green-700 dark:text-green-300",
    connecting: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    pairing: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    disconnected: "bg-red-500/15 text-red-700 dark:text-red-300",
    unknown: "bg-muted text-muted-foreground",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Status</h1>
        <p className="text-muted-foreground">
          Connect your WhatsApp number and control when the bot replies.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Connection</div>
            <div className="mt-1 text-2xl font-semibold capitalize">{status}</div>
            {session?.phone_number && (
              <div className="mt-1 text-sm text-muted-foreground">
                {session.phone_number}
              </div>
            )}
          </div>
          <Badge className={statusVariant[status] ?? statusVariant.unknown}>
            {status}
          </Badge>
        </div>

        {session?.pairing_code && status !== "connected" && (
          <div className="mt-6 rounded-lg border border-dashed bg-muted/30 p-4">
            <div className="text-sm font-medium">Pairing code</div>
            <div className="mt-2 font-mono text-3xl tracking-widest">
              {session.pairing_code}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              In WhatsApp on your phone: <strong>Settings → Linked Devices →
              Link a Device → Link with phone number instead</strong>, then enter
              this code. It expires in ~60 seconds.
            </p>
          </div>
        )}

        {!session && (
          <div className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No bot connected yet. Deploy the bot to Railway (see README in the{" "}
            <code>bot/</code> folder) and it will appear here.
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Quick controls</h2>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Bot enabled</Label>
            <p className="text-xs text-muted-foreground">
              Master switch. When off, the bot never replies.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              updateConfig({ enabled: v });
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Away mode</Label>
            <p className="text-xs text-muted-foreground">
              Force AI replies regardless of business hours.
            </p>
          </div>
          <Switch
            checked={away}
            onCheckedChange={(v) => {
              setAway(v);
              updateConfig({ away_mode: v });
            }}
          />
        </div>
      </Card>
    </div>
  );
}
