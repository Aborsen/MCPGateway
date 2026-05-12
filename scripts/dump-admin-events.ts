import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.adminEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      actor: { select: { name: true, email: true } },
      targetUser: { select: { name: true, email: true } },
    },
  });
  if (rows.length === 0) {
    console.log("(no admin events yet)");
  }
  for (const r of rows) {
    console.log(
      `${r.createdAt.toISOString()} | ${r.eventType.padEnd(22)} | actor=${r.actor?.email ?? "—"} | target=${r.targetUser?.email ?? r.targetLabel ?? "—"} ${r.detailsJson ? "| details=" + r.detailsJson.slice(0, 80) : ""}`,
    );
  }
  await prisma.$disconnect();
}

main();
