import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  method: string;
  toolName: string | null;
  status: string;
  durationMs: number;
  createdAt: string;
  errorMessage: string | null;
};

export function UserActivityCard({ rows }: { rows: Row[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 20 MCP requests for this user.</CardDescription>
          </div>
          <Link
            href="/audit"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            View all in Audit →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">Tool</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-b-0"
                  title={r.errorMessage ?? undefined}
                >
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.method}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.toolName ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={r.status === "OK" ? "success" : "destructive"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {r.durationMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
