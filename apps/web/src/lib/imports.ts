import type { PrismaClient } from "@invytra/db";
import { IMPORT_MAX_LEADS, parseSearchUrl } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";
import { getList, listNameSchema } from "./leads";

/*
 * Collecting people from a LinkedIn / Sales Navigator search link. The web app
 * only records the request; the worker reads the pages (CLAUDE.md rule 1).
 * Every query is scoped to the signed-in user's workspace (rule 0).
 */

export const IMPORT_SIZES = [10, 25, 50, 100, 250, 500, 1000, 2500] as const;

export const searchImportSchema = z
  .object({
    listId: z.string().max(40).optional(),
    name: z.string().optional(),
    url: z.string().trim().max(4000),
    accountId: z.string().max(40),
    maxLeads: z.number().int().min(1).max(IMPORT_MAX_LEADS),
  })
  .refine((v) => v.listId || v.name !== undefined, { message: "Missing list." });
export type SearchImportInput = z.infer<typeof searchImportSchema>;

/** At most this many imports running at once per workspace. */
const MAX_RUNNING = 5;

export async function startSearchImport(prisma: PrismaClient, workspaceId: string, input: SearchImportInput): Promise<Result<{ listId: string; importId: string }>> {
  const search = parseSearchUrl(input.url);
  if (!search.ok) return { ok: false, error: search.reason };
  const account = await prisma.linkedinAccount.findFirst({ where: { id: input.accountId, workspaceId }, select: { id: true, label: true, status: true } });
  if (!account) return { ok: false, error: "Choose one of your LinkedIn accounts to run the search." };
  if (account.status === "DISCONNECTED") return { ok: false, error: `Connect “${account.label}” to LinkedIn first.` };
  if ((await prisma.leadImport.count({ where: { workspaceId, status: "RUNNING" } })) >= MAX_RUNNING) {
    return { ok: false, error: `You already have ${MAX_RUNNING} searches being collected. Wait for one to finish, or stop one.` };
  }

  let listId = input.listId;
  if (listId) await getList(prisma, workspaceId, listId);
  else {
    const name = listNameSchema.safeParse(input.name);
    if (!name.success) return { ok: false, error: name.error.issues[0]!.message };
    listId = (await prisma.leadList.create({ data: { workspaceId, name: name.data } })).id;
  }
  const imp = await prisma.leadImport.create({
    data: { workspaceId, listId, accountId: account.id, kind: search.kind, url: search.url, maxLeads: input.maxLeads },
    select: { id: true },
  });
  return { ok: true, value: { listId, importId: imp.id } };
}

/** Stop collecting; people already added stay in the list. */
export async function cancelSearchImport(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const imp = await prisma.leadImport.findFirst({ where: { id, workspaceId } });
  if (!imp) return { ok: false, error: "Import not found." };
  if (imp.status !== "RUNNING") return { ok: true, value: undefined };
  await prisma.$transaction([
    prisma.leadImport.update({ where: { id }, data: { status: "CANCELLED", reason: "CANCELLED", actionId: null, finishedAt: new Date() } }),
    ...(imp.actionId
      ? [prisma.action.updateMany({ where: { id: imp.actionId, status: "QUEUED" }, data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() } })]
      : []),
  ]);
  return { ok: true, value: undefined };
}

/** Imports into one list, newest first (running ones are shown with progress). */
export async function importsForList(prisma: PrismaClient, workspaceId: string, listId: string) {
  return prisma.leadImport.findMany({
    where: { workspaceId, listId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { account: { select: { label: true, status: true } } },
  });
}
export type ImportRow = Awaited<ReturnType<typeof importsForList>>[number];

/** Lists with a search still being collected. */
export async function listsImporting(prisma: PrismaClient, workspaceId: string): Promise<Set<string>> {
  const rows = await prisma.leadImport.findMany({ where: { workspaceId, status: "RUNNING" }, select: { listId: true } });
  return new Set(rows.map((r) => r.listId));
}

export const IMPORT_REASON: Record<string, string> = {
  END: "Reached the end of the search results",
  MAX_LEADS: "Collected the number of people you asked for",
  MAX_PAGES: "Reached the last page LinkedIn shows (100)",
  CANCELLED: "Stopped",
  SEARCH_LIMIT: "LinkedIn's monthly search limit for this account was reached. It resets at the start of next month (Premium or Sales Navigator accounts have more).",
  NO_SALES_NAV: "This account doesn't have Sales Navigator. Use an account with Sales Navigator, or a regular LinkedIn search link.",
};

/** Accounts offered for reading a search. */
export async function importAccounts(prisma: PrismaClient, workspaceId: string) {
  return prisma.linkedinAccount.findMany({
    where: { workspaceId },
    orderBy: { label: "asc" },
    select: { id: true, label: true, status: true, profileName: true },
  });
}
