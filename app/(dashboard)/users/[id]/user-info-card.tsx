import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UserInfoCard({
  queries24h,
  queries7d,
  errors7d,
  lastAuditAt,
  lastLoginAt,
  topTools,
}: {
  queries24h: number;
  queries7d: number;
  errors7d: number;
  lastAuditAt: string | null;
  lastLoginAt: string | null;
  topTools: { name: string; count: number }[];
}) {
  const errorRate = queries7d === 0 ? null : errors7d / queries7d;

  return (
    <Card>
      <CardHeader>
        <CardTitle>User info</CardTitle>
        <CardDescription>MCP usage and dashboard sign-in activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Queries · 24h" value={fmtNum(queries24h)} />
          <Stat label="Queries · 7d" value={fmtNum(queries7d)} />
          <Stat
            label="Error rate · 7d"
            value={errorRate === null ? "—" : `${(errorRate * 100).toFixed(1)}%`}
            tone={errorRate !== null && errorRate > 0 ? "destructive" : "default"}
          />
          <Stat label="Last MCP query" value={relative(lastAuditAt)} />
          <Stat label="Last sign-in" value={relative(lastLoginAt)} />
        </div>

        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Top tools · 7d
          </div>
          {topTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tool calls in the last 7 days.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topTools.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{t.name}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtNum(t.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "destructive";
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          tone === "destructive"
            ? "mt-1 text-base font-semibold text-destructive tabular-nums"
            : "mt-1 text-base font-semibold tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relative(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (sec < 60) return fmt.format(-sec, "second");
  const min = Math.round(sec / 60);
  if (min < 60) return fmt.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return fmt.format(-hr, "hour");
  const day = Math.round(hr / 24);
  if (day < 30) return fmt.format(-day, "day");
  const mo = Math.round(day / 30);
  if (mo < 12) return fmt.format(-mo, "month");
  return fmt.format(-Math.round(mo / 12), "year");
}
