import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { findCatalogEntry, isCatalogEntryReady } from "@/lib/connector-catalog";
import type { EncryptedConfig } from "@/lib/mcp/upstream-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Submits the "Connect to <vendor>" dialog. Builds an EncryptedConfig
// from the OAuth tokens (or pasted PAT) the dialog collected, creates a
// new DataSource pointing at our own /api/upstream-mcp/<adapter>/<id>
// route, and returns the new connection's id so the dialog can refresh
// the list and navigate.
//
// Auth-flavour mapping:
//   - refreshToken present  -> authScheme="oauth", store refresh token +
//                              providerKey so upstream-client can refresh
//                              transparently when the access token nears
//                              expiry.
//   - refreshToken missing  -> authScheme="bearer", treat the token as a
//                              non-expiring PAT. (HubSpot Private Apps,
//                              Supabase service_role keys, etc.)

const BodySchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  accessToken: z.string().min(1).max(4096),
  refreshToken: z.string().max(4096).optional(),
  // epoch ms — caller (the dialog) computes this from the OAuth response's
  // expires_in. PATs omit it.
  expiresAt: z.number().int().positive().optional(),
  // Free-form per-vendor settings. The dialog also forwards OAuth-supplied
  // extras here (e.g. Salesforce instance_url, Zoho api_domain) so the
  // adapter can route to the right per-org URL.
  advancedSettings: z.record(z.string(), z.unknown()).optional(),
});

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "connection"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  if (!(await prisma.dataSource.findUnique({ where: { slug: base } }))) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    if (!(await prisma.dataSource.findUnique({ where: { slug: candidate } }))) return candidate;
    n++;
    if (n > 999) throw new Error("Couldn't find a free slug after 999 attempts");
  }
}

function stringifyExtra(input: Record<string, unknown> | undefined): Record<string, string> {
  // EncryptedConfig.extra is Record<string,string> — coerce booleans /
  // numbers to strings so adapters can do `cfg.extra?.foo === "true"`.
  if (!input) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

export async function POST(request: Request) {
  const auth = await requirePermission("connections.create");
  if (auth instanceof NextResponse) return auth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid_body" },
      { status: 400 },
    );
  }

  const entry = findCatalogEntry(body.slug);
  if (!entry || !isCatalogEntryReady(entry)) {
    return NextResponse.json({ error: "unknown_or_not_ready_connector" }, { status: 404 });
  }
  if (!entry.adapter) {
    return NextResponse.json({ error: "catalog_entry_has_no_adapter" }, { status: 500 });
  }

  // For OAuth-providers we tag the EncryptedConfig with the providerKey
  // so the refresh helper in upstream-client.ts can find the right token
  // endpoint + client credentials.
  const providerKey =
    entry.auth?.kind === "oauth" || entry.auth?.kind === "pat"
      ? entry.auth.provider
      : undefined;

  const extra = stringifyExtra(body.advancedSettings);

  const cfg: EncryptedConfig = body.refreshToken
    ? {
        authScheme: "oauth",
        oauth: {
          providerKey: providerKey ?? entry.slug,
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          expiresAt: body.expiresAt,
        },
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
      }
    : {
        // No refresh token: treat as a Private App / service_role key.
        authScheme: "bearer",
        apiKey: body.accessToken,
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
      };

  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) {
    return NextResponse.json({ error: "oidc_issuer_not_set" }, { status: 500 });
  }

  const slug = await uniqueSlug(slugifyName(body.name));
  const configEncrypted = await encryptJson(cfg);

  // Two-step: insert with a placeholder URL so we have an ID, then patch
  // the URL to include that ID. (DataSource.upstreamUrl is required and
  // unique-ish to URL, but the field itself isn't constrained.)
  const created = await prisma.dataSource.create({
    data: {
      name: body.name,
      slug,
      type: entry.type,
      upstreamUrl: "about:adapter-placeholder",
      description: entry.description,
      configEncrypted,
    },
  });
  const adapterUrl = `${issuer}/api/upstream-mcp/${entry.adapter}/${created.id}`;
  await prisma.dataSource.update({
    where: { id: created.id },
    data: { upstreamUrl: adapterUrl },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
