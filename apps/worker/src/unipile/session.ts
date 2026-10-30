import { UnipileError, type PrismaClient, type UnipileClient } from "@invytra/db";
import { AccountBusyError, AccountNeedsAttentionError, AccountUnavailableError } from "../browser/errors.js";
import type { SessionManagerDeps } from "../browser/session-manager.js";
import type { UnipileCtx } from "./work.js";

/** Unipile isn't set up on this server (UNIPILE_DSN / UNIPILE_API_KEY missing from .env). */
export class UnipileNotConfiguredError extends Error {
  constructor() {
    super("This account is connected through Unipile, but UNIPILE_DSN / UNIPILE_API_KEY aren't set on the worker");
    this.name = "UnipileNotConfiguredError";
  }
}

/**
 * The Unipile version of withAccountSession: same guarantees (account must be ACTIVE,
 * one action at a time per account, stop the account when LinkedIn logged it out),
 * but no browser and no proxy of ours — Unipile holds the session and the IP.
 */
export async function withUnipileAccount<T>(
  prisma: PrismaClient,
  deps: Pick<SessionManagerDeps, "accounts" | "lock">,
  client: UnipileClient | null | undefined,
  accountId: string,
  conversationId: string | null | undefined,
  task: (ctx: UnipileCtx) => Promise<T>,
): Promise<T> {
  const account = await prisma.linkedinAccount.findUnique({
    where: { id: accountId },
    select: { id: true, status: true, timezone: true, unipileAccountId: true },
  });
  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.status !== "ACTIVE") throw new AccountUnavailableError(accountId, account.status);
  if (!client) throw new UnipileNotConfiguredError();
  if (!account.unipileAccountId) {
    await deps.accounts.markNeedsAttention(accountId, "LOGGED_OUT", null).catch(() => undefined);
    throw new AccountNeedsAttentionError(accountId, "LOGGED_OUT", null);
  }

  const token = await deps.lock.acquire(accountId);
  if (!token) throw new AccountBusyError(accountId);
  try {
    const result = await task({ client, accountId: account.unipileAccountId, account, prisma, conversationId });
    await deps.accounts.touch(accountId).catch(() => undefined);
    return result;
  } catch (err) {
    if (err instanceof UnipileError && err.disconnected) {
      await deps.accounts.markNeedsAttention(accountId, "LOGGED_OUT", null).catch(() => undefined);
      throw new AccountNeedsAttentionError(accountId, "LOGGED_OUT", null);
    }
    throw err;
  } finally {
    await deps.lock.release(accountId, token).catch(() => undefined);
  }
}
