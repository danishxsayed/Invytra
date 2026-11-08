import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./usage.js";
export * from "./secrets.js";
export * from "./connect-token.js";
export * from "./unipile.js";

/** One shared Prisma client per process. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Workspace that holds accounts configured in .env (Phase 0 CLI). Created by migration. */
export const DEFAULT_WORKSPACE_ID = "default";
export * from "./replies.js";
export * from "./ai-line.js";
export * from "./plan-limits.js";
export * from "./mailbox.js";
export * from "./dns-check.js";
export * from "./mail-send.js";
export * from "./warmup-content.js";
export * from "./warmup-imap.js";
export * from "./inbox-reader.js";
export * from "./unsubscribe.js";
export * from "./bounces.js";
export * from "./verify.js";
export * from "./verify-credits.js";
export * from "./ai-credits.js";
export * from "./handwritten.js";
export * from "./voice.js";
export * from "./razorpay.js";
export * from "./billing.js";
