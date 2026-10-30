import { prisma } from "@invytra/db";
import { timingSafeEqual } from "node:crypto";
import { notifyToken, unipileClient } from "@/lib/unipile";

export const dynamic = "force-dynamic";

const NAME = /^invytra:([a-z0-9]{10,40})$/;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Unipile calls this when a LinkedIn login on its page succeeds: { status, account_id, name }.
 * `name` is the Invytra account it was for (we set it on the login link) and the link carries
 * a signature for that account. Records which Unipile account it is; the dashboard then
 * finishes connecting it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { status?: string; account_id?: string; name?: string } | null;
  const m = NAME.exec(String(body?.name ?? ""));
  const unipileId = String(body?.account_id ?? "");
  if (!m || !unipileId || unipileId.length > 100) return new Response("Bad request", { status: 400 });
  const accountId = m[1]!;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!same(token, notifyToken(accountId))) return new Response("Forbidden", { status: 403 });
  if (body?.status && !/SUCCESS/i.test(body.status)) return new Response("OK");

  // Only an account Unipile really has, and that no other Invytra account uses.
  const client = unipileClient();
  const real = client ? await client.getAccount(unipileId).catch(() => null) : null;
  if (!real) return new Response("Unknown account", { status: 404 });
  const owner = await prisma.linkedinAccount.findFirst({ where: { unipileAccountId: unipileId }, select: { id: true } });
  if (owner && owner.id !== accountId) return new Response("OK");
  await prisma.linkedinAccount.updateMany({ where: { id: accountId }, data: { unipileAccountId: unipileId } });
  return new Response("OK");
}
