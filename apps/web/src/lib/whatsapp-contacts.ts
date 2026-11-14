import type { Prisma, PrismaClient } from "@invytra/db";
import { WA_IMPORT, applyPhoneMapping, phoneKey, phoneMappingProblem, readPhoneCsv, waTag, waTags, type WaColumnTarget } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * WhatsApp contacts of a workspace: the list (filters, tags, search), adding by hand and by CSV
 * (only with the user's confirmation that these people agreed to be messaged), tags, opting
 * out (also puts the number on the workspace's do-not-contact list, so no channel uses it)
 * and deleting. Every query is scoped to the workspace (CLAUDE.md rule 0).
 */

export const WA_CONTACT_FILTERS = ["all", "subscribed", "opted_out"] as const;
export type WaContactFilter = (typeof WA_CONTACT_FILTERS)[number];
export const WA_PAGE = 50;

const whereFor = (workspaceId: string, o: { filter?: WaContactFilter; tag?: string; q?: string }): Prisma.WhatsappContactWhereInput => {
  const q = (o.q ?? "").trim().slice(0, 100);
  const digits = q.replace(/\D/g, "");
  return {
    workspaceId,
    ...(o.filter === "subscribed" && { optedOutAt: null }),
    ...(o.filter === "opted_out" && { optedOutAt: { not: null } }),
    ...(o.tag && { tags: { has: o.tag } }),
    ...(q && {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { profileName: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    }),
  };
};

export async function listWaContacts(prisma: PrismaClient, workspaceId: string, o: { filter?: WaContactFilter; tag?: string; q?: string; page?: number } = {}) {
  const where = whereFor(workspaceId, o);
  const page = Math.max(1, o.page ?? 1);
  const [total, rows] = await Promise.all([prisma.whatsappContact.count({ where }), prisma.whatsappContact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * WA_PAGE, take: WA_PAGE })]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / WA_PAGE)) };
}

/** How many contacts in each view, and every tag with its count. */
export async function waContactSummary(prisma: PrismaClient, workspaceId: string) {
  const [all, optedOut, tags] = await Promise.all([
    prisma.whatsappContact.count({ where: { workspaceId } }),
    prisma.whatsappContact.count({ where: { workspaceId, optedOutAt: { not: null } } }),
    prisma.$queryRaw<{ tag: string; n: bigint }[]>`SELECT unnest(tags) AS tag, count(*) AS n FROM whatsapp_contacts WHERE workspace_id = ${workspaceId} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 200`,
  ]);
  return { counts: { all, subscribed: all - optedOut, opted_out: optedOut } as Record<WaContactFilter, number>, tags: tags.map((t) => ({ tag: t.tag, count: Number(t.n) })) };
}

/** Numbers on the do-not-contact list (opted out on any channel, or added there). */
async function blockedPhones(prisma: PrismaClient, workspaceId: string, phones: string[]) {
  if (!phones.length) return new Set<string>();
  const rows = await prisma.doNotContact.findMany({ where: { workspaceId, kind: "PHONE", value: { in: phones } }, select: { value: true } });
  return new Set(rows.map((r) => r.value));
}

const addSchema = z.object({
  phone: z.string().trim().min(1, "Enter the WhatsApp number."),
  firstName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().max(80).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email or leave it empty.")]).optional().default(""),
  company: z.string().trim().max(200).optional().default(""),
  tags: z.string().max(500).optional().default(""),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that this person agreed to get WhatsApp messages from you." }) }),
});

export async function addWaContact(prisma: PrismaClient, workspaceId: string, by: string, input: unknown, now = new Date()): Promise<Result<{ id: string }>> {
  const p = addSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const phone = phoneKey(p.data.phone);
  if (!phone) return { ok: false, error: "Enter the full number with its country code, like +971 50 123 4567." };
  if ((await blockedPhones(prisma, workspaceId, [phone])).size) return { ok: false, error: "This number is on your do-not-contact list (it opted out). Remove it there first if they asked to hear from you again." };
  const exists = await prisma.whatsappContact.findUnique({ where: { workspaceId_phone: { workspaceId, phone } }, select: { id: true } });
  if (exists) return { ok: false, error: "This number is already in your contacts." };
  const c = await prisma.whatsappContact.create({
    data: {
      workspaceId,
      phone,
      firstName: p.data.firstName || null,
      lastName: p.data.lastName || null,
      email: p.data.email?.toLowerCase() || null,
      company: p.data.company || null,
      tags: waTags(p.data.tags),
      consentSource: "MANUAL",
      consentAt: now,
      consentBy: by,
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
}

const importSchema = z.object({
  text: z.string().max(WA_IMPORT.maxBytes, "That file is too big (max 5 MB)."),
  mapping: z.array(z.string()).max(200),
  defaultCountry: z.string().regex(/^\d{0,4}$/).optional().default(""),
  tags: z.string().max(500).optional().default(""),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that everyone in this file agreed to get WhatsApp messages from you." }) }),
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
  const existing = new Map(
    (await prisma.whatsappContact.findMany({ where: { workspaceId, phone: { in: rows.map((c) => c.phone) } }, select: { id: true, phone: true, tags: true, vars: true, optedOutAt: true } })).map((c) => [c.phone, c]),
  );
  let added = 0;
  let updated = 0;
  let skippedOptedOut = 0;
  const fresh = rows.filter((c) => !existing.has(c.phone));
  for (let i = 0; i < fresh.length; i += 1000) {
    const r = await prisma.whatsappContact.createMany({
      data: fresh.slice(i, i + 1000).map((c) => ({
        workspaceId,
        phone: c.phone,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        company: c.company,
        tags: [...new Set([...c.tags, ...extraTags])],
        vars: c.vars,
        consentSource: "IMPORT",
        consentAt: now,
        consentBy: by,
      })),
      skipDuplicates: true,
    });
    added += r.count;
  }
  for (const c of rows.filter((x) => existing.has(x.phone))) {
    const old = existing.get(c.phone)!;
    if (old.optedOutAt) {
      skippedOptedOut++;
      continue;
    }
    await prisma.whatsappContact.update({
      where: { id: old.id },
      data: {
        ...(c.firstName && { firstName: c.firstName }),
        ...(c.lastName && { lastName: c.lastName }),
        ...(c.email && { email: c.email }),
        ...(c.company && { company: c.company }),
        tags: [...new Set([...old.tags, ...c.tags, ...extraTags])],
        vars: { ...((old.vars as Record<string, string>) ?? {}), ...c.vars },
      },
    });
    updated++;
  }
  return { ok: true, value: { added, updated, invalid: parsed.invalid.length, duplicates: parsed.duplicates, blocked: blocked.size + skippedOptedOut, overLimit: parsed.overLimit } };
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
    create: { workspaceId, phone, profileName: m.profileName?.slice(0, 120) || null, consentSource: "INBOUND", consentAt: m.at, lastInboundAt: m.at },
    update: { lastInboundAt: m.at, ...(m.profileName && { profileName: m.profileName.slice(0, 120) }) },
  });
  if (m.optOut) await optOutPhones(prisma, workspaceId, [phone], `Replied “${(m.text ?? "STOP").trim().slice(0, 60)}”`, null, m.at);
}
