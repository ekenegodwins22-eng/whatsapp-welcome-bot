import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});




const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
];

function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    welcome_message: "",
    system_prompt: "",
    timezone: "UTC",
    business_hours_start: 9,
    business_hours_end: 17,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("bot_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          welcome_message: data.welcome_message,
          system_prompt: data.system_prompt,
          timezone: data.timezone,
          business_hours_start: data.business_hours_start,
          business_hours_end: data.business_hours_end,
        });
      }
      setLoading(false);
    })();
  }, [user]);


  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("bot_config").upsert(
      { user_id: user.id, ...form, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Customize what the bot says and when it replies.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div>
          <Label>Welcome message</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Sent once to every new contact, no matter the time.
          </p>
          <Textarea
            rows={3}
            value={form.welcome_message}
            onChange={(e) =>
              setForm({ ...form, welcome_message: e.target.value })
            }
          />
        </div>

        <div>
          <Label>AI system prompt</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            How the AI should behave when replying for you.
          </p>
          <Textarea
            rows={5}
            value={form.system_prompt}
            onChange={(e) =>
              setForm({ ...form, system_prompt: e.target.value })
            }
          />
        </div>

        <div>
          <Label>Timezone</Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => setForm({ ...form, timezone: v })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Business hours start (0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.business_hours_start}
              onChange={(e) =>
                setForm({
                  ...form,
                  business_hours_start: Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label>Business hours end (0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.business_hours_end}
              onChange={(e) =>
                setForm({
                  ...form,
                  business_hours_end: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          AI auto-replies fire <strong>outside</strong> these hours (in the
          selected timezone), or anytime when Away mode is on.
        </p>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </Card>
    </div>
  );
}
