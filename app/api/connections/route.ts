import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireView, requireEdit } from "@/lib/auth";
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
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens")
    .optional()
    .nullable(),
  type: z.string().min(1).max(40),
  upstreamUrl: z.string().url(),
  description: z.string().max(500).optional().nullable(),
  authScheme: z.enum(["bearer", "customHeaders", "none"]).default("bearer"),
  apiKey: z.string().optional().nullable(),
  customHeaders: CustomHeadersSchema.optional().nullable(),
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

export async function GET() {
  const auth = await requireView("connections");
  if (auth instanceof NextResponse) return auth;
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
  const auth = await requireEdit("connections");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  // Slug is derived from name unless the caller passed an explicit one.
  // Collisions get a numeric suffix (-2, -3, …) so admin never has to think about it.
  const slug = await uniqueSlug(data.slug?.trim() || slugifyName(data.name));
  const cfg = buildEncryptedConfig({
    authScheme: data.authScheme,
    apiKey: data.apiKey ?? null,
    customHeaders: data.customHeaders ?? null,
  });
  const configEncrypted = cfg ? await encryptJson(cfg) : null;
  const created = await prisma.dataSource.create({
    data: {
      name: data.name,
      slug,
      type: data.type,
      upstreamUrl: data.upstreamUrl,
      description: data.description ?? null,
      configEncrypted,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
