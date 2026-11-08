import { Prisma, type PrismaClient } from "@invytra/db";
import { LEAD_IMPORT, LEAD_FIELDS, leadsFromCsv, leadsFromText, livePhoto, type LeadInput } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Lead lists. Every function takes the signed-in user's workspaceId first and
 * never touches a list or lead outside it (CLAUDE.md rule 0).
 */

export class LeadListNotFoundError extends Error {
  constructor() {
    super("List not found.");
  }
}

export const listNameSchema = z.string().trim().min(1, "Give the list a name.").max(80, "Keep the name under 80 characters.");

export const importSchema = z
  .object({
    listId: z.string().max(40).optional(),
    name: z.string().optional(),
    kind: z.enum(["csv", "paste"]),
    text: z.string().max(LEAD_IMPORT.maxBytes, "That file is too large (5 MB max). Split it into smaller files."),
    mapping: z.record(z.enum(LEAD_FIELDS), z.number().int().min(0).max(500)).optional(),
  })
  .refine((v) => v.listId || v.name !== undefined, { message: "Missing list." });
export type ImportInput = z.infer<typeof importSchema>;

export interface ImportSummary {
  listId: string;
  added: number;
  alreadyInList: number;
  /** Of the added leads, how many are also in another of this workspace's lists. */
  inOtherLists: number;
  invalid: number;
  duplicatesInFile: number;
  overLimit: number;
}

export async function getList(prisma: PrismaClient, workspaceId: string, id: string) {
  const list = await prisma.leadList.findFirst({ where: { id, workspaceId } });
  if (!list) throw new LeadListNotFoundError();
  return list;
}

/** All lists with lead counts and how many leads any account has invited or messaged (same rule campaigns use). */
export async function listSummaries(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.$queryRaw<{ id: string; name: string; created_at: Date; total: number; contacted: number }[]>(Prisma.sql`
    SELECT l.id, l.name, l.created_at,
      COUNT(ld.id)::int AS total,
      COUNT(ld.id) FILTER (WHERE EXISTS (
        SELECT 1 FROM actions a JOIN linkedin_accounts acc ON acc.id = a.account_id
        WHERE acc.workspace_id = ${workspaceId} AND a.target_url = ld.profile_url AND a.status = 'SUCCEEDED'
          AND a.type IN ('CONNECTION_REQUEST', 'MESSAGE')
      ))::int AS contacted
    FROM lead_lists l
    LEFT JOIN leads ld ON ld.list_id = l.id
    WHERE l.workspace_id = ${workspaceId}
    GROUP BY l.id
    ORDER BY l.created_at DESC`);
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, total: r.total, contacted: r.contacted }));
}
export type ListSummary = Awaited<ReturnType<typeof listSummaries>>[number];

export async function leadCount(prisma: PrismaClient, workspaceId: string): Promise<number> {
  return prisma.lead.count({ where: { workspaceId } });
}

/** Parse the upload on the server (never trust the browser's preview) and add it to a list. */
export async function importLeads(prisma: PrismaClient, workspaceId: string, input: ImportInput): Promise<Result<ImportSummary>> {
  const parsed = input.kind === "csv" ? leadsFromCsv(input.text, input.mapping) : leadsFromText(input.text);
  if (input.kind === "csv" && parsed.headers.length && parsed.mapping.url === undefined) {
    return { ok: false, error: "Choose which column holds the LinkedIn profile links." };
  }
  if (parsed.leads.length === 0) return { ok: false, error: "No LinkedIn profile links found." };

  let listId = input.listId;
  if (listId) await getList(prisma, workspaceId, listId);
  else {
    const name = listNameSchema.safeParse(input.name);
    if (!name.success) return { ok: false, error: name.error.issues[0]!.message };
    listId = (await prisma.leadList.create({ data: { workspaceId, name: name.data } })).id;
  }

  const urls = parsed.leads.map((l) => l.profileUrl);
  const existing = new Set<string>();
  const elsewhere = new Set<string>();
  for (let i = 0; i < urls.length; i += 1000) {
    const found = await prisma.lead.findMany({
      where: { workspaceId, profileUrl: { in: urls.slice(i, i + 1000) } },
      select: { profileUrl: true, listId: true },
    });
    for (const f of found) (f.listId === listId ? existing : elsewhere).add(f.profileUrl);
  }

  const fresh = parsed.leads.filter((l) => !existing.has(l.profileUrl));
  for (let i = 0; i < fresh.length; i += 1000) {
    await prisma.lead.createMany({
      data: fresh.slice(i, i + 1000).map((l: LeadInput) => ({ ...l, workspaceId, listId: listId! })),
      skipDuplicates: true,
    });
  }
  await prisma.leadList.update({ where: { id: listId }, data: { updatedAt: new Date() } });

  return {
    ok: true,
    value: {
      listId,
      added: fresh.length,
      alreadyInList: existing.size,
      inOtherLists: fresh.filter((l) => elsewhere.has(l.profileUrl)).length,
      invalid: parsed.invalid.length,
      duplicatesInFile: parsed.duplicates,
      overLimit: parsed.overLimit,
    },
  };
}

export async function renameList(prisma: PrismaClient, workspaceId: string, id: string, name: string): Promise<Result> {
  const n = listNameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]!.message };
  await getList(prisma, workspaceId, id);
  await prisma.leadList.update({ where: { id }, data: { name: n.data } });
  return { ok: true, value: undefined };
}

export async function deleteList(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.leadList.deleteMany({ where: { id, workspaceId } });
  if (r.count === 0) throw new LeadListNotFoundError();
  return { ok: true, value: undefined };
}

export async function removeLeads(prisma: PrismaClient, workspaceId: string, listId: string, ids: string[]): Promise<Result<number>> {
  await getList(prisma, workspaceId, listId);
  const r = await prisma.lead.deleteMany({ where: { workspaceId, listId, id: { in: ids.slice(0, 1000) } } });
  return { ok: true, value: r.count };
}

// ---------------------------------------------------------------- status

export type LeadStage = "NONE" | "QUEUED" | "FAILED" | "VISITED" | "INVITED" | "CONNECTED" | "MESSAGED";
export interface LeadStatus {
  stage: LeadStage;
  at: Date | null;
  /** Failure reason, for a tooltip. */
  detail?: string;
}

const RANK: Record<LeadStage, number> = { NONE: 0, FAILED: 1, QUEUED: 2, VISITED: 3, INVITED: 4, CONNECTED: 5, MESSAGED: 6 };

/** What has happened to each profile, across all of the workspace's accounts. */
export async function leadStatuses(prisma: PrismaClient, workspaceId: string, urls: string[]): Promise<Map<string, LeadStatus>> {
  const out = new Map<string, LeadStatus>();
  if (urls.length === 0) return out;
  const actions = await prisma.action.findMany({
    where: { targetUrl: { in: urls }, account: { workspaceId }, type: { notIn: ["INBOX_SYNC", "SEARCH_PAGE", "WITHDRAW_INVITE"] } },
    select: { targetUrl: true, type: true, status: true, error: true, executedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const a of actions) {
    const stage = stageOf(a.type, a.status, a.error);
    if (!stage || !a.targetUrl) continue;
    const prev = out.get(a.targetUrl);
    const at = a.executedAt ?? a.createdAt;
    if (!prev || RANK[stage] > RANK[prev.stage] || (RANK[stage] === RANK[prev.stage] && stage !== "FAILED")) {
      out.set(a.targetUrl, { stage, at, ...(stage === "FAILED" && a.error ? { detail: a.error.split("\n")[0] } : {}) });
    }
  }
  return out;
}

function stageOf(type: string, status: string, error: string | null): LeadStage | null {
  if (status === "QUEUED" || status === "RUNNING") return "QUEUED";
  if (status === "FAILED") return "FAILED";
  if (status === "SKIPPED") {
    if (error === "CONNECTED") return "CONNECTED";
    if (error === "PENDING") return "INVITED";
    return null;
  }
  if (status !== "SUCCEEDED") return null;
  if (type === "MESSAGE") return "MESSAGED";
  if (type === "CONNECTION_REQUEST") return "INVITED";
  if (type === "PROFILE_VISIT" || type === "CHECK_CONNECTION" || type === "LIKE_POST" || type === "FOLLOW_PROFILE" || type === "COMMENT_POST") return "VISITED";
  return null;
}

/** One page of a list's leads, newest first, with each lead's status. */
export async function leadsPage(
  prisma: PrismaClient,
  workspaceId: string,
  listId: string,
  { q = "", page = 1, pageSize = 50 }: { q?: string; page?: number; pageSize?: number } = {},
) {
  await getList(prisma, workspaceId, listId);
  const term = q.trim().slice(0, 100);
  const where: Prisma.LeadWhereInput = {
    workspaceId,
    listId,
    ...(term && {
      OR: (["firstName", "lastName", "company", "title", "location", "profileUrl", "email"] as const).map((f) => ({
        [f]: { contains: term, mode: "insensitive" as const },
      })),
    }),
  };
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      select: { id: true, profileUrl: true, firstName: true, lastName: true, company: true, title: true, location: true, degree: true, premium: true, email: true, photoUrl: true, createdAt: true },
    }),
  ]);
  const statuses = await leadStatuses(prisma, workspaceId, rows.map((r) => r.profileUrl));
  return {
    total,
    rows: rows.map((r) => ({ ...r, photoUrl: livePhoto(r.photoUrl), status: statuses.get(r.profileUrl) ?? { stage: "NONE" as const, at: null } })),
  };
}
export type LeadRow = Awaited<ReturnType<typeof leadsPage>>["rows"][number];
