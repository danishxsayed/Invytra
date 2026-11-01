import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/*
 * Unsubscribe links: each campaign email carries a signed token for its lead, so the link
 * works without signing in and can't be guessed or changed to unsubscribe someone else.
 */

const sig = (leadId: string, key: string) => createHmac("sha256", `unsubscribe:${key}`).update(leadId).digest("base64url").slice(0, 22);

export function unsubscribeToken(leadId: string, key: string): string {
  return `${leadId}.${sig(leadId, key)}`;
}

/** The lead id in a token, or null if it was changed or made up. */
export function readUnsubscribeToken(token: string, key: string): string | null {
  const [leadId, s] = token.split(".");
  if (!leadId || !s || leadId.length > 40) return null;
  const want = Buffer.from(sig(leadId, key));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? leadId : null;
}

/** The public page, and the one-click address mail providers call (RFC 8058). */
export const unsubscribeUrls = (origin: string, token: string) => ({
  page: `${origin.replace(/\/$/, "")}/unsubscribe/${token}`,
  oneClick: `${origin.replace(/\/$/, "")}/api/unsubscribe/${token}`,
});

/** Where links point: the public address of the app. */
export const publicOrigin = (env: NodeJS.ProcessEnv = process.env) => (env.PUBLIC_URL || env.WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

/**
 * Unsubscribes the person behind a lead from the workspace's emails: the contact is marked,
 * the address goes on the suppression list, and their running leads stop. Safe to repeat.
 */
export async function unsubscribeLead(prisma: PrismaClient, leadId: string, how: string, now = new Date()): Promise<{ email: string; workspaceId: string } | null> {
  const lead = await prisma.emailLead.findUnique({ where: { id: leadId }, include: { campaign: { select: { name: true } } } });
  if (!lead) return null;
  const { workspaceId, email } = lead;
  await prisma.$transaction([
    prisma.emailContact.updateMany({ where: { workspaceId, email, subscribed: true }, data: { subscribed: false, unsubscribedAt: now } }),
    prisma.emailSuppression.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: { workspaceId, email, reason: "UNSUBSCRIBED", detail: `${how} (campaign “${lead.campaign.name}”)` },
      update: {},
    }),
    prisma.emailLead.updateMany({ where: { workspaceId, email, status: { in: ["ACTIVE", "COMPLETED"] } }, data: { status: "UNSUBSCRIBED", nextAt: null, reason: how } }),
  ]);
  return { email, workspaceId };
}
