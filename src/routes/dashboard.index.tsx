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
import { RefreshCw, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: StatusPage,
});

type Session = {
  status: string;
  pairing_code: string | null;
  phone_number: string | null;
  last_seen_at: string | null;
  last_error: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function StatusPage() {
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [away, setAway] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [working, setWorking] = useState(false);
  const [pairRequestedAt, setPairRequestedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const [s, c] = await Promise.all([
        supabase
          .from("bot_session")
          .select("status, pairing_code, phone_number, last_seen_at, last_error")
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
      if (s.data?.phone_number && !phoneInput) setPhoneInput(s.data.phone_number);
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-retry: if we've been waiting for a pairing code for >30s with no code
  // arriving from the worker, re-trigger the pair request automatically.
  useEffect(() => {
    if (!user || !session) return;
    const waiting =
      session.status === "pair_requested" && !session.pairing_code && session.phone_number;
    if (!waiting) {
      setPairRequestedAt(null);
      return;
    }
    if (pairRequestedAt === null) {
      setPairRequestedAt(Date.now());
      return;
    }
    if (Date.now() - pairRequestedAt > 30_000) {
      setPairRequestedAt(Date.now());
      void startPairing(session.phone_number!);
      toast.info("Worker is slow — retrying pairing request…");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, user, pairRequestedAt]);

  async function updateConfig(patch: { enabled?: boolean; away_mode?: boolean }) {
    if (!user) return;
    const { error } = await supabase.from("bot_config").update(patch).eq("user_id", user.id);
    if (error) toast.error(error.message);
  }

  async function startPairing(phoneOverride?: string) {
    if (!user) return;
    const raw = (phoneOverride ?? phoneInput).replace(/\D/g, "");
    if (raw.length < 8) {
      toast.error("Enter your WhatsApp number with country code");
      return;
    }
    setWorking(true);
    const { error } = await supabase.from("bot_session").upsert(
      {
        user_id: user.id,
        phone_number: raw,
        status: "pair_requested",
        pairing_code: null,
        auth_state: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setWorking(false);
    if (error) toast.error(error.message);
    else toast.success("Pairing requested. Code appears within ~10 seconds.");
  }

  async function regenerateCode() {
    if (!session?.phone_number) {
      toast.error("No phone number on file yet");
      return;
    }
    await startPairing(session.phone_number);
  }

  async function disconnect() {
    if (!user) return;
    if (!confirm("Disconnect WhatsApp? You'll need to pair again.")) return;
    setWorking(true);
    await supabase
      .from("bot_session")
      .upsert(
        {
          user_id: user.id,
          status: "logout_requested",
          pairing_code: null,
          auth_state: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    setWorking(false);
    toast.success("Disconnect requested");
  }

  const status = session?.status ?? "disconnected";
  const isConnected = status === "connected";
  const isPairing =
    status === "pair_requested" || status === "pairing" || status === "waiting_for_phone";

  const statusVariant: Record<string, string> = {
    connected: "bg-green-500/15 text-green-700 dark:text-green-300",
    pairing: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    pair_requested: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    waiting_for_phone: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    connecting: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    logout_requested: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    disconnected: "bg-red-500/15 text-red-700 dark:text-red-300",
    unknown: "bg-muted text-muted-foreground",
  };

  // Step indicator (1-enter phone, 2-show code, 3-connected)
  const step = isConnected ? 3 : session?.pairing_code ? 2 : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Connect WhatsApp</h1>
        <p className="text-muted-foreground">
          Link your number, watch live status, and recover if anything stalls.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Connection</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-semibold capitalize">
              {isConnected ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : null}
              {status.replace(/_/g, " ")}
            </div>
            {session?.phone_number && (
              <div className="mt-1 text-sm text-muted-foreground">
                +{session.phone_number}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              Last sync: {timeAgo(session?.last_seen_at ?? null)}
            </div>
          </div>
          <Badge className={statusVariant[status] ?? statusVariant.unknown}>
            {status.replace(/_/g, " ")}
          </Badge>
        </div>

        {session?.last_error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <div className="font-medium text-red-700 dark:text-red-300">
                Last error
              </div>
              <div className="text-xs text-red-700/80 dark:text-red-200/80">
                {session.last_error}
              </div>
            </div>
          </div>
        )}

        {session?.phone_number && !isConnected && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={regenerateCode} disabled={working}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh pairing code
            </Button>
          </div>
        )}
      </Card>

      {!isConnected && (
        <Card className="p-6">
          {/* Stepper */}
          <ol className="mb-6 grid grid-cols-3 gap-2 text-xs">
            {["Enter number", "Enter pairing code on phone", "Connected"].map(
              (label, i) => {
                const idx = i + 1;
                const active = step === idx;
                const done = step > idx;
                return (
                  <li
                    key={label}
                    className={
                      "flex items-center gap-2 rounded-md border p-2 " +
                      (active
                        ? "border-primary bg-primary/5"
                        : done
                          ? "border-green-500/40 bg-green-500/5"
                          : "border-muted")
                    }
                  >
                    <span
                      className={
                        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                        (done
                          ? "bg-green-600 text-white"
                          : active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted")
                      }
                    >
                      {done ? "✓" : idx}
                    </span>
                    <span className={active ? "font-medium" : ""}>{label}</span>
                  </li>
                );
              },
            )}
          </ol>

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="phone" className="text-sm font-medium">
                  Your WhatsApp number
                </Label>
                <p className="text-xs text-muted-foreground">
                  Country code first, no <code>+</code> or spaces. e.g.{" "}
                  <code>2348012345678</code>
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
                <Button onClick={() => startPairing()} disabled={working}>
                  {working ? "Requesting…" : "Get pairing code"}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed bg-background p-5 text-center">
                <div className="text-sm font-medium text-muted-foreground">
                  Pairing code
                </div>
                <div className="mt-2 font-mono text-4xl tracking-widest">
                  {session?.pairing_code}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  On your phone open WhatsApp →{" "}
                  <strong>Settings → Linked Devices → Link a Device</strong>{" "}
                  → tap <strong>Link with phone number instead</strong> and
                  enter the code. It expires in ~60 seconds.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={regenerateCode}
                  disabled={working}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerate code
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPhoneInput(session?.phone_number ?? "");
                    supabase
                      .from("bot_session")
                      .upsert(
                        {
                          user_id: user!.id,
                          status: "disconnected",
                          pairing_code: null,
                          last_error: null,
                          updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id" },
                      )
                      .then(() => toast.success("Pairing reset"));
                  }}
                  disabled={working}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Restart pairing
                </Button>
              </div>
            </div>
          )}

          {isPairing && step === 1 && (
            <div className="mt-4 text-xs text-muted-foreground">
              Waiting for the worker to pick up your request…
            </div>
          )}
        </Card>
      )}

      {isConnected && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Linked device</h2>
              <p className="text-xs text-muted-foreground">
                AwayBot is running on +{session?.phone_number}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={regenerateCode} disabled={working}>
                <RotateCcw className="mr-2 h-4 w-4" /> Re-pair
              </Button>
              <Button variant="destructive" onClick={disconnect} disabled={working}>
                Disconnect
              </Button>
            </div>
          </div>
        </Card>
      )}

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
