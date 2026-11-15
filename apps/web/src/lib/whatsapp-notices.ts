import { appLink, noticeEmail, workspaceOwners, type PlatformEmail, type PrismaClient } from "@invytra/db";

/*
 * Emails about a workspace's WhatsApp: a template Meta approved, rejected, paused or disabled.
 * (The campaign report is sent by the worker: apps/worker/src/whatsapp/reports.ts.)
 */

/** Meta's rejection reasons in words a customer can act on. */
export const REJECT_REASON: Record<string, string> = {
  INVALID_FORMAT: "The format isn't allowed: check variables (none at the start or end, words between them) and that the samples are real values.",
  ABUSIVE_CONTENT: "Meta found content against WhatsApp's Commerce or Business Policy.",
  INCORRECT_CATEGORY: "The category doesn't match the message: offers and outreach are Marketing, order or account updates are Utility.",
  PROMOTIONAL: "It reads as promotional, so it can't be a Utility template. Submit it as Marketing.",
  TAG_CONTENT_MISMATCH: "The category doesn't match the message. Submit it again with the right category.",
  SCAM: "Meta flagged it as possibly misleading. Make the offer and who you are clear.",
};

const NOTICE: Record<string, { subject: (n: string) => string; title: string; line: string; tone: "good" | "bad" | "info"; button: string } | undefined> = {
  APPROVED: { subject: (n) => `Approved: your WhatsApp template "${n}"`, title: "Your template is approved", line: "Meta approved it. You can use it in a campaign now.", tone: "good", button: "Start a campaign" },
  REJECTED: { subject: (n) => `Rejected: your WhatsApp template "${n}"`, title: "Your template was rejected", line: "Meta didn't approve it. Make a copy, fix it and submit it again: it usually takes a few minutes.", tone: "bad", button: "Fix the template" },
  PAUSED: { subject: (n) => `Paused: your WhatsApp template "${n}"`, title: "Your template was paused", line: "Meta paused it because people blocked or reported it. Campaigns using it can't send for now; Meta resumes it after a few hours.", tone: "bad", button: "See your templates" },
  DISABLED: { subject: (n) => `Disabled: your WhatsApp template "${n}"`, title: "Your template was disabled", line: "Meta disabled it after repeated reports. It can't be used again; write a new one with a clearer opt-out.", tone: "bad", button: "See your templates" },
};

/** One email per workspace owner for a template whose review status just changed. */
export async function templateNotices(prisma: PrismaClient, t: { workspaceId: string; name: string; language: string }, status: string, reason: string | null): Promise<PlatformEmail[]> {
  const n = NOTICE[status];
  if (!n) return [];
  const owners = await workspaceOwners(prisma, t.workspaceId);
  const why = reason ? (REJECT_REASON[reason] ?? `Meta's reason: ${reason.replace(/_/g, " ").toLowerCase()}.`) : null;
  const href = appLink("whatsapp", status === "APPROVED" ? "/whatsapp/campaigns/new" : "/whatsapp/templates");
  return owners.map((o) =>
    noticeEmail({
      to: o.email,
      first: o.first,
      subject: n.subject(t.name),
      title: n.title,
      lines: [`${t.name} (${t.language})`, n.line],
      ...(why && status !== "APPROVED" ? { callout: { tone: n.tone, text: why } } : {}),
      button: { label: n.button, href },
      why: "You're getting this because you own an Invytra workspace with WhatsApp connected.",
    }),
  );
}
