import "dotenv/config";
import { defineConfig } from "prisma/config";

// process.env.DATABASE_URL is used directly (not the strict `env()` helper)
// so `prisma generate` can run at build time without the env var set —
// it only needs the provider, not a real connection. Migrations and
// runtime queries still require DATABASE_URL.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
