import type { PrismaClient } from "@invytra/db";
import { decryptSession, encryptSession } from "./session-crypto.js";
import type { AccountRepository, BrowserAccount, SessionStore, StorageState } from "./types.js";

export function prismaAccountRepository(prisma: PrismaClient): AccountRepository {
  return {
    async get(id): Promise<BrowserAccount | null> {
      const a = await prisma.linkedinAccount.findUnique({ where: { id } });
      return a && { id: a.id, label: a.label, proxyUrl: a.proxyUrl, timezone: a.timezone, status: a.status };
    },
    async markNeedsAttention(id, reason, screenshotPath) {
      await prisma.linkedinAccount.update({
        where: { id },
        data: {
          status: "NEEDS_ATTENTION",
          statusReason: screenshotPath ? `${reason} — screenshot: ${screenshotPath}` : reason,
        },
      });
    },
    async touch(id) {
      await prisma.linkedinAccount.update({ where: { id }, data: { lastActiveAt: new Date() } });
    },
  };
}

export function prismaSessionStore(prisma: PrismaClient, encryptionKey: string): SessionStore {
  return {
    async load(id) {
      const a = await prisma.linkedinAccount.findUnique({
        where: { id },
        select: { encryptedSession: true },
      });
      if (!a?.encryptedSession) return null;
      return JSON.parse(decryptSession(Buffer.from(a.encryptedSession), encryptionKey)) as StorageState;
    },
    async save(id, state) {
      await prisma.linkedinAccount.update({
        where: { id },
        data: {
          encryptedSession: encryptSession(JSON.stringify(state), encryptionKey),
          sessionUpdatedAt: new Date(),
        },
      });
    },
  };
}
