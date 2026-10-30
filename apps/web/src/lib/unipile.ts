import { unipileFromEnv, unipileName, unipileStatus, type PrismaClient, type UnipileAccount, type UnipileClient } from "@invytra/db";
import { parseProfileUrl } from "@invytra/shared";
import { getAccount, type Result } from "./accounts";

/*
 * Connecting a LinkedIn account through Unipile: Unipile hosts the login page (the person
 * logs in there, including any 2FA), keeps the session and gives the account an IP in its
 * country. Invytra never sees the password. Server-only: the API key stays here.
 */

/** Whether Unipile is set up on this server (UNIPILE_DSN and UNIPILE_API_KEY in .env). */
export function unipileEnabled(): boolean {
  return !!(process.env.UNIPILE_DSN?.trim() && process.env.UNIPILE_API_KEY?.trim());
}

export function unipileClient(): UnipileClient | null {
  return unipileFromEnv();
}

/**
 * How this account logs in: through Unipile when it's set up and the account has no proxy
 * of its own; an account with its own proxy uses Invytra's login window (its own IP).
 */
export function connectsViaUnipile(a: { engine: string; proxyUrl: string }): boolean {
  if (!unipileEnabled()) return false;
  return a.engine === "UNIPILE" || !a.proxyUrl;
}

const origin = () => (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");

/** A link to Unipile's login page for one account of this workspace (valid for an hour). */
export async function unipileConnectLink(
  prisma: PrismaClient,
  workspaceId: string,
  accountId: string,
  client: UnipileClient | null = unipileClient(),
): Promise<Result<string>> {
  if (!client) return { ok: false, error: "Unipile isn't set up on this server yet." };
  const a = await getAccount(prisma, workspaceId, accountId);
  const back = `${origin()}/app/accounts/${a.id}/unipile-return`;
  // An account Unipile still knows is reconnected in place (same id, same IP).
  const known = a.unipileAccountId ? await client.getAccount(a.unipileAccountId).catch(() => null) : null;
  const url = await client.hostedLink({
    type: known ? "reconnect" : "create",
    providers: ["LINKEDIN"],
    expiresOn: new Date(Date.now() + 3600_000).toISOString(),
    name: unipileName(a.id),
    success_redirect_url: back,
    failure_redirect_url: `${back}?failed=1`,
    ...(known && { reconnect_account: known.id }),
  });
  return { ok: true, value: url };
}

const slug = (url: string | null | undefined) => {
  if (!url) return null;
  const r = parseProfileUrl(url);
  return r.ok ? r.slug.toLowerCase() : null;
};

/** The newest working Unipile account with our name for this account (or its known id). */
function pick(all: UnipileAccount[], accountId: string, knownId: string | null): UnipileAccount | null {
  const ours = all.filter((u) => u.type?.toUpperCase() === "LINKEDIN" && (u.name === unipileName(accountId) || u.id === knownId));
  return ours.find((u) => unipileStatus(u) === "OK") ?? ours[0] ?? null;
}

/** Why connecting through Unipile didn't work (shown on the account page after the login). */
export type ConnectProblem = "unfinished" | "checking" | "rejected" | "duplicate" | "unavailable";

export const CONNECT_PROBLEM: Record<ConnectProblem, string> = {
  unfinished: "The LinkedIn login didn't finish. Try connecting again.",
  checking: "LinkedIn is still checking the login. Refresh this page in a minute.",
  rejected: "LinkedIn didn't accept the login. Try connecting again.",
  duplicate: "That LinkedIn profile is already connected as another account here. Use a different LinkedIn account.",
  unavailable: "Couldn't check the LinkedIn login right now. Refresh this page in a minute.",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After the person logged in on Unipile's page: find the account there, read whose LinkedIn
 * it is, and mark the Invytra account connected. Unipile can take a few seconds to finish,
 * so this looks a few times.
 */
export async function syncUnipileAccount(
  prisma: PrismaClient,
  workspaceId: string,
  accountId: string,
  client: UnipileClient | null = unipileClient(),
  opts: { tries?: number; delayMs?: number } = {},
): Promise<{ ok: true; name: string } | { ok: false; code: ConnectProblem }> {
  if (!client) return { ok: false, code: "unavailable" };
  const a = await getAccount(prisma, workspaceId, accountId);
  let found: UnipileAccount | null = null;
  const tries = opts.tries ?? 6;
  for (let i = 0; i < tries; i++) {
    found = pick(await client.listAccounts(), a.id, a.unipileAccountId);
    if (found && unipileStatus(found) === "OK") break;
    if (i < tries - 1) await wait(opts.delayMs ?? 2000);
  }
  if (!found) return { ok: false, code: "unfinished" };
  const status = unipileStatus(found);
  if (status !== "OK") return { ok: false, code: status === "CONNECTING" ? "checking" : "rejected" };

  const me = await client.me(found.id).catch(() => null);
  const profileName = [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim() || null;
  const publicId = me?.public_identifier ?? found.connection_params?.im?.publicIdentifier ?? null;
  const profileUrl = publicId ? `https://www.linkedin.com/in/${publicId}/` : null;

  // The same LinkedIn profile on two accounts would act twice from one person and read one inbox twice.
  const mine = slug(profileUrl);
  if (mine) {
    const others = await prisma.linkedinAccount.findMany({ where: { workspaceId, id: { not: a.id } }, select: { label: true, profileUrl: true } });
    const twin = others.find((o) => slug(o.profileUrl) === mine);
    if (twin) {
      if (found.id !== a.unipileAccountId) await client.deleteAccount(found.id).catch(() => undefined);
      return { ok: false, code: "duplicate" };
    }
  }

  const photo = me?.profile_picture_url ? await client.download(me.profile_picture_url).catch(() => null) : null;
  const now = new Date();
  await prisma.linkedinAccount.update({
    where: { id: a.id },
    data: {
      engine: "UNIPILE",
      unipileAccountId: found.id,
      status: "ACTIVE",
      statusReason: null,
      sessionUpdatedAt: now,
      connectedAt: a.connectedAt ?? now,
      ...(profileName && { profileName }),
      ...(profileUrl && { profileUrl }),
      ...(typeof me?.premium === "boolean" && { premium: me.premium, premiumCheckedAt: now }),
      ...(photo && { avatar: Buffer.from(photo.base64, "base64"), avatarType: photo.type, avatarUpdatedAt: now }),
    },
  });
  return { ok: true, name: profileName ?? a.label };
}
