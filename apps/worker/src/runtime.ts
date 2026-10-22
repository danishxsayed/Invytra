import { DEFAULT_WORKSPACE_ID, prisma } from "@invytra/db";
import { Redis } from "ioredis";
import { join, resolve } from "node:path";
import { AccountLock } from "./browser/account-lock.js";
import { prismaAccountRepository, prismaSessionStore } from "./browser/prisma-adapters.js";
import type { SessionManagerDeps } from "./browser/session-manager.js";
import { readAccountsFromEnv, syncAccounts } from "./config/accounts.js";
import { loadEnv, type Env } from "./env.js";

/** Wires real Postgres/Redis/Playwright dependencies for scripts and the worker. */
export async function createRuntime() {
  const env: Env = loadEnv();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  await redis.connect();
  await syncAccounts(prisma, readAccountsFromEnv());

  const dataDir = resolve(import.meta.dirname, "../../..", env.DATA_DIR);
  const deps: SessionManagerDeps = {
    accounts: prismaAccountRepository(prisma),
    sessions: prismaSessionStore(prisma, env.SESSION_ENCRYPTION_KEY),
    lock: new AccountLock(redis),
    baseUrl: env.LINKEDIN_BASE_URL,
    screenshotDir: join(dataDir, "screenshots"),
    launch: { headless: env.HEADLESS, allowNoProxy: env.ALLOW_NO_PROXY },
  };

  const findAccount = async (label: string) => {
    // CLI commands work on the .env accounts, which live in the default workspace.
    const account = await prisma.linkedinAccount.findUnique({
      where: { workspaceId_label: { workspaceId: DEFAULT_WORKSPACE_ID, label } },
    });
    if (!account) {
      throw new Error(`No account labelled "${label}". Add ACCOUNT_n_LABEL="${label}" to .env.`);
    }
    return account;
  };

  const close = async () => {
    await prisma.$disconnect();
    redis.disconnect();
  };

  return { env, prisma, redis, deps, findAccount, close };
}
