import Link from "next/link";
import { Plug, Users, AlertTriangle, Percent } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { QueriesByDayChart } from "./dashboard-chart";

export const dynamic = "force-dynamic";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
function fmtTime(iso: string): string {
  if (!iso || iso.startsWith("1970")) return "—";
  return new Date(iso).toLocaleString();
}

export default async function WorkPage() {
  const m = await getDashboardMetrics();

  return (
    <>
      <PageHeader
        title="Work"
        description="Live overview of users, connectors, and MCP query activity."
      />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Users" value={fmtNum(m.userCount)} icon={Users} href="/users" />
          <StatCard label="Connectors" value={fmtNum(m.connectorCount)} icon={Plug} href="/connections" />
          <StatCard label="Queries · 24h" value={fmtNum(m.queries24h)} icon={Percent} href="/audit" />
          <StatCard
            label="Errors · 24h"
            value={`${fmtNum(m.errors24h)} · ${fmtPct(m.errorRate24h)}`}
            icon={AlertTriangle}
            href="/audit"
            tone={m.errors24h > 0 ? "destructive" : "default"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Queries · last 7 days</CardTitle>
            </CardHeader>
            <CardContent>
              {m.byDay.every((d) => d.ok + d.error === 0) ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No MCP queries in the last 7 days.
                </p>
              ) : (
                <>
                  <QueriesByDayChart data={m.byDay} />
                  <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <Legend swatch="bg-primary" label="Successful" />
                    <Legend swatch="bg-destructive" label="Errors" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By connector · 7d</CardTitle>
            </CardHeader>
            <CardContent>
              {m.byConnection.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No activity.</p>
              ) : (
                <ul className="space-y-3">
                  {m.byConnection.map((c) => (
                    <li key={c.dataSourceId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Link
                          href={`/connections/${c.dataSourceId}`}
                          className="truncate font-medium hover:text-primary"
                        >
                          {c.name}
                        </Link>
                        <span className="text-muted-foreground">{fmtNum(c.queries)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${(c.successRate * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                          {fmtPct(c.successRate)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top users · 7d</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {m.topUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 text-right font-medium">Queries</th>
                    <th className="px-6 py-3 text-right font-medium">Errors</th>
                    <th className="px-6 py-3 font-medium">Last query</th>
                  </tr>
                </thead>
                <tbody>
                  {m.topUsers.map((u) => (
                    <tr key={u.userId} className="border-b border-border last:border-b-0">
                      <td className="px-6 py-3">
                        <Link href={`/users/${u.userId}`} className="font-medium hover:text-primary">
                          {u.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">{fmtNum(u.queries)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {u.errors > 0 ? (
                          <span className="text-destructive">{fmtNum(u.errors)}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{fmtTime(u.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: typeof Users;
  href: string;
  tone?: "default" | "destructive";
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-3 p-5">
          <div
            className={
              tone === "destructive"
                ? "flex h-9 w-9 items-center justify-center rounded-md bg-destructive/15 text-destructive"
                : "flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary"
            }
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="truncate text-lg font-semibold">{value}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
