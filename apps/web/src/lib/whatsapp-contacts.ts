import { segmentWhere, type Prisma, type PrismaClient } from "@invytra/db";
import { WA_IMPORT, applyPhoneMapping, phoneKey, phoneMappingProblem, readPhoneCsv, splitName, waTag, waTags, type WaColumnTarget } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * WhatsApp contacts of a workspace: the list (filters, tags, search), adding by hand and by CSV
 * (only with the user's confirmation that these people agreed to be messaged), tags, opting
 * out (also puts the number on the workspace's do-not-contact list, so no channel uses it)
 * and deleting. Every query is scoped to the workspace (CLAUDE.md rule 0).
 */

export const WA_CONTACT_FILTERS = ["all", "active", "not_on_whatsapp", "not_opted_in", "opted_out"] as const;
export type WaContactFilter = (typeof WA_CONTACT_FILTERS)[number];
export const WA_PAGE = 10;
const DAY = 86_400_000;

export interface WaContactQuery {
  filter?: WaContactFilter;
  /** A segment's rules (already checked to belong to the workspace) */
  segment?: { match: string; rules: unknown } | null;
  tag?: string;
  /** A city: the part of the location before the first comma */
  city?: string;
  q?: string;
  page?: number;
}

const viewWhere = (f: WaContactFilter | undefined, now: Date): Prisma.WhatsappContactWhereInput =>
  f === "active"
    ? { lastInboundAt: { gte: new Date(now.getTime() - 30 * DAY) } }
    : f === "not_on_whatsapp"
      ? { waStatus: "NOT_FOUND" }
      : f === "not_opted_in"
        ? { optedOutAt: null, consentSource: null }
        : f === "opted_out"
          ? { optedOutAt: { not: null } }
          : {};

export const waContactWhere = (workspaceId: string, o: WaContactQuery, now = new Date()): Prisma.WhatsappContactWhereInput => {
  const q = (o.q ?? "").trim().slice(0, 100);
  const digits = q.replace(/\D/g, "");
  return {
    workspaceId,
    AND: [
      viewWhere(o.filter, now),
      o.segment ? segmentWhere(o.segment, now) : {},
      o.tag ? { tags: { has: o.tag } } : {},
      o.city ? { location: { startsWith: o.city, mode: "insensitive" } } : {},
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { profileName: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { externalId: { contains: q, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {},
    ],
  };
};

export async function listWaContacts(prisma: PrismaClient, workspaceId: string, o: WaContactQuery = {}) {
  const where = waContactWhere(workspaceId, o);
  const page = Math.max(1, o.page ?? 1);
  const [total, rows] = await Promise.all([prisma.whatsappContact.count({ where }), prisma.whatsappContact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * WA_PAGE, take: WA_PAGE })]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / WA_PAGE)) };
}

/** How many contacts in each view, every tag and city with its count. */
export async function waContactSummary(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const count = (f: WaContactFilter) => prisma.whatsappContact.count({ where: { workspaceId, ...viewWhere(f, now) } });
  const [all, active, notOn, noConsent, optedOut, tags, cities] = await Promise.all([
    count("all"),
    count("active"),
    count("not_on_whatsapp"),
    count("not_opted_in"),
    count("opted_out"),
    prisma.$queryRaw<{ tag: string; n: bigint }[]>`SELECT unnest(tags) AS tag, count(*) AS n FROM whatsapp_contacts WHERE workspace_id = ${workspaceId} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 300`,
    prisma.$queryRaw<{ city: string; n: bigint }[]>`SELECT trim(split_part(location, ',', 1)) AS city, count(*) AS n FROM whatsapp_contacts WHERE workspace_id = ${workspaceId} AND coalesce(trim(location), '') <> '' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 200`,
  ]);
  return {
    counts: { all, active, not_on_whatsapp: notOn, not_opted_in: noConsent, opted_out: optedOut } as Record<WaContactFilter, number>,
    tags: tags.map((t) => ({ tag: t.tag, count: Number(t.n) })),
    cities: cities.map((c) => ({ city: c.city, count: Number(c.n) })),
  };
}

/* ---------- tags in bulk ---------- */

/** Renames a tag on every contact (merging into an existing tag of that name) and in segment rules. */
export async function renameWaTag(prisma: PrismaClient, workspaceId: string, fromRaw: string, toRaw: string): Promise<Result<number>> {
  const from = waTag(fromRaw);
  const to = waTag(toRaw);
  if (!from || !to) return { ok: false, error: "Type the new tag name." };
  if (from === to) return { ok: true, value: 0 };
  const n = await prisma.$executeRaw`UPDATE whatsapp_contacts SET tags = ARRAY(SELECT DISTINCT t FROM unnest(array_replace(tags, ${from}, ${to})) AS t), updated_at = now() WHERE workspace_id = ${workspaceId} AND ${from} = ANY(tags)`;
  await updateSegmentRules(prisma, workspaceId, (r) => (r.field === "tag" && r.value === from ? { ...r, value: to } : r));
  return { ok: true, value: n };
}

/** Removes tags from every contact (the contacts stay) and drops segment rules that used them. */
export async function deleteWaTags(prisma: PrismaClient, workspaceId: string, raw: unknown): Promise<Result<number>> {
  const list = z.array(z.string().max(60)).min(1, "Choose a tag.").max(300).safeParse(raw);
  if (!list.success) return { ok: false, error: list.error.issues[0]!.message };
  const tags = [...new Set(list.data.map(waTag).filter(Boolean))];
  const n = await prisma.$executeRaw`UPDATE whatsapp_contacts SET tags = ARRAY(SELECT t FROM unnest(tags) AS t WHERE NOT (t = ANY(${tags}::text[]))), updated_at = now() WHERE workspace_id = ${workspaceId} AND tags && ${tags}::text[]`;
  await updateSegmentRules(prisma, workspaceId, (r) => (r.field === "tag" && tags.includes(r.value) ? null : r));
  return { ok: true, value: n };
}

type Rule = { field: string; op: string; value: string };
async function updateSegmentRules(prisma: PrismaClient, workspaceId: string, fn: (r: Rule) => Rule | null) {
  for (const s of await prisma.whatsappSegment.findMany({ where: { workspaceId }, select: { id: true, rules: true } })) {
    const before = (s.rules as Rule[]) ?? [];
    const after = before.map(fn).filter((r): r is Rule => !!r);
    if (JSON.stringify(after) !== JSON.stringify(before)) await prisma.whatsappSegment.update({ where: { id: s.id }, data: { rules: after } });
  }
}

/** Numbers on the do-not-contact list (opted out on any channel, or added there). */
async function blockedPhones(prisma: PrismaClient, workspaceId: string, phones: string[]) {
  if (!phones.length) return new Set<string>();
  const rows = await prisma.doNotContact.findMany({ where: { workspaceId, kind: "PHONE", value: { in: phones } }, select: { value: true } });
  return new Set(rows.map((r) => r.value));
}

const addSchema = z.object({
  name: z.string().trim().min(1, "Enter the name.").max(160),
  phone: z.string().trim().min(1, "Enter the WhatsApp number."),
  userId: z.string().trim().max(120).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email or leave it empty.")]).optional().default(""),
  tags: z.array(z.string().max(60)).max(20).optional().default([]),
  /** They agreed to get WhatsApp messages (only then can campaigns message them). */
  consent: z.boolean(),
  appointment: z.string().trim().max(60).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
});

export async function addWaContact(prisma: PrismaClient, workspaceId: string, by: string, input: unknown, now = new Date()): Promise<Result<{ id: string }>> {
  const p = addSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const phone = phoneKey(p.data.phone);
  if (!phone) return { ok: false, error: "Enter the full number with its country code, like +91 98765 43210." };
  if ((await blockedPhones(prisma, workspaceId, [phone])).size) return { ok: false, error: "This number is on your do-not-contact list (it opted out). Remove it there first if they asked to hear from you again." };
  const exists = await prisma.whatsappContact.findUnique({ where: { workspaceId_phone: { workspaceId, phone } }, select: { id: true } });
  if (exists) return { ok: false, error: "This number is already in your contacts." };
  if (p.data.userId && (await prisma.whatsappContact.findFirst({ where: { workspaceId, externalId: p.data.userId }, select: { id: true } })))
    return { ok: false, error: "Another contact already has this User ID." };
  const [firstName, lastName] = splitName(p.data.name);
  const vars: Record<string, string> = {};
  if (p.data.appointment) vars.appointment_time = p.data.appointment.replace("T", " ");
  if (p.data.location) vars.location = p.data.location;
  const c = await prisma.whatsappContact.create({
    data: {
      workspaceId,
      phone,
      firstName: firstName?.slice(0, 80) ?? null,
      lastName: lastName?.slice(0, 80) ?? null,
      email: p.data.email?.toLowerCase() || null,
      externalId: p.data.userId || null,
      location: p.data.location || null,
      tags: [...new Set(p.data.tags.map(waTag).filter(Boolean))],
      vars,
      ...(p.data.consent && { consentSource: "MANUAL", consentAt: now, consentBy: by }),
    },
  });
  return { ok: true, value: { id: c.id } };
}

export interface WaImportResult {
  added: number;
  updated: number;
  invalid: number;
  duplicates: number;
  blocked: number;
  overLimit: number;
  /** Saved without consent (their row said no): campaigns skip them. */
  noConsent: number;
}

const importSchema = z.object({
  text: z.string().max(WA_IMPORT.maxBytes, "That file is too big (max 5 MB)."),
  mapping: z.array(z.string()).max(200),
  defaultCountry: z.string().regex(/^\d{0,4}$/).optional().default(""),
  tags: z.string().max(500).optional().default(""),
  /** The user confirms that the people imported as opted in agreed to get WhatsApp messages. */
  consent: z.boolean().optional().default(false),
});

/** Imports a CSV. Existing numbers get the new details and tags added; opted-out numbers are skipped. */
export async function importWaContacts(prisma: PrismaClient, workspaceId: string, by: string, input: unknown, now = new Date()): Promise<Result<WaImportResult>> {
  const p = importSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const mapping = p.data.mapping as WaColumnTarget[];
  const problem = phoneMappingProblem(mapping);
  if (problem) return { ok: false, error: problem };
  const parsed = applyPhoneMapping(readPhoneCsv(p.data.text), mapping, p.data.defaultCountry);
  if (!parsed.contacts.length) return { ok: false, error: "No row has a usable number. Check the number column, or set the default country code." };
  const extraTags = waTags(p.data.tags);
  const blocked = await blockedPhones(prisma, workspaceId, parsed.contacts.map((c) => c.phone));
  const rows = parsed.contacts.filter((c) => !blocked.has(c.phone));
  // Rows count as opted in unless the file's consent column says no.
  const agreed = (c: (typeof rows)[number]) => c.consent !== false;
  if (rows.some(agreed) && !p.data.consent) return { ok: false, error: "Confirm that the people imported as opted in agreed to get WhatsApp messages from you." };
  const select = { id: true, phone: true, externalId: true, tags: true, vars: true, optedOutAt: true, consentSource: true } as const;
  const ids = rows.map((c) => c.externalId).filter((x): x is string => !!x);
  const found = await prisma.whatsappContact.findMany({ where: { workspaceId, OR: [{ phone: { in: rows.map((c) => c.phone) } }, ...(ids.length ? [{ externalId: { in: ids } }] : [])] }, select });
  const byId = new Map(found.filter((c) => c.externalId).map((c) => [c.externalId!, c]));
  const byPhone = new Map(found.map((c) => [c.phone, c]));
  // Existing contacts are matched by User ID first, then by number.
  const match = (c: (typeof rows)[number]) => (c.externalId && byId.get(c.externalId)) || byPhone.get(c.phone);
  let added = 0;
  let updated = 0;
  let skippedOptedOut = 0;
  const fresh = rows.filter((c) => !match(c));
  for (let i = 0; i < fresh.length; i += 1000) {
    const r = await prisma.whatsappContact.createMany({
      data: fresh.slice(i, i + 1000).map((c) => ({
        workspaceId,
        phone: c.phone,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        company: c.company,
        externalId: c.externalId,
        location: c.location,
        tags: [...new Set([...c.tags, ...extraTags])],
        vars: c.vars,
        ...(agreed(c) && { consentSource: "IMPORT", consentAt: now, consentBy: by }),
      })),
      skipDuplicates: true,
    });
    added += r.count;
  }
  for (const c of rows) {
    const old = match(c);
    if (!old) continue;
    if (old.optedOutAt) {
      skippedOptedOut++;
      continue;
    }
    // A new number for a known User ID moves over, unless another contact has that number.
    const movePhone = old.phone !== c.phone && !byPhone.has(c.phone);
    await prisma.whatsappContact.update({
      where: { id: old.id },
      data: {
        ...(movePhone && { phone: c.phone }),
        ...(c.firstName && { firstName: c.firstName }),
        ...(c.lastName && { lastName: c.lastName }),
        ...(c.email && { email: c.email }),
        ...(c.company && { company: c.company }),
        ...(c.externalId && { externalId: c.externalId }),
        ...(c.location && { location: c.location }),
        ...(agreed(c) && !old.consentSource && { consentSource: "IMPORT", consentAt: now, consentBy: by }),
        tags: [...new Set([...old.tags, ...c.tags, ...extraTags])],
        vars: { ...((old.vars as Record<string, string>) ?? {}), ...c.vars },
      },
    });
    updated++;
  }
  const noConsent = rows.filter((c) => !agreed(c)).length;
  return { ok: true, value: { added, updated, invalid: parsed.invalid.length, duplicates: parsed.duplicates, blocked: blocked.size + skippedOptedOut, overLimit: parsed.overLimit, noConsent } };
}

const idsSchema = z.array(z.string().min(1).max(40)).min(1, "Choose at least one contact.").max(5000);

export async function tagWaContacts(prisma: PrismaClient, workspaceId: string, idsIn: unknown, tagRaw: string, add: boolean): Promise<Result<number>> {
  const ids = idsSchema.safeParse(idsIn);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]!.message };
  const tag = waTag(tagRaw);
  if (!tag) return { ok: false, error: "Type a tag." };
  const rows = await prisma.whatsappContact.findMany({ where: { workspaceId, id: { in: ids.data } }, select: { id: true, tags: true } });
  const change = rows.filter((r) => r.tags.includes(tag) !== add);
  await prisma.$transaction(change.map((r) => prisma.whatsappContact.update({ where: { id: r.id }, data: { tags: add ? [...r.tags, tag] : r.tags.filter((t) => t !== tag) } })));
  return { ok: true, value: change.length };
}

/** Opts numbers out for good: never messaged again on WhatsApp, and on the do-not-contact list for every channel. */
export async function optOutPhones(prisma: PrismaClient, workspaceId: string, phones: string[], reason: string, addedBy: string | null, now = new Date()) {
  const clean = [...new Set(phones.map((p) => phoneKey(p)).filter((p): p is string => !!p))];
  if (!clean.length) return 0;
  await prisma.$transaction([
    prisma.whatsappContact.updateMany({ where: { workspaceId, phone: { in: clean }, optedOutAt: null }, data: { optedOutAt: now, optOutReason: reason.slice(0, 200) } }),
    prisma.doNotContact.createMany({
      data: clean.map((value) => ({ workspaceId, kind: "PHONE" as const, value, label: `+${value}`, note: reason.slice(0, 200), addedBy })),
      skipDuplicates: true,
    }),
  ]);
  return clean.length;
}

export async function optOutWaContacts(prisma: PrismaClient, workspaceId: string, idsIn: unknown, user: { id: string; name: string }): Promise<Result<number>> {
  const ids = idsSchema.safeParse(idsIn);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]!.message };
  const rows = await prisma.whatsappContact.findMany({ where: { workspaceId, id: { in: ids.data } }, select: { phone: true } });
  return { ok: true, value: await optOutPhones(prisma, workspaceId, rows.map((r) => r.phone), `Opted out by ${user.name}`, user.id) };
}

export async function deleteWaContacts(prisma: PrismaClient, workspaceId: string, idsIn: unknown): Promise<Result<number>> {
  const ids = idsSchema.safeParse(idsIn);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]!.message };
  const r = await prisma.whatsappContact.deleteMany({ where: { workspaceId, id: { in: ids.data } } });
  return { ok: true, value: r.count };
}

/** An incoming message: the sender becomes (or stays) a contact, their 24-hour window opens, and "STOP" opts them out. */
export async function recordInbound(prisma: PrismaClient, workspaceId: string, m: { phone: string; profileName?: string; optOut: boolean; at: Date; text?: string }) {
  const phone = phoneKey(m.phone);
  if (!phone) return;
  await prisma.whatsappContact.upsert({
    where: { workspaceId_phone: { workspaceId, phone } },
    create: { workspaceId, phone, profileName: m.profileName?.slice(0, 120) || null, consentSource: "INBOUND", consentAt: m.at, lastInboundAt: m.at, waStatus: "ON" },
    update: { lastInboundAt: m.at, waStatus: "ON", ...(m.profileName && { profileName: m.profileName.slice(0, 120) }) },
  });
  if (m.optOut) await optOutPhones(prisma, workspaceId, [phone], `Replied “${(m.text ?? "STOP").trim().slice(0, 60)}”`, null, m.at);
}
