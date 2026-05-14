import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Badge } from "@/components/ui/badge";
import { CONNECTOR_CATALOG, isCatalogEntryReady } from "@/lib/connector-catalog";
import { isOAuthEntryConfigured } from "@/lib/connector-oauth";

// Catalog grid. Cards are clickable iff (a) the connector is wired up and
// (b) the OAuth credentials are present in the env. The OAuth-not-configured
// state still renders the card but disables the link and shows a small
// "Not configured" badge so admins know to set the env vars.

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  return (
    <>
      <PageHeader
        title="Create connection"
        description="Pick a vendor. We'll handle the upstream MCP setup."
        actions={
          <Link
            href="/connections"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to connections
          </Link>
        }
      />

      <div className="p-6">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {CONNECTOR_CATALOG.map((entry) => {
            const ready = isCatalogEntryReady(entry);
            const oauthOk = isOAuthEntryConfigured(entry);
            const enabled = ready && oauthOk;
            const card = (
              <div
                className={
                  "flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-all " +
                  (enabled
                    ? "hover:border-primary/60 hover:bg-accent/30 cursor-pointer"
                    : "opacity-60")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={
                      "flex h-10 w-10 items-center justify-center rounded-md border text-sm font-semibold " +
                      entry.badge.classes
                    }
                  >
                    {entry.badge.label}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {!ready && (
                      <Badge variant="outline" className="text-[10px]">
                        Coming soon
                      </Badge>
                    )}
                    {ready && !oauthOk && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-amber-400 border-amber-500/40"
                      >
                        Not configured
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="font-medium leading-tight">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">{entry.description}</div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {entry.vendor}
                </div>
              </div>
            );

            if (!enabled) {
              return (
                <div key={entry.slug} title={!oauthOk && ready ? "Set CONNECTOR_OAUTH_* env vars to enable" : undefined}>
                  {card}
                </div>
              );
            }
            return (
              <Link key={entry.slug} href={`/connections/new/catalog/${entry.slug}`}>
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
