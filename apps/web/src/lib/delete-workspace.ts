import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { unipileFromEnv, videoPath, voiceFromEnv, type PrismaClient, type UnipileClient, type VoiceMaker } from "@invytra/db";
import type { Result } from "./accounts";
import { dataDir } from "./evidence";
import { verifyPassword } from "./password";

/*
 * Deleting a whole workspace (owner only). Everything goes: campaigns, accounts and their
 * logins, mailboxes, lists, leads, inbox, voices, videos, settings. Only paid invoices are
 * kept (copied to archived_invoices), because tax law requires keeping them as issued.
 * People who belonged only to this workspace lose their login too.
 */

export interface DeleteTools {
  /** Disconnects LinkedIn accounts at the login service (undefined = from .env). */
  unipile?: Pick<UnipileClient, "deleteAccount"> | null;
  /** Deletes voice copies at the voice service (undefined = from .env). */
  voice?: Pick<VoiceMaker, "remove"> | null;
  /** Where failure screenshots live (default DATA_DIR). */
  dataDir?: string;
}

export async function deleteWorkspace(
  prisma: PrismaClient,
  me: { userId: string; workspaceId: string; role: string },
  input: { name: string; password: string },
  tools: DeleteTools = {},
): Promise<Result> {
  if (me.role !== "OWNER") return { ok: false, error: "Only the workspace owner can delete the workspace." };
  const ws = await prisma.workspace.findUnique({ where: { id: me.workspaceId }, select: { id: true, name: true } });
  if (!ws) return { ok: false, error: "This workspace is already gone." };
  if (input.name.trim().toLowerCase() !== ws.name.trim().toLowerCase()) return { ok: false, error: `Type the workspace name exactly: ${ws.name}` };
  const user = await prisma.user.findUnique({ where: { id: me.userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(input.password, user?.passwordHash))) return { ok: false, error: "That password isn't right." };

  // Stop everything first, so nothing new starts while it's being deleted.
  const w = { workspaceId: ws.id };
  await prisma.$transaction([
    prisma.campaign.updateMany({ where: { ...w, status: "ACTIVE" }, data: { status: "PAUSED" } }),
    prisma.emailCampaign.updateMany({ where: { ...w, status: { in: ["ACTIVE", "SCHEDULED"] } }, data: { status: "PAUSED" } }),
    prisma.linkedinAccount.updateMany({ where: w, data: { status: "PAUSED", statusReason: "PAUSED (workspace being deleted)" } }),
  ]);
  if (await prisma.action.count({ where: { status: "RUNNING", account: w } }))
    return { ok: false, error: "One last LinkedIn action is finishing right now. Everything is paused; try again in a minute." };

  const [accounts, voices, purchases, members] = await Promise.all([
    prisma.linkedinAccount.findMany({ where: w, select: { id: true, unipileAccountId: true } }),
    prisma.voiceClone.findMany({ where: w, select: { providerVoiceId: true } }),
    prisma.verifyCreditPurchase.findMany({ where: { ...w, invoiceNumber: { not: null } } }),
    prisma.membership.findMany({ where: w, select: { userId: true } }),
  ]);

  // Outside services: best effort (a failure there never keeps the workspace alive).
  const unipile = tools.unipile !== undefined ? tools.unipile : unipileFromEnv();
  for (const a of accounts) if (a.unipileAccountId) await unipile?.deleteAccount(a.unipileAccountId).catch(() => undefined);
  const voice = tools.voice !== undefined ? tools.voice : voiceFromEnv();
  for (const v of voices) await voice?.remove(v.providerVoiceId).catch(() => undefined);

  // Invoices are kept, as issued.
  if (purchases.length)
    await prisma.archivedInvoice.createMany({
      skipDuplicates: true,
      data: purchases.map((p) => ({
        invoiceNumber: p.invoiceNumber!,
        workspaceId: ws.id,
        workspaceName: ws.name,
        credits: p.credits,
        kind: p.kind,
        priceCents: p.priceCents,
        currency: p.currency,
        paidAt: p.paidAt,
        method: p.method,
        paymentRef: p.paymentRef,
        razorpayOrderId: p.razorpayOrderId,
        invoice: p.invoice ?? undefined,
      })),
    });

  // Everything else in the database goes with the workspace (cascade).
  await prisma.workspace.delete({ where: { id: ws.id } });
  // People who were only in this workspace: their login goes too.
  await prisma.user.deleteMany({ where: { id: { in: members.map((m) => m.userId) }, memberships: { none: {} } } });

  // Files: recorded videos, and the accounts' failure screenshots.
  await rm(videoPath(`${ws.id}/x`).replace(/\/x$/, ""), { recursive: true, force: true }).catch(() => undefined);
  const shots = join(tools.dataDir ?? dataDir(), "screenshots");
  const files = await readdir(shots).catch(() => [] as string[]);
  for (const f of files) if (accounts.some((a) => f.startsWith(`${a.id}-`))) await rm(join(shots, f), { recursive: true, force: true }).catch(() => undefined);
  return { ok: true, value: undefined };
}
