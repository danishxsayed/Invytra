import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./usage.js";

/** One shared Prisma client per process. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Workspace that holds accounts configured in .env (Phase 0 CLI). Created by migration. */
export const DEFAULT_WORKSPACE_ID = "default";
