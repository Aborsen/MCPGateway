import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "node:crypto";

const email = process.argv[2] ?? "alice@devart.com";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await prisma.userMcpToken.deleteMany({ where: { userId: user.id } });
  await prisma.userMcpToken.create({
    data: { userId: user.id, tokenHash, label: "test-script" },
  });

  console.log(`User: ${user.email}`);
  console.log(`Token URL: http://localhost:3000/api/mcp/${rawToken}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
