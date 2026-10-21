import { DEFAULT_LIMITS, DEFAULT_WORKING_HOURS } from "@invytra/shared";
import type { PrismaClient } from "@invytra/db";

export interface AccountConfig {
  label: string;
  email: string | null;
  proxyUrl: string;
  timezone: string;
}

/** Reads ACCOUNT_1_*, ACCOUNT_2_*, … from the environment (Phase 0 test accounts). */
export function readAccountsFromEnv(env: NodeJS.ProcessEnv = process.env): AccountConfig[] {
  const accounts: AccountConfig[] = [];
  for (let n = 1; n <= 20; n++) {
    const label = env[`ACCOUNT_${n}_LABEL`]?.trim();
    if (!label) continue;
    accounts.push({
      label,
      email: env[`ACCOUNT_${n}_EMAIL`]?.trim() || null,
      proxyUrl: env[`ACCOUNT_${n}_PROXY_URL`]?.trim() ?? "",
      timezone: env[`ACCOUNT_${n}_TIMEZONE`]?.trim() || "Asia/Kolkata",
    });
  }
  return accounts;
}

/** Creates or updates the DB rows for the accounts in .env. Never touches saved sessions. */
export async function syncAccounts(prisma: PrismaClient, accounts: AccountConfig[]): Promise<void> {
  for (const a of accounts) {
    await prisma.linkedinAccount.upsert({
      where: { label: a.label },
      update: { email: a.email, proxyUrl: a.proxyUrl, timezone: a.timezone },
      create: {
        ...a,
        // Not usable until someone runs `pnpm account:login <label>`.
        status: "DISCONNECTED",
        statusReason: "Not logged in yet — run: pnpm account:login " + a.label,
        workingHours: DEFAULT_WORKING_HOURS,
        limits: DEFAULT_LIMITS,
      },
    });
  }
}
