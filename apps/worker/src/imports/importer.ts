import type { LeadImport, PrismaClient } from "@invytra/db";
import { MAX_PAGES, canonicalProfileUrl, searchPageUrl, type SearchKind } from "@invytra/shared";
import type { Queue } from "bullmq";
import type { FoundPerson } from "../linkedin/search.js";
import { createActionRow, scheduleAction, type ActionJob } from "../queue/queue.js";

/**
 * Lead imports from a search link. Every tick, for each running import: if its
 * page is still waiting, leave it; if the page finished, add the people to the
 * list and decide whether to read the next one; if nothing is queued, queue the
 * next page. Pages go through the normal queue, so working hours, the
 * search-pages-per-day cap and pacing all apply.
 */
export interface ImportDeps {
  prisma: PrismaClient;
  queue: Queue<ActionJob>;
  now?: () => Date;
}

export async function importTick(deps: ImportDeps): Promise<{ queued: number; added: number; finished: number }> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const out = { queued: 0, added: 0, finished: 0 };
  const running = await prisma.leadImport.findMany({ where: { status: "RUNNING" }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const imp of running) {
    // Another run is queueing or applying this one right now; if it got stuck (crash), start that page over.
    if (imp.actionId === "pending" || imp.actionId === "applying") {
      if (now.getTime() - imp.updatedAt.getTime() < 2 * 60_000) continue;
      await prisma.leadImport.updateMany({ where: { id: imp.id, actionId: imp.actionId }, data: { actionId: null } });
    } else if (imp.actionId) {
      const action = await prisma.action.findUnique({ where: { id: imp.actionId } });
      if (action && (action.status === "QUEUED" || action.status === "RUNNING")) continue;
      if (action) {
        const r = await applyPage(prisma, imp, action, now);
        out.added += r.added;
        if (r.finished) {
          out.finished++;
          continue;
        }
      } else {
        await prisma.leadImport.update({ where: { id: imp.id }, data: { actionId: null } });
      }
    }
    const fresh = await prisma.leadImport.findUnique({ where: { id: imp.id } });
    if (fresh?.status === "RUNNING" && !fresh.actionId && (await queuePage(deps, fresh, now))) out.queued++;
  }
  return out;
}

async function queuePage(deps: ImportDeps, imp: LeadImport, now: Date): Promise<boolean> {
  const { prisma, queue } = deps;
  const action = await prisma.$transaction(async (tx) => {
    const claimed = await tx.leadImport.updateMany({ where: { id: imp.id, status: "RUNNING", actionId: null }, data: { actionId: "pending" } });
    if (claimed.count === 0) return null;
    const row = await createActionRow(tx, {
      accountId: imp.accountId,
      type: "SEARCH_PAGE",
      targetUrl: searchPageUrl(imp.url, imp.nextPage),
      payload: { importId: imp.id, kind: imp.kind, page: imp.nextPage },
      runAt: now,
    });
    await tx.leadImport.update({ where: { id: imp.id }, data: { actionId: row.id } });
    return row;
  });
  if (!action) return false;
  await scheduleAction(queue, action.id, action.scheduledAt);
  return true;
}

type Finished = { status: string; error: string | null; payload: unknown };

/** Adds a finished page's people to the list and decides what happens next. */
export async function applyPage(prisma: PrismaClient, imp: LeadImport, action: Finished, now: Date): Promise<{ added: number; finished: boolean }> {
  // Claim it, so a page is only ever counted once even if two ticks see it finish.
  const claimed = await prisma.leadImport.updateMany({ where: { id: imp.id, actionId: imp.actionId }, data: { actionId: "applying" } });
  if (claimed.count === 0) return { added: 0, finished: true };
  const finish = async (status: "DONE" | "FAILED", reason: string, extra: Record<string, number> = {}) => {
    await prisma.leadImport.update({ where: { id: imp.id }, data: { status, reason, actionId: null, finishedAt: now, ...extra } });
  };
  if (action.status !== "SUCCEEDED") {
    const reason = (action.error ?? "FAILED").split("\n")[0]!.trim().slice(0, 300);
    await finish("FAILED", reason || "FAILED");
    return { added: 0, finished: true };
  }

  const result = ((action.payload ?? {}) as { result?: { people?: FoundPerson[]; hasNext?: boolean } }).result ?? {};
  const room = Math.max(0, imp.maxLeads - imp.found);
  const people = (result.people ?? [])
    .map((p) => ({ ...p, profileUrl: canonicalProfileUrl(p.profileUrl) }))
    .filter((p): p is FoundPerson & { profileUrl: string } => !!p.profileUrl)
    .slice(0, room);

  const urls = people.map((p) => p.profileUrl);
  const existing = new Set(
    (await prisma.lead.findMany({ where: { listId: imp.listId, profileUrl: { in: urls } }, select: { profileUrl: true } })).map((l) => l.profileUrl),
  );
  const fresh = people.filter((p) => !existing.has(p.profileUrl));
  if (fresh.length) {
    const cut = (v: string | null) => (v ? v.slice(0, 200) : null);
    await prisma.lead.createMany({
      data: fresh.map((p) => ({
        workspaceId: imp.workspaceId,
        listId: imp.listId,
        profileUrl: p.profileUrl,
        firstName: cut(p.firstName),
        lastName: cut(p.lastName),
        company: cut(p.company),
        title: cut(p.title),
        location: cut(p.location),
        degree: p.degree ?? null,
        // Only a badge we saw counts; no badge in a search result isn't proof (it may not be shown there).
        premium: p.premium ? true : null,
      })),
      skipDuplicates: true,
    });
    // Campaigns using this list pick the new people up on their next tick.
    await prisma.leadList.update({ where: { id: imp.listId }, data: { updatedAt: now } });
  }

  const counts = { pages: imp.pages + 1, found: imp.found + people.length, added: imp.added + fresh.length, nextPage: imp.nextPage + 1 };
  let reason: string | null = null;
  if (people.length === 0 || !result.hasNext) reason = "END";
  else if (counts.found >= imp.maxLeads) reason = "MAX_LEADS";
  else if (counts.nextPage > MAX_PAGES[imp.kind as SearchKind]) reason = "MAX_PAGES";
  if (reason) {
    await finish("DONE", reason, counts);
    return { added: fresh.length, finished: true };
  }
  await prisma.leadImport.update({ where: { id: imp.id }, data: { ...counts, actionId: null } });
  return { added: fresh.length, finished: false };
}
