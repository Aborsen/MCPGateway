import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot: promote known accounts to OWNER. Hit it once after the
// role-system deploy; remove the file in a follow-up commit.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (same as the other admin
// one-shots).

const TARGETS = ["admin@devart.com", "victorg@devart.com"];

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { email: string; before: string | null; after: string | null; ok: boolean; error?: string }[] = [];
  for (const email of TARGETS) {
    try {
      const before = await prisma.user.findUnique({
        where: { email },
        select: { role: true },
      });
      if (!before) {
        results.push({ email, before: null, after: null, ok: false, error: "user not found" });
        continue;
      }
      const updated = await prisma.user.update({
        where: { email },
        data: { role: "OWNER" },
        select: { role: true },
      });
      results.push({ email, before: before.role, after: updated.role, ok: true });
    } catch (err) {
      results.push({
        email,
        before: null,
        after: null,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 500 });
}
