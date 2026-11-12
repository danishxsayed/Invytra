import type { PrismaClient } from "@invytra/db";
import { TRIAL, aiBalance, verifyBalance } from "@invytra/shared";
import type { CurrentUser } from "./auth";
import { channelHref, hubHref } from "./domains";
import { canSeeBilling } from "./workspace-nav";

/*
 * The workspace overview: this week's numbers across every channel, and what needs someone's
 * attention (each with where to fix it).
 */

const DAY = 86_400_000;

export interface Numbers {
  contacted: number;
  replies: number;
  meetings: number;
  byChannel: { linkedin: { contacted: number; replies: number }; email: { contacted: number; replies: number } };
}

/** People reached, people who replied and meetings booked between `from` and `to`, across channels. */
export async function numbersBetween(prisma: PrismaClient, workspaceId: string, from: Date, to: Date): Promise<Numbers> {
  const win = { gte: from, lt: to };
  const [liContacted, liReplied, liMeetings, emContacted, emReplied, emMeetings] = await Promise.all([
    // LinkedIn: different people sent an invite or a message.
    prisma.action.groupBy({ by: ["targetUrl"], where: { account: { workspaceId }, status: "SUCCEEDED", type: { in: ["CONNECTION_REQUEST", "MESSAGE"] }, executedAt: win } }),
    // LinkedIn: conversations where they wrote.
    prisma.conversationMessage.groupBy({ by: ["conversationId"], where: { fromMe: false, sentAt: win, conversation: { account: { workspaceId } } } }),
    prisma.conversation.count({ where: { account: { workspaceId }, meetingAt: win } }),
    // Email: different people sent a campaign email.
    prisma.emailSend.groupBy({ by: ["toEmail"], where: { workspaceId, kind: "CAMPAIGN", status: "SENT", createdAt: win } }),
    // Email: people who replied (not auto-replies or bounces).
    prisma.emailReply.groupBy({ by: ["fromEmail"], where: { workspaceId, kind: "REPLY", receivedAt: win } }),
    prisma.emailLead.count({ where: { campaign: { workspaceId }, meetingAt: win } }),
  ]);
  const linkedin = { contacted: liContacted.length, replies: liReplied.length };
  const email = { contacted: emContacted.length, replies: emReplied.length };
  return { contacted: linkedin.contacted + email.contacted, replies: linkedin.replies + email.replies, meetings: liMeetings + emMeetings, byChannel: { linkedin, email } };
}

/** The last 7 days, and the 7 before (to compare). */
export async function weekNumbers(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const [week, before] = await Promise.all([numbersBetween(prisma, workspaceId, weekAgo, now), numbersBetween(prisma, workspaceId, new Date(weekAgo.getTime() - 7 * DAY), weekAgo)]);
  return { week, before };
}

/** Reply rate in % (null when nobody was contacted). */
export const replyRate = (n: Pick<Numbers, "contacted" | "replies">) => (n.contacted ? Math.round((n.replies / n.contacted) * 1000) / 10 : null);

export interface Attention {
  id: string;
  tone: "urgent" | "warn" | "info";
  title: string;
  detail: string;
  /** The fix: where to go. Null when only the owner can fix it and this person isn't. */
  action: { label: string; href: string } | null;
}

const LOW_AI = 20;
const LOW_VERIFY = 50;

/** What needs someone: disconnected accounts, mailbox errors, low credits, the trial ending, replies waiting. */
export async function needsAttention(prisma: PrismaClient, me: CurrentUser, now = new Date()): Promise<Attention[]> {
  const workspaceId = me.workspace.id;
  const owner = canSeeBilling(me);
  const [ws, accounts, mailboxes, waitingLi, waitingEmail] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, createdAt: true, aiUsed: true, aiPeriod: true, aiExtra: true, verifyUsed: true, verifyPeriod: true, verifyExtra: true, channels: true } }),
    prisma.linkedinAccount.findMany({ where: { workspaceId, status: { in: ["NEEDS_ATTENTION", "DISCONNECTED"] } }, select: { id: true, label: true, status: true, statusReason: true } }),
    prisma.emailAccount.findMany({ where: { workspaceId, status: "ERROR" }, select: { id: true, email: true, statusReason: true } }),
    prisma.conversation.count({ where: { account: { workspaceId }, lastFromMe: false, doneAt: null } }),
    prisma.emailReply.count({ where: { workspaceId, kind: "REPLY", readAt: null } }),
  ]);
  const out: Attention[] = [];
  const billing = (label: string, anchor = "") => (owner ? { label, href: hubHref(`/billing${anchor}`) } : null);

  for (const a of accounts)
    out.push({
      id: `li-${a.id}`,
      tone: "urgent",
      title: `LinkedIn account "${a.label}" ${a.status === "DISCONNECTED" ? "is disconnected" : "needs you"}`,
      detail: a.statusReason ?? "Its campaigns are paused until it's connected again.",
      action: { label: a.status === "DISCONNECTED" ? "Reconnect" : "Fix it", href: channelHref("linkedin", `/app/accounts/${a.id}`) },
    });
  for (const m of mailboxes)
    out.push({ id: `mb-${m.id}`, tone: "urgent", title: `Mailbox ${m.email} can't send`, detail: m.statusReason ?? "Its campaigns skip it until it's fixed.", action: { label: "Fix mailbox", href: channelHref("email", "/email/mailboxes") } });

  if (ws.plan === "trial") {
    const left = Math.ceil((ws.createdAt.getTime() + TRIAL.days * DAY - now.getTime()) / DAY);
    if (left <= 0) out.push({ id: "trial", tone: "urgent", title: "Your free trial has ended", detail: owner ? "Choose a plan to keep your campaigns running." : "Ask your workspace owner to choose a plan.", action: billing("Choose a plan") });
    else if (left <= 3) out.push({ id: "trial", tone: "warn", title: `Your free trial ends in ${left} day${left === 1 ? "" : "s"}`, detail: owner ? "Choose a plan so nothing stops." : "Your workspace owner can choose a plan.", action: billing("See plans") });
  }

  const ai = aiBalance(ws, now);
  if (ai.left < LOW_AI)
    out.push({ id: "ai", tone: ai.left === 0 ? "urgent" : "warn", title: ai.left === 0 ? "No AI credits left" : `Only ${ai.left} AI credits left`, detail: "AI writing, handwritten and voice notes stop when they run out (messages still go without them).", action: billing("Add credits", "#credits") });
  if (ws.channels.includes("email")) {
    const v = verifyBalance(ws, now);
    if (v.left < LOW_VERIFY) out.push({ id: "verify", tone: "warn", title: v.left === 0 ? "No email verification credits left" : `Only ${v.left} verification credits left`, detail: "New contacts can't be checked before sending.", action: billing("Add credits", "#credits") });
  }

  if (waitingLi) out.push({ id: "li-replies", tone: "info", title: `${waitingLi} LinkedIn conversation${waitingLi === 1 ? "" : "s"} waiting for your reply`, detail: "They wrote last and it isn't marked done.", action: { label: "Open inbox", href: hubHref("/inbox?f=needs&ch=linkedin") } });
  if (waitingEmail) out.push({ id: "em-replies", tone: "info", title: `${waitingEmail} unread email repl${waitingEmail === 1 ? "y" : "ies"}`, detail: "Replies to your email campaigns.", action: { label: "Open inbox", href: hubHref("/inbox?f=needs&ch=email") } });
  return out;
}
