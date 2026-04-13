import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple Prisma instances in development (hot reload)
export const db: PrismaClient =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}

export async function connectDB() {
  try {
    await db.$connect();
    return true;
  } catch (e) {
    console.error("DB connection failed:", e);
    return false;
  }
}

export default db;
