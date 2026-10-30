import { createHmac } from "node:crypto";
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
 * How "Connect LinkedIn" works for this account: Unipile's login page; a choice, for an
 * account that has its own proxy (Unipile's IP, or the login window through that proxy);
 * or Invytra's own login window when Unipile isn't set up.
 */
export type ConnectMode = "unipile" | "choose" | "browser";

export function connectMode(a: { engine: string; proxyUrl: string }): ConnectMode {
  if (!unipileEnabled()) return "browser";
  if (a.engine === "UNIPILE" || !a.proxyUrl) return "unipile";
  return "choose";
}

const origin = () => (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Whether Invytra runs on this computer or a private network (local development). Browsers
 * block a public page (Unipile's login) from sending the window to such an address, so the
 * dashboard watches for the login to finish instead.
 */
export function isLocalOrigin(o = origin()): boolean {
  try {
    const h = new URL(o).hostname;
    return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "[::1]" ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  } catch {
    return true;
  }
}

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
  // Unipile doesn't keep the name we give it, so the account its login creates is recognised
  // by Unipile telling us (notify_url, when Invytra is online) or by when it appeared.
  await prisma.linkedinAccount.update({ where: { id: a.id }, data: { unipileLinkAt: new Date() } });
  const url = await client.hostedLink({
    type: known ? "reconnect" : "create",
    providers: ["LINKEDIN"],
    expiresOn: new Date(Date.now() + 3600_000).toISOString(),
    name: unipileName(a.id),
    // Straight back to Invytra when it's on the internet. Locally, Unipile shows its own
    // "connected" screen and the dashboard notices the login by itself (pollUnipileLogin).
    ...(!isLocalOrigin() && {
      success_redirect_url: back,
      failure_redirect_url: `${back}?failed=1`,
      bypass_success_screen: true,
      notify_url: `${origin()}/api/unipile/notify?t=${notifyToken(a.id)}`,
    }),
    ...(known && { reconnect_account: known.id }),
  });
  return { ok: true, value: url };
}

const slug = (url: string | null | undefined) => {
  if (!url) return null;
  const r = parseProfileUrl(url);
  return r.ok ? r.slug.toLowerCase() : null;
};

/**
 * Unipile's account for this Invytra account: the one already linked (a reconnect keeps its
 * id), else the newest LinkedIn account that appeared since this login was opened and that no
 * Invytra account has claimed. `extras` are repeats of the same profile from earlier tries.
 */
async function findLogin(
  prisma: PrismaClient,
  all: UnipileAccount[],
  a: { unipileAccountId: string | null; unipileLinkAt: Date | null; createdAt: Date },
): Promise<{ found: UnipileAccount | null; extras: UnipileAccount[] }> {
  const linked = a.unipileAccountId ? all.find((u) => u.id === a.unipileAccountId) : undefined;
  if (linked) return { found: linked, extras: [] };
  // A login link is valid for an hour: only accounts that appeared in that window can be this one.
  const start = (a.unipileLinkAt ?? a.createdAt).getTime();
  const fresh = all.filter((u) => {
    const at = u.created_at ? Date.parse(u.created_at) : NaN;
    return u.type?.toUpperCase() === "LINKEDIN" && at >= start - 60_000 && at <= start + 3 * 3600_000;
  });
  if (fresh.length === 0) return { found: null, extras: [] };
  const claimed = new Set(
    (await prisma.linkedinAccount.findMany({ where: { unipileAccountId: { in: fresh.map((u) => u.id) } }, select: { unipileAccountId: true } })).map(
      (x) => x.unipileAccountId,
    ),
  );
  const free = fresh.filter((u) => !claimed.has(u.id)).sort((x, y) => Date.parse(y.created_at!) - Date.parse(x.created_at!));
  const found = free.find((u) => unipileStatus(u) === "OK") ?? free[0] ?? null;
  const who = (u: UnipileAccount) => u.connection_params?.im?.id ?? u.connection_params?.im?.publicIdentifier ?? null;
  const extras = found && who(found) ? free.filter((u) => u.id !== found.id && who(u) === who(found)) : [];
  return { found, extras };
}

/** Signs the webhook link for one account, so only Unipile (which got the link) can call it. */
export function notifyToken(accountId: string): string {
  const key = process.env.SESSION_ENCRYPTION_KEY ?? "";
  return createHmac("sha256", key).update(`unipile-notify:${accountId}`).digest("base64url").slice(0, 32);
}

/** Why connecting through Unipile didn't work (shown on the account page after the login). */
export type ConnectProblem = "unfinished" | "checking" | "rejected" | "duplicate" | "elsewhere" | "unavailable";

export const CONNECT_PROBLEM: Record<ConnectProblem, string> = {
  unfinished: "The LinkedIn login didn't finish. Try connecting again.",
  checking: "LinkedIn is still checking the login. Refresh this page in a minute.",
  rejected: "LinkedIn didn't accept the login. Try connecting again.",
  duplicate: "That LinkedIn profile is already connected as another account here. Use a different LinkedIn account.",
  elsewhere: "This LinkedIn account is already on Invytra under a different user, so it wasn't connected. Use a different LinkedIn account.",
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
  let extras: UnipileAccount[] = [];
  const tries = opts.tries ?? 6;
  for (let i = 0; i < tries; i++) {
    ({ found, extras } = await findLogin(prisma, await client.listAccounts(), a));
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

  // One LinkedIn profile is on Invytra once: not on two accounts here, and not under another user.
  const mine = slug(profileUrl);
  if (mine) {
    const others = await prisma.linkedinAccount.findMany({
      where: { id: { not: a.id }, profileUrl: { contains: `/in/${mine}`, mode: "insensitive" } },
      select: { workspaceId: true, profileUrl: true },
    });
    const twins = others.filter((o) => slug(o.profileUrl) === mine);
    const twin = twins.find((o) => o.workspaceId === workspaceId) ?? twins[0];
    if (twin) {
      // This login's connection at Unipile isn't kept (Unipile bills each one).
      if (found.id !== a.unipileAccountId) await client.deleteAccount(found.id).catch(() => undefined);
      return { ok: false, code: twin.workspaceId === workspaceId ? "duplicate" : "elsewhere" };
    }
  }

  const photo = me?.profile_picture_url ? await client.download(me.profile_picture_url).catch(() => null) : null;
  const now = new Date();
  await prisma.linkedinAccount.update({
    where: { id: a.id },
    data: {
      engine: "UNIPILE",
      unipileAccountId: found.id,
      unipileLinkAt: null,
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
  // The same LinkedIn logged in again on an earlier try: Unipile bills each one, so remove repeats.
  for (const x of extras) await client.deleteAccount(x.id).catch(() => undefined);
  return { ok: true, name: profileName ?? a.label };
}
