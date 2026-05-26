// One-shot diagnostic: pull the latest `Objects` tool-call audit row and
// print its full response text so we can see what shape Skyvia returned
// (Markdown / JSON / other). Used to debug why the workspace allowedTables
// post-filter wasn't trimming the response.
//
// Run: npx tsx scripts/dump-objects-response.ts

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.auditLog.findMany({
    where: { toolName: "Objects" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      user: { select: { name: true, email: true } },
      dataSource: { select: { name: true, slug: true } },
    },
  });

  for (const r of rows) {
    console.log("============================================================");
    console.log(`Time:        ${r.createdAt.toISOString()}`);
    console.log(`User:        ${r.user?.name ?? "—"} <${r.user?.email ?? "—"}>`);
    console.log(`Connection:  ${r.dataSource?.name ?? "—"} (${r.dataSource?.slug ?? "—"})`);
    console.log(`Duration:    ${r.durationMs}ms`);
    console.log(`Status:      ${r.status}${r.errorMessage ? " :: " + r.errorMessage : ""}`);
    console.log(`Request:     ${r.requestJson?.slice(0, 300) ?? "—"}`);
    console.log(`Response size: ${r.responseJson?.length ?? 0} chars`);
    console.log("");
    // Strip the JSON envelope and show just the result.content[0].text — the
    // string our filter actually inspects.
    try {
      const parsed = JSON.parse(r.responseJson ?? "{}");
      // Two shapes: real response { jsonrpc, id, result: { content: [...] }}
      // or truncated envelope { _truncated, _originalBytes, preview }.
      if (parsed._truncated) {
        console.log("Response is TRUNCATED. Preview:");
        console.log(parsed.preview);
      } else if (parsed.result?.content) {
        for (const c of parsed.result.content) {
          if (c.type === "text") {
            console.log("--- result.content[].text ---");
            console.log(c.text);
            console.log("--- end ---");
          }
        }
      } else if (parsed.error) {
        console.log("ERROR result:");
        console.log(JSON.stringify(parsed.error, null, 2));
      } else {
        console.log("Other shape:");
        console.log(JSON.stringify(parsed, null, 2).slice(0, 1500));
      }
    } catch (e) {
      console.log("(failed to parse response as JSON)", e instanceof Error ? e.message : e);
      console.log(r.responseJson);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
