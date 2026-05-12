import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } }, dataSource: { select: { name: true } } },
  });
  for (const r of rows) {
    console.log(
      `${r.createdAt.toISOString()} | ${r.method.padEnd(20)} | ${(r.toolName ?? "—").padEnd(25)} | ${r.user?.name ?? "—"} | ${r.dataSource?.name ?? "—"} | ${r.durationMs}ms | ${r.status}${r.errorMessage ? " :: " + r.errorMessage : ""}`,
    );
  }
  await prisma.$disconnect();
}
main();
