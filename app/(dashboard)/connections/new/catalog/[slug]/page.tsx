import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Badge } from "@/components/ui/badge";
import { findCatalogEntry, isCatalogEntryReady } from "@/lib/connector-catalog";
import { getOAuthCredentials, getRedirectUri } from "@/lib/connector-oauth";
import { ConnectButton } from "./connect-button";

// Per-connector setup screen. For OAuth-based catalog entries this is just
// a "Connect with <vendor>" CTA that kicks off the OAuth dance via the
// /api/connections/oauth/<slug>/start route. The actual DataSource row is
// created at the end of the OAuth callback once we've got tokens.
//
// For db-adapter entries (Postgres / BigQuery / Snowflake / Databricks) —
// not yet shipped — this page will render a connection-config form
// instead. They're "coming soon" in the catalog right now.

export const dynamic = "force-dynamic";

export default async function CatalogConnectorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findCatalogEntry(slug);
  if (!entry || !isCatalogEntryReady(entry)) {
    notFound();
  }

  const isOAuth = entry.auth?.kind === "oauth";
  const providerKey =
    entry.auth?.kind === "oauth" ? entry.auth.provider : undefined;
  const creds = providerKey ? getOAuthCredentials(providerKey) : undefined;
  const redirectUri = providerKey ? getRedirectUri(entry.slug) : null;

  return (
    <>
      <PageHeader
        title={entry.name}
        description={entry.description}
        actions={
          <Link
            href="/connections/new/catalog"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to catalog
          </Link>
        }
      />

      <div className="p-6">
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div
              className={
                "flex h-12 w-12 items-center justify-center rounded-md border text-base font-semibold " +
                entry.badge.classes
              }
            >
              {entry.badge.label}
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-medium">{entry.name}</div>
              <div className="text-xs text-muted-foreground">{entry.vendor}</div>
            </div>
            <Badge variant="outline">
              {entry.kind === "saas-remote-mcp"
                ? "Remote MCP"
                : entry.kind === "saas-adapter"
                  ? "Hosted by us"
                  : "Database"}
            </Badge>
          </div>

          {isOAuth ? (
            <div className="space-y-4 rounded-lg border border-border bg-card p-6">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Connect with {entry.name}</h3>
                <p className="text-xs text-muted-foreground">
                  You&apos;ll be redirected to {entry.vendor} to authorize MCP Gateway. We&apos;ll
                  store the OAuth tokens encrypted (libsodium) and exchange them for tools
                  through the proxy.
                </p>
              </div>

              {creds && redirectUri ? (
                <ConnectButton slug={entry.slug} name={entry.name} />
              ) : (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="font-medium">OAuth credentials not configured</div>
                  <p>
                    Set the env vars{" "}
                    <code className="font-mono">
                      CONNECTOR_OAUTH_{providerKey?.replace(/-/g, "_").toUpperCase()}_CLIENT_ID
                    </code>{" "}
                    and{" "}
                    <code className="font-mono">
                      CONNECTOR_OAUTH_{providerKey?.replace(/-/g, "_").toUpperCase()}_CLIENT_SECRET
                    </code>{" "}
                    in your Vercel project, then register{" "}
                    <code className="break-all font-mono">{redirectUri}</code> as a redirect URI in
                    the {entry.vendor} developer console.
                  </p>
                </div>
              )}

              {redirectUri && (
                <div className="space-y-1 rounded-md border border-border/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Redirect URI to register in {entry.vendor}
                  </div>
                  <div className="break-all font-mono text-xs">{redirectUri}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              This connector type isn&apos;t finished yet. Check back soon.
            </div>
          )}

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              <span>
                Once connected, the new connection appears in{" "}
                <Link href="/connections" className="text-primary hover:underline">
                  Connections
                </Link>{" "}
                — you can rename it, add it to workspaces, and override tool levels just like
                any other connection.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
