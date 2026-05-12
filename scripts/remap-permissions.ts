// One-time migration: read/write/delete → select/insert/update/delete/execute
// Run with: DATABASE_URL=<prod-url> npx tsx scripts/remap-permissions.ts
//
// Mapping rules:
//   read   → select
//   write  → update   (loose write defaults to update; admins can refine)
//   delete → delete
//
// For ToolPermission rows, the level is upper-case:
//   READ   → SELECT
//   WRITE  → UPDATE (or EXECUTE if tool name looks like execute/run/eval/exec)
//   DELETE → DELETE

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function remapLevels(perms: string[]): string[] {
  const out = new Set<string>();
  for (const p of perms) {
    const lc = p.toLowerCase();
    if (lc === "read") out.add("select");
    else if (lc === "write") out.add("update");
    else if (lc === "delete") out.add("delete");
    else if (["select", "insert", "update", "execute"].includes(lc)) out.add(lc);
  }
  return Array.from(out);
}

function looksExecuteish(toolName: string): boolean {
  const n = toolName.toLowerCase().replace(/[^a-z]/g, "_");
  return /(^|_)(execute|run|call|invoke|exec|eval)(_|$)/.test(n);
}

async function main() {
  let updated = 0;

  // 1. WorkspaceUser.permissions
  const wus = await prisma.workspaceUser.findMany();
  for (const w of wus) {
    let perms: unknown;
    try {
      perms = JSON.parse(w.permissions);
    } catch {
      continue;
    }
    if (!Array.isArray(perms)) continue;
    const next = remapLevels(perms as string[]);
    if (JSON.stringify(next) === w.permissions) continue;
    await prisma.workspaceUser.update({
      where: { id: w.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log(`  workspaceUser ${w.id}: ${w.permissions} → ${JSON.stringify(next)}`);
    updated++;
  }

  // 2. UserDataSourceAccess.permissions
  const grants = await prisma.userDataSourceAccess.findMany();
  for (const g of grants) {
    let perms: unknown;
    try {
      perms = JSON.parse(g.permissions);
    } catch {
      continue;
    }
    if (!Array.isArray(perms)) continue;
    const next = remapLevels(perms as string[]);
    if (JSON.stringify(next) === g.permissions) continue;
    await prisma.userDataSourceAccess.update({
      where: { id: g.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log(`  directGrant ${g.id}: ${g.permissions} → ${JSON.stringify(next)}`);
    updated++;
  }

  // 3. ToolPermission.level
  const tools = await prisma.toolPermission.findMany();
  for (const t of tools) {
    const oldLevel = t.level.toUpperCase();
    let newLevel = oldLevel;
    if (oldLevel === "READ") newLevel = "SELECT";
    else if (oldLevel === "WRITE") newLevel = looksExecuteish(t.toolName) ? "EXECUTE" : "UPDATE";
    else if (oldLevel === "DELETE") newLevel = "DELETE";
    else if (["SELECT", "INSERT", "UPDATE", "EXECUTE"].includes(oldLevel)) continue;
    if (newLevel === oldLevel) continue;
    await prisma.toolPermission.update({
      where: { id: t.id },
      data: { level: newLevel },
    });
    console.log(`  toolPermission ${t.toolName} (${t.dataSourceId.slice(0, 8)}): ${t.level} → ${newLevel}`);
    updated++;
  }

  console.log(`\n✓ Updated ${updated} rows`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
