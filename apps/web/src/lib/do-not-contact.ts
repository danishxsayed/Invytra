import type { Prisma, PrismaClient } from "@invytra/db";
import { DNC_MAX_PER_ADD, DNC_REASON, dncMatcher, parseDncText, type DncKind } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * The workspace's do-not-contact list (every channel respects it). Adding entries also stops
 * anyone they match who is already in a LinkedIn or email campaign.
 */

export const DNC_PAGE = 50;

export async function listDnc(prisma: PrismaClient, workspaceId: string, opts: { q?: string; kind?: DncKind; page?: number } = {}) {
  const q = (opts.q ?? "").trim().slice(0, 100);
  const where: Prisma.DoNotContactWhereInput = {
    workspaceId,
    ...(opts.kind && { kind: opts.kind }),
    ...(q && { OR: [{ label: { contains: q, mode: "insensitive" } }, { value: { contains: q.toLowerCase() } }, { note: { contains: q, mode: "insensitive" } }] }),
  };
  const page = Math.max(1, opts.page ?? 1);
  const [total, rows, counts] = await Promise.all([
    prisma.doNotContact.count({ where }),
    prisma.doNotContact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * DNC_PAGE, take: DNC_PAGE }),
    prisma.doNotContact.groupBy({ by: ["kind"], where: { workspaceId }, _count: { _all: true } }),
  ]);
  return { total, rows, page, byKind: Object.fromEntries(counts.map((c) => [c.kind, c._count._all])) as Partial<Record<DncKind, number>> };
}

export interface AddDncResult {
  added: number;
  alreadyThere: number;
  unreadable: string[];
  /** People stopped in running campaigns because of the new entries. */
  stopped: { linkedin: number; email: number };
}

/** Adds lines (LinkedIn profiles, emails, domains, companies) and stops anyone they match in campaigns. */
export async function addDnc(prisma: PrismaClient, workspaceId: string, userId: string, text: string, note?: string): Promise<Result<AddDncResult>> {
  const { entries, unreadable } = parseDncText(text.slice(0, 200_000));
  if (!entries.length) return { ok: false, error: unreadable.length ? "Couldn't read any of those. Use LinkedIn profile links, emails, domains (acme.com) or company names." : "Paste at least one entry." };
  if (entries.length > DNC_MAX_PER_ADD) return { ok: false, error: `Add at most ${DNC_MAX_PER_ADD.toLocaleString("en-US")} at a time.` };
  const labels = new Map<string, string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const e = parseDncText(raw).entries[0];
    if (e && !labels.has(`${e.kind}:${e.value}`)) labels.set(`${e.kind}:${e.value}`, raw.trim().slice(0, 300));
  }
  const r = await prisma.doNotContact.createMany({
    data: entries.map((e) => ({ workspaceId, kind: e.kind, value: e.value, label: labels.get(`${e.kind}:${e.value}`) ?? e.value, note: note?.trim().slice(0, 200) || null, addedBy: userId })),
    skipDuplicates: true,
  });
  const stopped = await stopBlocked(prisma, workspaceId, entries);
  return { ok: true, value: { added: r.count, alreadyThere: entries.length - r.count, unreadable: unreadable.slice(0, 20), stopped } };
}

/** Stops everyone the given entries match who is still due something in a LinkedIn or email campaign. */
export async function stopBlocked(prisma: PrismaClient, workspaceId: string, entries: { kind: DncKind; value: string }[], now = new Date()) {
  const blocked = dncMatcher(entries);
  const stopped = { linkedin: 0, email: 0 };
  const li = await prisma.campaignLead.findMany({
    where: { workspaceId, state: { in: ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT", "PAUSED"] } },
    select: { id: true, profileUrl: true, company: true, lead: { select: { email: true } } },
  });
  const liIds = li.filter((l) => blocked({ profileUrl: l.profileUrl, company: l.company, email: l.lead?.email })).map((l) => l.id);
  if (liIds.length) {
    await prisma.$transaction([
      prisma.action.updateMany({ where: { campaignLeadId: { in: liIds }, status: "QUEUED" }, data: { status: "SKIPPED", error: "DO_NOT_CONTACT", executedAt: now } }),
      prisma.campaignLead.updateMany({ where: { id: { in: liIds } }, data: { state: "SKIPPED", reason: DNC_REASON, nextAt: null, actionId: null } }),
    ]);
    stopped.linkedin = liIds.length;
  }
  const em = await prisma.emailLead.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, email: true, company: true } });
  const emIds = em.filter((l) => blocked({ email: l.email, company: l.company })).map((l) => l.id);
  if (emIds.length) {
    await prisma.emailLead.updateMany({ where: { id: { in: emIds } }, data: { status: "SKIPPED", reason: DNC_REASON, nextAt: null } });
    stopped.email = emIds.length;
  }
  return stopped;
}

/** Removes entries (people they matched who were stopped stay stopped; add them to a campaign again to contact them). */
export async function removeDnc(prisma: PrismaClient, workspaceId: string, ids: string[]): Promise<Result<number>> {
  const r = await prisma.doNotContact.deleteMany({ where: { workspaceId, id: { in: ids.slice(0, 500) } } });
  return { ok: true, value: r.count };
}

/** The whole list as CSV. */
export async function dncCsv(prisma: PrismaClient, workspaceId: string): Promise<string> {
  const rows = await prisma.doNotContact.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const cell = (v: string | null) => (/[",\n]/.test(v ?? "") ? `"${(v ?? "").replace(/"/g, '""')}"` : (v ?? ""));
  return ["type,entry,note,added", ...rows.map((r) => [r.kind.toLowerCase(), r.label, r.note, r.createdAt.toISOString().slice(0, 10)].map(cell).join(","))].join("\n");
}
