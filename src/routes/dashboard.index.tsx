import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [phoneInput, setPhoneInput] = useState("");
  const [connecting, setConnecting] = useState(false);

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
        await supabase.from("bot_config").insert({ user_id: user.id });
      }
    };
    load();
    const id = setInterval(load, 4000);
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

  async function requestPairing() {
    if (!user) return;
    const phone = phoneInput.replace(/\D/g, "");
    if (phone.length < 8) {
      toast.error("Enter your full WhatsApp number with country code");
      return;
    }
    setConnecting(true);
    const { error } = await supabase.from("bot_session").upsert(
      {
        user_id: user.id,
        phone_number: phone,
        status: "pair_requested",
        pairing_code: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setConnecting(false);
    if (error) toast.error(error.message);
    else toast.success("Requested. Pairing code will appear shortly.");
  }

  async function disconnect() {
    if (!user) return;
    if (!confirm("Disconnect WhatsApp? You'll need to pair again.")) return;
    await supabase
      .from("bot_session")
      .update({ status: "logout_requested", pairing_code: null, auth_state: null })
      .eq("user_id", user.id);
    toast.success("Disconnect requested");
  }

  const status = session?.status ?? "disconnected";
  const statusVariant: Record<string, string> = {
    connected: "bg-green-500/15 text-green-700 dark:text-green-300",
    pairing: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    pair_requested: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    waiting_for_phone: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    disconnected: "bg-red-500/15 text-red-700 dark:text-red-300",
    unknown: "bg-muted text-muted-foreground",
  };

  const isConnected = status === "connected";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Status</h1>
        <p className="text-muted-foreground">
          Link your WhatsApp number and control when the bot replies.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Connection</div>
            <div className="mt-1 text-2xl font-semibold capitalize">
              {status.replace(/_/g, " ")}
            </div>
            {session?.phone_number && (
              <div className="mt-1 text-sm text-muted-foreground">
                +{session.phone_number}
              </div>
            )}
          </div>
          <Badge className={statusVariant[status] ?? statusVariant.unknown}>
            {status.replace(/_/g, " ")}
          </Badge>
        </div>

        {!isConnected && (
          <div className="mt-6 space-y-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <Label htmlFor="phone" className="text-sm font-medium">
                Your WhatsApp number
              </Label>
              <p className="text-xs text-muted-foreground">
                Include country code, no <code>+</code> or spaces. e.g. <code>2348012345678</code>
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                id="phone"
                inputMode="numeric"
                placeholder="2348012345678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
              />
              <Button onClick={requestPairing} disabled={connecting}>
                {connecting ? "Requesting..." : "Get pairing code"}
              </Button>
            </div>

            {session?.pairing_code && (
              <div className="rounded-md border border-dashed bg-background p-4">
                <div className="text-sm font-medium">Pairing code</div>
                <div className="mt-2 font-mono text-3xl tracking-widest">
                  {session.pairing_code}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  On your phone open WhatsApp →{" "}
                  <strong>
                    Settings → Linked Devices → Link a Device → Link with phone
                    number instead
                  </strong>{" "}
                  and enter this code. Expires in ~60 seconds.
                </p>
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
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
