import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Sparkles, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            <span className="font-semibold">AwayBot</span>
          </div>
          <div className="flex gap-2">
            <Link to="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            Your WhatsApp assistant
            <br />
            for when you're away.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Welcomes new contacts, replies with AI outside business hours, and
            stays out of the way when you're online. Connect your number with a
            pairing code — no QR scan required.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/login">
              <Button size="lg">Connect WhatsApp</Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-5xl gap-6 md:grid-cols-3">
          {[
            {
              icon: Sparkles,
              title: "AI replies",
              body: "Powered by Lovable AI. You set the tone with a system prompt.",
            },
            {
              icon: Clock,
              title: "Business-hour aware",
              body: "Auto-replies only fire outside your work hours, or when you toggle Away.",
            },
            {
              icon: Shield,
              title: "Welcome once",
              body: "First-time contacts get your welcome message; never spammed twice.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
