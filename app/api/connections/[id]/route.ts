import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import type { EncryptedConfig } from "@/lib/mcp/upstream-client";

const HeaderNameRe = /^[A-Za-z0-9-]+$/;

const CustomHeadersSchema = z
  .record(
    z.string().regex(HeaderNameRe, "header name must be A-Z, a-z, 0-9, or '-'"),
    z.string().max(2048),
  )
  .refine((v) => Object.keys(v).length <= 10, "max 10 custom headers");

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().min(1).max(40).optional(),
  upstreamUrl: z.string().url().optional(),
  description: z.string().max(500).nullable().optional(),
  authScheme: z.enum(["bearer", "customHeaders", "none"]).optional(),
  apiKey: z.string().nullable().optional(),
  customHeaders: CustomHeadersSchema.nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.type !== undefined) update.type = data.type;
  if (data.upstreamUrl !== undefined) update.upstreamUrl = data.upstreamUrl;
  if (data.description !== undefined) update.description = data.description;

  // Only touch credentials when the client sent at least one auth field.
  const touchedAuth =
    data.authScheme !== undefined || data.apiKey !== undefined || data.customHeaders !== undefined;
  if (touchedAuth) {
    const scheme = data.authScheme ?? "bearer";
    if (scheme === "none") {
      update.configEncrypted = null;
    } else if (scheme === "bearer") {
      if (data.apiKey) {
        const cfg: EncryptedConfig = { authScheme: "bearer", apiKey: data.apiKey };
        update.configEncrypted = await encryptJson(cfg);
      } else if (data.apiKey === null) {
        // explicit clear
        update.configEncrypted = null;
      }
      // omitted apiKey on bearer = keep existing credentials
    } else if (scheme === "customHeaders") {
      if (data.customHeaders && Object.keys(data.customHeaders).length > 0) {
        const cfg: EncryptedConfig = { authScheme: "customHeaders", customHeaders: data.customHeaders };
        update.configEncrypted = await encryptJson(cfg);
      } else if (data.customHeaders === null) {
        update.configEncrypted = null;
      }
    }
  }

  const updated = await prisma.dataSource.update({ where: { id }, data: update });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  await prisma.dataSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
