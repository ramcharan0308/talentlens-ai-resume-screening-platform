import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Normalizes PostgreSQL connection URLs for serverless environments.
 * - For Neon serverless: uses connection pooling endpoint (-pooler) in production
 * - Appends connect_timeout=15 to absorb auto-suspend cold starts (~1.5-3.0s)
 */
function getDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes("neon.tech")) {
      // Use connection pooler endpoint in serverless/production if not already present
      if (process.env.NODE_ENV === "production" && !parsed.hostname.includes("-pooler")) {
        const parts = parsed.hostname.split(".");
        parts[0] += "-pooler";
        parsed.hostname = parts.join(".");
      }
      // Ensure connect_timeout=15 for Neon cold-start wakeups
      if (!parsed.searchParams.has("connect_timeout")) {
        parsed.searchParams.set("connect_timeout", "15");
      }
      return parsed.toString();
    }
  } catch {
    // If URL parsing fails, fall back to raw string
  }

  return rawUrl;
}

const dbUrl = getDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// Always preserve on globalThis in both development (hot reload) and production (serverless warm container reuse)
globalForPrisma.prisma = prisma;

export default prisma;

