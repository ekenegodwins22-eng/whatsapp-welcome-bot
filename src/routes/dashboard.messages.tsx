import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/messages")({
  component: MessagesPage,
});

type Msg = {
  id: string;
  phone: string;
  direction: "in" | "out";
  body: string;
  replied_by_ai: boolean;
  created_at: string;
};

function MessagesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Msg[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = () =>
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200)
        .then(({ data }) => setRows((data ?? []) as Msg[]));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground">
          Recent incoming messages and bot replies.
        </p>
      </div>

      <Card className="divide-y">
        {rows.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            No messages yet.
          </div>
        )}
        {rows.map((m) => (
          <div key={m.id} className="flex items-start gap-3 p-4">
            <div
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                m.direction === "in" ? "bg-blue-500" : "bg-green-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{m.phone}</span>
                <span>·</span>
                <span>{new Date(m.created_at).toLocaleString()}</span>
                {m.direction === "out" && (
                  <Badge variant="secondary" className="text-[10px]">
                    {m.replied_by_ai ? "AI" : "Welcome"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
