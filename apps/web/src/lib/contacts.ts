import { syncPeople, type Prisma, type PrismaClient } from "@invytra/db";
import { livePhoto } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Contacts: one record per person across channels (LinkedIn profile, email, phone), with
 * everything that happened with them on every channel. People are linked by the contacts sync
 * (worker every minute; also here before showing, so fresh imports appear).
 */

export const CONTACT_FILTERS = ["all", "linkedin", "email", "both", "replied"] as const;
export type ContactFilter = (typeof CONTACT_FILTERS)[number];
export const CONTACTS_PAGE = 50;

const repliedWhere: Prisma.PersonWhereInput = {
  OR: [{ leads: { some: { campaignLeads: { some: { state: "REPLIED" } } } } }, { emailContacts: { some: { leads: { some: { status: "REPLIED" } } } } }],
};
const FILTER: Record<ContactFilter, Prisma.PersonWhereInput> = {
  all: {},
  linkedin: { linkedinSlug: { not: null } },
  email: { email: { not: null } },
  both: { linkedinSlug: { not: null }, email: { not: null } },
  replied: repliedWhere,
};

export async function listPeople(prisma: PrismaClient, workspaceId: string, opts: { q?: string; filter?: ContactFilter; page?: number } = {}) {
  await syncPeople(prisma, { workspaceId, batch: 500 });
  const q = (opts.q ?? "").trim().slice(0, 100);
  const where: Prisma.PersonWhereInput = {
    workspaceId,
    ...FILTER[opts.filter ?? "all"],
    ...(q && {
      AND: [
        {
          OR: ["firstName", "lastName", "company", "title", "email", "linkedinSlug", "phone"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })),
        },
      ],
    }),
  };
  const page = Math.max(1, opts.page ?? 1);
  const [total, rows] = await Promise.all([prisma.person.count({ where }), prisma.person.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * CONTACTS_PAGE, take: CONTACTS_PAGE })]);
  const ids = rows.map((r) => r.id);
  const [liCampaign, emCampaign] = await Promise.all([
    prisma.campaignLead.findMany({ where: { workspaceId, lead: { personId: { in: ids } } }, select: { state: true, lead: { select: { personId: true } } } }),
    prisma.emailLead.findMany({ where: { workspaceId, contact: { personId: { in: ids } } }, select: { status: true, contact: { select: { personId: true } } } }),
  ]);
  const status = new Map<string, { replied: boolean; inCampaign: boolean }>();
  const mark = (id: string | null | undefined, replied: boolean) => {
    if (!id) return;
    const s = status.get(id) ?? { replied: false, inCampaign: false };
    status.set(id, { replied: s.replied || replied, inCampaign: true });
  };
  for (const l of liCampaign) mark(l.lead?.personId, l.state === "REPLIED");
  for (const l of emCampaign) mark(l.contact?.personId, l.status === "REPLIED");
  return {
    total,
    page,
    rows: rows.map((p) => ({
      id: p.id,
      name: fullName(p),
      company: p.company,
      title: p.title,
      email: p.email,
      linkedin: p.linkedinUrl ?? (p.linkedinSlug ? `https://www.linkedin.com/in/${p.linkedinSlug}/` : null),
      phone: p.phone,
      photo: livePhoto(p.photoUrl),
      replied: status.get(p.id)?.replied ?? false,
      inCampaign: status.get(p.id)?.inCampaign ?? false,
    })),
  };
}

export const fullName = (p: { firstName: string | null; lastName: string | null; email?: string | null; linkedinSlug?: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || p.linkedinSlug || "Unknown";

export type EventKind = "visit" | "invite" | "accepted" | "message" | "reply" | "email" | "email_reply" | "auto_reply" | "bounce" | "meeting" | "other";
export interface TimelineEvent {
  at: Date;
  channel: "linkedin" | "email";
  kind: EventKind;
  title: string;
  text?: string;
}

const LI_ACTION: Partial<Record<string, { kind: EventKind; title: string }>> = {
  PROFILE_VISIT: { kind: "visit", title: "Viewed their profile" },
  CONNECTION_REQUEST: { kind: "invite", title: "Sent a connection request" },
  MESSAGE: { kind: "message", title: "Sent a LinkedIn message" },
  REPLY: { kind: "message", title: "You replied on LinkedIn" },
  LIKE_POST: { kind: "other", title: "Liked their post" },
  FOLLOW_PROFILE: { kind: "other", title: "Followed them" },
  COMMENT_POST: { kind: "other", title: "Commented on their post" },
};

/** One contact with everything that happened with them on every channel, newest first. */
export async function getPerson(prisma: PrismaClient, workspaceId: string, id: string) {
  const p = await prisma.person.findFirst({
    where: { id, workspaceId },
    include: { leads: { select: { id: true, profileUrl: true, list: { select: { id: true, name: true } } } }, emailContacts: { select: { id: true, email: true, subscribed: true, bounceStatus: true, verification: true } } },
  });
  if (!p) return null;
  const urls = [...new Set(p.leads.map((l) => l.profileUrl))];
  const leadIds = p.leads.map((l) => l.id);
  const contactIds = p.emailContacts.map((c) => c.id);
  const [actions, campaignLeads, conversations, emailLeads] = await Promise.all([
    urls.length
      ? prisma.action.findMany({ where: { account: { workspaceId }, targetUrl: { in: urls }, status: "SUCCEEDED" }, orderBy: { executedAt: "desc" }, take: 200, select: { type: true, executedAt: true, payload: true, account: { select: { label: true } } } })
      : [],
    leadIds.length ? prisma.campaignLead.findMany({ where: { workspaceId, leadId: { in: leadIds } }, select: { id: true, state: true, connectedAt: true, campaign: { select: { id: true, name: true } } } }) : [],
    leadIds.length
      ? prisma.conversation.findMany({
          where: { account: { workspaceId }, campaignLead: { leadId: { in: leadIds } } },
          select: { id: true, meetingAt: true, messages: { where: { fromMe: false }, orderBy: { sentAt: "desc" }, take: 50, select: { text: true, sentAt: true } } },
        })
      : [],
    contactIds.length
      ? prisma.emailLead.findMany({
          where: { workspaceId, contactId: { in: contactIds } },
          select: {
            id: true,
            status: true,
            meetingAt: true,
            campaign: { select: { id: true, name: true } },
            sends: { where: { status: "SENT", kind: { in: ["CAMPAIGN", "REPLY"] } }, select: { kind: true, subject: true, text: true, createdAt: true, stepIndex: true } },
            replies: { select: { kind: true, subject: true, text: true, receivedAt: true } },
          },
        })
      : [],
  ]);
  const events: TimelineEvent[] = [];
  for (const a of actions) {
    const k = LI_ACTION[a.type];
    if (!k || !a.executedAt) continue;
    const text = String(((a.payload ?? {}) as { text?: string; note?: string }).text ?? ((a.payload ?? {}) as { note?: string }).note ?? "") || undefined;
    events.push({ at: a.executedAt, channel: "linkedin", kind: k.kind, title: `${k.title} (${a.account.label})`, text: k.kind === "message" || k.kind === "invite" ? text : undefined });
  }
  for (const c of campaignLeads) if (c.connectedAt) events.push({ at: c.connectedAt, channel: "linkedin", kind: "accepted", title: `Accepted your connection request (${c.campaign.name})` });
  for (const c of conversations) {
    for (const m of c.messages) events.push({ at: m.sentAt, channel: "linkedin", kind: "reply", title: "Replied on LinkedIn", text: m.text });
    if (c.meetingAt) events.push({ at: c.meetingAt, channel: "linkedin", kind: "meeting", title: "Meeting booked" });
  }
  for (const l of emailLeads) {
    for (const s of l.sends) events.push({ at: s.createdAt, channel: "email", kind: "email", title: s.kind === "REPLY" ? "You replied by email" : `Sent email ${(s.stepIndex ?? 0) + 1} of “${l.campaign.name}”`, text: [s.subject, s.text].filter(Boolean).join("\n\n") || undefined });
    for (const r of l.replies)
      events.push({ at: r.receivedAt, channel: "email", kind: r.kind === "REPLY" ? "email_reply" : r.kind === "BOUNCE" ? "bounce" : "auto_reply", title: r.kind === "REPLY" ? "Replied by email" : r.kind === "BOUNCE" ? "Email bounced" : "Auto-reply", text: r.text });
    if (l.meetingAt) events.push({ at: l.meetingAt, channel: "email", kind: "meeting", title: "Meeting booked" });
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    person: { ...p, name: fullName(p), photo: livePhoto(p.photoUrl), linkedin: p.linkedinUrl ?? (p.linkedinSlug ? `https://www.linkedin.com/in/${p.linkedinSlug}/` : null) },
    lists: [...new Map(p.leads.map((l) => [l.list.id, l.list.name])).values()],
    campaigns: [
      ...campaignLeads.map((c) => ({ channel: "linkedin" as const, id: c.campaign.id, name: c.campaign.name, status: c.state })),
      ...emailLeads.map((l) => ({ channel: "email" as const, id: l.campaign.id, name: l.campaign.name, status: l.status })),
    ],
    emailStatus: p.emailContacts[0] ?? null,
    events: events.slice(0, 300),
  };
}
export type PersonView = NonNullable<Awaited<ReturnType<typeof getPerson>>>;

export const personEditSchema = z.object({
  firstName: z.string().trim().max(80).optional().transform((v) => v || null),
  lastName: z.string().trim().max(80).optional().transform((v) => v || null),
  company: z.string().trim().max(120).optional().transform((v) => v || null),
  title: z.string().trim().max(150).optional().transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^\+?[\d\s().-]{6,30}$/.test(v), "Enter a phone number like +91 98765 43210."),
  notes: z.string().max(5000).optional().transform((v) => v?.trim() || null),
});

export async function updatePerson(prisma: PrismaClient, workspaceId: string, id: string, input: unknown): Promise<Result> {
  const p = personEditSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const r = await prisma.person.updateMany({ where: { id, workspaceId }, data: p.data });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Contact not found." };
}
