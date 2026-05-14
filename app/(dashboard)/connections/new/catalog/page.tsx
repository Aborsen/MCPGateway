import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { CONNECTOR_CATALOG } from "@/lib/connector-catalog";
import { isOAuthEntryConfigured } from "@/lib/connector-oauth";
import { CatalogGrid } from "./catalog-grid";

// The catalog page is a server component that pre-computes which OAuth
// entries are configured (env-vars present), then hands the data over to
// a client-side grid that owns the "click card -> open dialog" state.
//
// Doing the env-var check server-side keeps the OAuth client secrets
// well out of the bundle; the client only needs to know "is this entry
// usable right now or grey it out".

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  const entries = CONNECTOR_CATALOG.map((entry) => ({
    entry,
    oauthConfigured: isOAuthEntryConfigured(entry),
  }));

  return (
    <>
      <PageHeader
        title="Create connection"
        description="Pick a vendor. We'll generate an MCP server for the new connection on our side."
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
        <CatalogGrid entries={entries} />
      </div>
    </>
  );
}
