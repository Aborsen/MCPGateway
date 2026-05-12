import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="App-level configuration. (Most values are set via environment variables.)"
      />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Configured at deploy time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Setting label="DATABASE_URL" value={mask(process.env.DATABASE_URL)} />
            <Setting label="AUTH_URL" value={process.env.AUTH_URL ?? "(auto)"} />
            <Setting label="AUTH_SECRET" value={process.env.AUTH_SECRET ? "(set)" : "(unset!)"} />
            <Setting label="MCP_CONFIG_KEY" value={process.env.MCP_CONFIG_KEY ? "(set)" : "(unset!)"} />
            <Setting label="NODE_ENV" value={process.env.NODE_ENV ?? "?"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>AI Connectivity prototype</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">AI Connectivity</strong> is an MCP proxy + admin panel. It
              centralizes upstream MCP servers, manages user access via workspaces, and audits every tool call.
            </p>
            <p className="mt-3 flex items-center gap-2">
              <SettingsIcon className="h-3 w-3" />
              Version 0.1.0 prototype · Devart
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

function mask(v: string | undefined): string {
  if (!v) return "(unset!)";
  if (v.startsWith("file:")) return v;
  try {
    const url = new URL(v);
    return `${url.protocol}//${url.username ? "***@" : ""}${url.host}${url.pathname}`;
  } catch {
    return v.slice(0, 8) + "…";
  }
}
