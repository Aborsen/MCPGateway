import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireView } from "@/lib/auth";
import { listToolsFromUpstream } from "@/lib/mcp/upstream-client";
import { classifyToolByName } from "@/lib/mcp/permission-filter";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteCtx) {
  const auth = await requireView("connections");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const ds = await prisma.dataSource.findUnique({ where: { id } });
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Try live first; fall back to stored discoveries if upstream is unreachable.
  let liveError: string | null = null;
  let liveTools: { name: string; description?: string }[] = [];
  try {
    const upstream = await listToolsFromUpstream({
      id: ds.id,
      type: ds.type,
      upstreamUrl: ds.upstreamUrl,
      configEncrypted: ds.configEncrypted,
    });
    liveTools = upstream.map((t) => ({ name: t.name, description: t.description }));
  } catch (err) {
    liveError = err instanceof Error ? err.message : String(err);
  }

  const stored = await prisma.toolPermission.findMany({
    where: { dataSourceId: id },
    orderBy: [{ level: "asc" }, { toolName: "asc" }],
  });
  const storedByName = new Map(stored.map((s) => [s.toolName, s]));

  // Merge live + stored. Live names take priority for ordering; stored-only
  // tools are appended (they may have been removed from upstream or upstream
  // is currently unreachable).
  const seen = new Set<string>();
  const merged: Array<{
    name: string;
    description?: string;
    level: string;
    classifiedBy: string;
    lastSeenAt: string | null;
    isLive: boolean;
  }> = [];

  for (const t of liveTools) {
    seen.add(t.name);
    const s = storedByName.get(t.name);
    merged.push({
      name: t.name,
      description: t.description,
      level: s?.level ?? classifyToolByName(t.name).toUpperCase(),
      classifiedBy: s?.classifiedBy ?? "heuristic",
      lastSeenAt: s?.lastSeenAt?.toISOString() ?? null,
      isLive: true,
    });
  }
  for (const s of stored) {
    if (seen.has(s.toolName)) continue;
    merged.push({
      name: s.toolName,
      description: undefined,
      level: s.level,
      classifiedBy: s.classifiedBy,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      isLive: false,
    });
  }

  return NextResponse.json({
    tools: merged,
    liveError,
    liveCount: liveTools.length,
    storedCount: stored.length,
  });
}
