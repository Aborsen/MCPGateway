import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens"),
  type: z.string().min(1).max(40),
  upstreamUrl: z.string().url(),
  description: z.string().max(500).optional().nullable(),
  apiKey: z.string().optional().nullable(),
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
  const configEncrypted = data.apiKey ? await encryptJson({ apiKey: data.apiKey }) : null;
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
