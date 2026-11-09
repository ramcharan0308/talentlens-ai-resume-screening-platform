import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Normalizes PostgreSQL connection URLs for serverless and Neon pooling environments.
 * - For Neon serverless: enforces PgBouncer connection pooling endpoint (-pooler)
 * - Configures connect_timeout=30 to absorb Neon compute auto-suspend spin-up (~1.5-4s)
 * - Sets pgbouncer=true to ensure Prisma avoids unsupported prepared statements in transaction mode
 * - Sets connection_limit=10 to manage serverless connection exhaustion on free-tier limits (21 connections)
 */
function getDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes("neon.tech")) {
      // Enforce connection pooler endpoint for all application queries
      if (!parsed.hostname.includes("-pooler")) {
        const parts = parsed.hostname.split(".");
        parts[0] += "-pooler";
        parsed.hostname = parts.join(".");
      }
      // Configure 30s connection timeout and pool timeout for cold-start wakeups
      parsed.searchParams.set("connect_timeout", "30");
      parsed.searchParams.set("pool_timeout", "30");
      // Required by Neon PgBouncer pooler in transaction mode
      parsed.searchParams.set("pgbouncer", "true");
      // Limit connections per serverless container to prevent pool exhaustion
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "10");
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
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Always preserve on globalThis in both development (hot reload) and production (serverless warm container reuse)
globalForPrisma.prisma = prisma;

/**
 * Executes a Prisma database operation with automatic retry on transient cold-start or connection errors.
 * Specifically designed to handle Neon serverless auto-suspend wakeups (P1001 / PrismaClientInitializationError).
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const isTransientConnectionError =
        error?.code === "P1001" || // Can't reach database server
        error?.code === "P1002" || // Database server timed out
        error?.code === "P1008" || // Operations timed out
        error?.code === "P1017" || // Server has closed the connection
        error?.name === "PrismaClientInitializationError" ||
        (typeof error?.message === "string" && (
          error.message.includes("Can't reach database server") ||
          error.message.includes("connection closed") ||
          error.message.includes("Connection reset") ||
          error.message.includes("Connection terminated") ||
          error.message.includes("resuming from sleep")
        ));

      if (!isTransientConnectionError || attempt > maxRetries) {
        throw error;
      }

      console.warn(
        `[Database] Transient connection error detected (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 4000);
    }
  }
}

export default prisma;


