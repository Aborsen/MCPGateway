import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const rows = await prisma.auditLog.findMany({
    where: { method: { in: ["auth", "malformed", "invalid"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`Found ${rows.length} rows`);
  for (const r of rows) {
    console.log(
      ` - ${r.createdAt.toISOString()} ${r.method.padEnd(10)} ${r.status.padEnd(6)} ${r.errorMessage ?? ""}`,
    );
  }
  await prisma.$disconnect();
}
main();
