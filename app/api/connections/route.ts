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

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens"),
  type: z.string().min(1).max(40),
  upstreamUrl: z.string().url(),
  description: z.string().max(500).optional().nullable(),
  authScheme: z.enum(["bearer", "customHeaders", "none"]).default("bearer"),
  apiKey: z.string().optional().nullable(),
  customHeaders: CustomHeadersSchema.optional().nullable(),
});

export async function GET() {
  await requireAdmin();
  const sources = await prisma.dataSource.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { toolPermissions: true, workspaceDataSources: true } },
    },
  });
  return NextResponse.json(sources);
}

function buildEncryptedConfig(input: {
  authScheme: "bearer" | "customHeaders" | "none";
  apiKey?: string | null;
  customHeaders?: Record<string, string> | null;
}): EncryptedConfig | null {
  if (input.authScheme === "none") return null;
  if (input.authScheme === "bearer") {
    return input.apiKey ? { authScheme: "bearer", apiKey: input.apiKey } : null;
  }
  if (input.authScheme === "customHeaders") {
    return input.customHeaders && Object.keys(input.customHeaders).length > 0
      ? { authScheme: "customHeaders", customHeaders: input.customHeaders }
      : null;
  }
  return null;
}

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  const existing = await prisma.dataSource.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }
  const cfg = buildEncryptedConfig({
    authScheme: data.authScheme,
    apiKey: data.apiKey ?? null,
    customHeaders: data.customHeaders ?? null,
  });
  const configEncrypted = cfg ? await encryptJson(cfg) : null;
  const created = await prisma.dataSource.create({
    data: {
      name: data.name,
      slug: data.slug,
      type: data.type,
      upstreamUrl: data.upstreamUrl,
      description: data.description ?? null,
      configEncrypted,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
