import type { Prisma, PrismaClient } from "@invytra/db";
import { applyMapping, mappingProblem, readCsv, varKey, type ColumnTarget, type ContactRow } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Email contacts: one row per address in the workspace, in any number of lists. Import from
 * a CSV with a column mapping, custom variables, and the suppression list (addresses never
 * emailed). Every query is scoped to the signed-in workspace (CLAUDE.md rule 0).
 */

export const listNameSchema = z.string().trim().min(1, "Give the list a name.").max(80);
const target = z.string().regex(/^(skip|email|first_name|last_name|full_name|company_name|job_title|website|custom:[a-z0-9_]{1,40})$/, "Unknown field in the mapping.");
export const contactImportSchema = z.object({
  text: z.string().min(1, "Choose a CSV file.").max(5_000_000, "That file is too big (max 5 MB)."),
  mapping: z.array(target).max(200),
  list: z.union([z.object({ id: z.string().max(40) }), z.object({ name: listNameSchema })]),
});
export type ContactImportInput = z.infer<typeof contactImportSchema>;

export interface ContactImportResult {
  listId: string;
  listName: string;
  added: number;
  updated: number;
  /** On the suppression list: imported, but campaigns won't email them. */
  suppressed: number;
  invalid: { row: number; value: string; reason: string }[];
  invalidCount: number;
  duplicates: number;
  overLimit: number;
  variables: string[];
}

const CHUNK = 500;

/** Imports a CSV into a list (new or existing): new addresses are added, known ones updated (empty cells never erase). */
export async function importContacts(prisma: PrismaClient, workspaceId: string, input: ContactImportInput): Promise<Result<ContactImportResult>> {
  const mapping = input.mapping as ColumnTarget[];
  const problem = mappingProblem(mapping);
  if (problem) return { ok: false, error: problem };
  const table = readCsv(input.text);
  if (mapping.length !== table.headers.length) return { ok: false, error: "The file changed; choose it again." };
  const parsed = applyMapping(table, mapping);

  let list: { id: string; name: string } | null;
  if ("id" in input.list) list = await prisma.emailList.findFirst({ where: { id: input.list.id, workspaceId }, select: { id: true, name: true } });
  else {
    const name = input.list.name;
    list = await prisma.emailList.upsert({ where: { workspaceId_name: { workspaceId, name } }, create: { workspaceId, name }, update: {}, select: { id: true, name: true } });
  }
  if (!list) return { ok: false, error: "List not found." };

  let added = 0;
  let updated = 0;
  for (let i = 0; i < parsed.contacts.length; i += CHUNK) {
    const batch = parsed.contacts.slice(i, i + CHUNK);
    const existing = await prisma.emailContact.findMany({ where: { workspaceId, email: { in: batch.map((c) => c.email) } }, select: { id: true, email: true, vars: true } });
    const known = new Map(existing.map((e) => [e.email, e]));
    const fresh = batch.filter((c) => !known.has(c.email));
    const r = await prisma.emailContact.createMany({ data: fresh.map((c) => ({ workspaceId, ...c, vars: c.vars })), skipDuplicates: true });
    added += r.count;
    const changes = batch.filter((c) => known.has(c.email)).map((c) => updateFrom(c, known.get(c.email)!));
    if (changes.length) await prisma.$transaction(changes.map((u) => prisma.emailContact.update(u)));
    updated += changes.length;
    const ids = await prisma.emailContact.findMany({ where: { workspaceId, email: { in: batch.map((c) => c.email) } }, select: { id: true } });
    await prisma.emailListMember.createMany({ data: ids.map((c) => ({ listId: list!.id, contactId: c.id })), skipDuplicates: true });
  }
  if (parsed.customKeys.length) {
    await prisma.emailVariable.createMany({ data: parsed.customKeys.map((key) => ({ workspaceId, key, label: key })), skipDuplicates: true });
  }
  const suppressed = await prisma.emailSuppression.count({ where: { workspaceId, email: { in: parsed.contacts.map((c) => c.email) } } });
  return {
    ok: true,
    value: {
      listId: list.id,
      listName: list.name,
      added,
      updated,
      suppressed,
      invalid: parsed.invalid.slice(0, 50),
      invalidCount: parsed.invalid.length,
      duplicates: parsed.duplicates.length,
      overLimit: parsed.overLimit,
      variables: parsed.customKeys,
    },
  };
}

function updateFrom(c: ContactRow, prev: { id: string; vars: Prisma.JsonValue }): Prisma.EmailContactUpdateArgs {
  const keep = <T>(v: T | null) => (v === null ? undefined : v);
  return {
    where: { id: prev.id },
    data: {
      firstName: keep(c.firstName),
      lastName: keep(c.lastName),
      company: keep(c.company),
      title: keep(c.title),
      website: keep(c.website),
      vars: { ...((prev.vars ?? {}) as Record<string, string>), ...c.vars },
    },
  };
}

// ---------------------------------------------------------------- reading

export const CONTACT_FILTERS = ["all", "subscribed", "unsubscribed", "bounced", "valid", "invalid", "risky", "unknown", "pending", "unverified"] as const;
export type ContactFilter = (typeof CONTACT_FILTERS)[number];

function filterWhere(f: ContactFilter): Prisma.EmailContactWhereInput {
  switch (f) {
    case "subscribed":
      return { subscribed: true, bounceStatus: { not: "HARD" } };
    case "unsubscribed":
      return { subscribed: false };
    case "bounced":
      return { bounceStatus: { not: "NONE" } };
    case "valid":
      return { verification: "VALID" };
    case "invalid":
      return { verification: "INVALID" };
    case "risky":
      return { verification: "RISKY" };
    case "unknown":
      return { verification: "UNKNOWN" };
    case "pending":
      return { verification: "PENDING" };
    case "unverified":
      return { verification: "NOT_CHECKED" };
    default:
      return {};
  }
}

export async function listContacts(prisma: PrismaClient, workspaceId: string, o: { listId?: string; filter?: ContactFilter; q?: string; page?: number } = {}) {
  const where: Prisma.EmailContactWhereInput = {
    workspaceId,
    ...(o.listId && { lists: { some: { listId: o.listId } } }),
    ...filterWhere(o.filter ?? "all"),
    ...(o.q && { OR: [{ email: { contains: o.q, mode: "insensitive" } }, { firstName: { contains: o.q, mode: "insensitive" } }, { lastName: { contains: o.q, mode: "insensitive" } }, { company: { contains: o.q, mode: "insensitive" } }] }),
  };
  const page = Math.max(1, o.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.emailContact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100, include: { lists: { select: { list: { select: { name: true } } } } } }),
    prisma.emailContact.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, vars: (r.vars ?? {}) as Record<string, string>, listNames: r.lists.map((l) => l.list.name) })), total, page, pages: Math.max(1, Math.ceil(total / 100)) };
}
export type ContactRowView = Awaited<ReturnType<typeof listContacts>>["rows"][number];

export async function listLists(prisma: PrismaClient, workspaceId: string) {
  const lists = await prisma.emailList.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { members: true } } } });
  return lists.map((l) => ({ id: l.id, name: l.name, count: l._count.members, createdAt: l.createdAt }));
}

export async function deleteList(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.emailList.deleteMany({ where: { id, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "List not found." };
}

export async function deleteContacts(prisma: PrismaClient, workspaceId: string, ids: string[]): Promise<Result<number>> {
  const r = await prisma.emailContact.deleteMany({ where: { workspaceId, id: { in: ids } } });
  return { ok: true, value: r.count };
}

/** Unsubscribe (also suppresses the address) or subscribe again (lifts an unsubscribe/manual suppression, never a hard bounce). */
export async function setSubscribed(prisma: PrismaClient, workspaceId: string, id: string, subscribed: boolean, now = new Date()): Promise<Result> {
  const c = await prisma.emailContact.findFirst({ where: { id, workspaceId } });
  if (!c) return { ok: false, error: "Contact not found." };
  if (subscribed) {
    await prisma.$transaction([
      prisma.emailContact.update({ where: { id }, data: { subscribed: true, unsubscribedAt: null } }),
      prisma.emailSuppression.deleteMany({ where: { workspaceId, email: c.email, reason: { in: ["UNSUBSCRIBED", "MANUAL"] } } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.emailContact.update({ where: { id }, data: { subscribed: false, unsubscribedAt: now } }),
      prisma.emailSuppression.upsert({ where: { workspaceId_email: { workspaceId, email: c.email } }, create: { workspaceId, email: c.email, reason: "UNSUBSCRIBED", detail: "Unsubscribed by you" }, update: {} }),
    ]);
  }
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------- variables

export const variableSchema = z.object({
  label: z.string().trim().min(1, "Name the variable.").max(40),
  fallback: z.string().trim().max(200),
});

export function listVariables(prisma: PrismaClient, workspaceId: string) {
  return prisma.emailVariable.findMany({ where: { workspaceId }, orderBy: { key: "asc" }, select: { id: true, key: true, label: true, fallback: true } });
}

export async function createVariable(prisma: PrismaClient, workspaceId: string, v: z.infer<typeof variableSchema>): Promise<Result<{ key: string }>> {
  const key = varKey(v.label);
  if (!key) return { ok: false, error: "Use letters or numbers in the name." };
  if (["first_name", "last_name", "full_name", "company_name", "job_title", "website", "email", "unsubscribe"].includes(key)) return { ok: false, error: `{{${key}}} is built in already.` };
  const r = await prisma.emailVariable.createMany({ data: [{ workspaceId, key, label: v.label, fallback: v.fallback }], skipDuplicates: true });
  return r.count ? { ok: true, value: { key } } : { ok: false, error: `{{${key}}} exists already.` };
}

export async function updateVariableFallback(prisma: PrismaClient, workspaceId: string, id: string, fallback: string): Promise<Result> {
  const r = await prisma.emailVariable.updateMany({ where: { id, workspaceId }, data: { fallback } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Variable not found." };
}

export async function deleteVariable(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.emailVariable.deleteMany({ where: { id, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Variable not found." };
}

/** Workspace fallbacks as vars, to put under a contact's own values. */
export async function variableFallbacks(prisma: PrismaClient, workspaceId: string): Promise<Record<string, string>> {
  const vs = await prisma.emailVariable.findMany({ where: { workspaceId, fallback: { not: "" } }, select: { key: true, fallback: true } });
  return Object.fromEntries(vs.map((v) => [v.key, v.fallback]));
}

// ---------------------------------------------------------------- suppression list

export function listSuppressions(prisma: PrismaClient, workspaceId: string, q?: string) {
  return prisma.emailSuppression.findMany({ where: { workspaceId, ...(q && { email: { contains: q.toLowerCase() } }) }, orderBy: { createdAt: "desc" }, take: 500 });
}

export async function addSuppressions(prisma: PrismaClient, workspaceId: string, text: string): Promise<Result<{ added: number; invalid: number }>> {
  const items = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const ok = items.filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) || /^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(e));
  const r = await prisma.emailSuppression.createMany({ data: ok.map((email) => ({ workspaceId, email, reason: "MANUAL" as const, detail: "Added by you" })), skipDuplicates: true });
  return { ok: true, value: { added: r.count, invalid: items.length - ok.length } };
}

export async function removeSuppression(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const s = await prisma.emailSuppression.findFirst({ where: { id, workspaceId } });
  if (!s) return { ok: false, error: "Not found." };
  if (s.reason === "HARD_BOUNCE") return { ok: false, error: "Hard bounces stay suppressed: that address doesn't exist." };
  await prisma.$transaction([
    prisma.emailSuppression.delete({ where: { id } }),
    prisma.emailContact.updateMany({ where: { workspaceId, email: s.email }, data: { subscribed: true, unsubscribedAt: null } }),
  ]);
  return { ok: true, value: undefined };
}

/** Whether an address (or its domain, for entries like "@competitor.com") is suppressed. */
export function isSuppressed(entries: Set<string>, email: string): boolean {
  return entries.has(email) || entries.has(`@${email.slice(email.indexOf("@") + 1)}`) || entries.has(email.slice(email.indexOf("@") + 1));
}
