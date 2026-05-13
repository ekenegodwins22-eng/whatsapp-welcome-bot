import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/dashboard/contacts")({
  component: ContactsPage,
});

type Contact = {
  id: string;
  phone: string;
  display_name: string | null;
  first_seen_at: string;
  welcomed_at: string | null;
};

function ContactsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Contact[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("first_seen_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contacts</h1>
        <p className="text-muted-foreground">
          Everyone who has messaged you. Each gets the welcome message exactly once.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>First seen</TableHead>
              <TableHead>Welcomed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No contacts yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.phone}</TableCell>
                <TableCell>{c.display_name ?? "—"}</TableCell>
                <TableCell>
                  {new Date(c.first_seen_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {c.welcomed_at ? (
                    <span className="text-green-600">Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
