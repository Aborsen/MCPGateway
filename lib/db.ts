import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }
  return globalForPrisma.prisma;
}

// Lazy Proxy — importing this module never instantiates a client, only first
// method access does. This matters during `next build` page-data collection
// (run on Vercel before env vars are populated for the build container).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
