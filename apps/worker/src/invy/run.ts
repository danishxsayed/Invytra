import { AI_COSTS, defaultOpportunity, invyCriteriaSchema, invyTitle, matchBusiness, type InvyCriteria, type InvyReason, type SiteCheck } from "@invytra/shared";
import { aiCreditsLeft, spendAiCredits, type Prisma, type PrismaClient } from "@invytra/db";
import { InvyAiError, type ChatTurn, type InvyBrain } from "./brain.js";
import { PlacesError, type Place, type PlacesSearch } from "./places.js";
import { checkSite as realCheckSite } from "./site-check.js";

/*
 * Runs one Ask Invy search (in the worker): understand the latest message, look through Google
 * results page by page (within a budget), check websites, keep the businesses that match with
 * their evidence, charge 1 AI credit for each business shown, and have Invy explain them.
 */

export type InvyMessage = { role: "user" | "invy"; text: string; at: string };
type Cursor = { queries: { q: string; next: string | null; done: boolean }[]; understood: number; pages: number };

/** Google pages one run may use (20 businesses each): enough for most asks, capped for cost. */
export const pageBudget = (count: number) => Math.min(12, Math.max(2, Math.ceil(count / 20) * 2));

export interface InvyDeps {
  places: PlacesSearch | null;
  brain: InvyBrain | null;
  /** Tests only: a monthly allowance by plan instead of the workspace's own. */
  monthlyCredits?: (plan: string) => number;
  checkSite?: (website: string | null) => Promise<SiteCheck>;
  /** Called with a short progress line ("Checking 12 websites…"). */
  now?: () => Date;
}

const say = (text: string, now: Date): InvyMessage => ({ role: "invy", text, at: now.toISOString() });

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

export async function runInvySearch(prisma: PrismaClient, searchId: string, deps: InvyDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const s = await prisma.invySearch.findUnique({ where: { id: searchId }, include: { workspace: { select: { id: true } } } });
  if (!s || s.status !== "RUNNING") return;
  const messages = (s.messages as InvyMessage[]) ?? [];
  const progress = (p: string) => prisma.invySearch.update({ where: { id: s.id }, data: { progress: p } });
  const finish = (data: Prisma.InvySearchUpdateInput, reply?: string, failed = false) =>
    prisma.invySearch.update({
      where: { id: s.id },
      data: { ...data, status: failed ? "FAILED" : "DONE", progress: null, ...(reply ? { messages: [...messages, say(reply, now())] } : {}) },
    });

  try {
    if (!deps.places || !deps.brain) {
      await finish({ error: "not set up" }, "Ask Invy isn't set up on this server yet (the Google Maps or AI key is missing).", true);
      return;
    }
    // 1. Understand the newest message (a follow-up refines the criteria).
    let criteria = s.criteria ? invyCriteriaSchema.parse(s.criteria) : null;
    const cursor: Cursor = (s.cursor as Cursor | null) ?? { queries: [], understood: 0, pages: 0 };
    let reply = "";
    if (cursor.understood < messages.length) {
      await progress("Understanding your request…");
      const turns: ChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
      const u = await deps.brain.understand(turns, criteria);
      if ("question" in u) {
        await finish({ cursor: { ...cursor, understood: messages.length + 1 } }, u.question);
        return;
      }
      criteria = u.criteria;
      reply = u.reply;
      const known = new Set(cursor.queries.map((q) => q.q.toLowerCase()));
      for (const q of criteria.queries) if (!known.has(q.toLowerCase())) cursor.queries.push({ q, next: null, done: false });
      cursor.understood = messages.length + 1;
      cursor.pages = 0;
    }
    if (!criteria) throw new InvyAiError("Nothing to search for yet.");
    const k = criteria;
    await prisma.invySearch.update({ where: { id: s.id }, data: { criteria: k, cursor, title: s.title || invyTitle(k) } });

    // 2. Judge what's already been found against the (maybe new) criteria: free.
    const judge = async (rows: { id: string; name: string; category: string | null; rating: number | null; reviews: number | null; website: string | null; phone: string | null; businessStatus: string | null; check: unknown }[]) => {
      for (const r of rows) {
        const m = matchBusiness({ ...r, check: (r.check as SiteCheck | null) ?? null }, k, now());
        await prisma.invyBusiness.update({ where: { id: r.id }, data: { match: m.match, reasons: m.reasons as unknown as Prisma.InputJsonValue, ...(m.match ? {} : { position: null }) } });
      }
    };
    await judge(await prisma.invyBusiness.findMany({ where: { searchId: s.id } }));
    const matched = () => prisma.invyBusiness.count({ where: { searchId: s.id, match: true } });

    // 3. More from Google until there are enough, the queries run out, or the page budget is used.
    const saved = new Set((await prisma.invyProspect.findMany({ where: { workspaceId: s.workspaceId }, select: { placeId: true } })).map((p) => p.placeId));
    const budget = pageBudget(k.count);
    const check = deps.checkSite ?? ((w: string | null) => realCheckSite(w));
    let looked = await prisma.invyBusiness.count({ where: { searchId: s.id } });
    while ((await matched()) < k.count && cursor.pages < budget) {
      const q = cursor.queries.find((x) => !x.done);
      if (!q) break;
      await progress(`Searching Google Maps: ${q.q}…`);
      const page = await deps.places.search(q.q, q.next);
      cursor.pages++;
      q.next = page.next;
      q.done = !page.next;
      const have = new Set((await prisma.invyBusiness.findMany({ where: { searchId: s.id }, select: { placeId: true } })).map((b) => b.placeId));
      const fresh = page.places.filter((p) => !have.has(p.placeId) && !saved.has(p.placeId));
      looked += fresh.length;
      await progress(`Checking ${fresh.length} businesses (${looked} looked at so far)…`);
      const checks = await pool(fresh, 6, (p: Place) => check(p.website));
      for (const [i, p] of fresh.entries()) {
        const c = checks[i]!;
        const m = matchBusiness({ ...p, check: c }, k, now());
        await prisma.invyBusiness.create({
          data: {
            searchId: s.id,
            workspaceId: s.workspaceId,
            ...p,
            check: c as unknown as Prisma.InputJsonValue,
            emails: c.emails ?? [],
            match: m.match,
            reasons: m.reasons as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await prisma.invySearch.update({ where: { id: s.id }, data: { cursor } });
    }

    // 4. Show up to `count` matches, paying 1 credit for each one shown for the first time.
    const shown = await prisma.invyBusiness.findMany({ where: { searchId: s.id, match: true, position: { not: null } }, orderBy: { position: "asc" } });
    const room = Math.max(0, k.count - shown.length);
    let candidates = await prisma.invyBusiness.findMany({ where: { searchId: s.id, match: true, position: null }, orderBy: [{ rating: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }], take: room });
    // Already paid for earlier in this search: free to show again.
    const paidBefore = candidates.filter((c) => c.charged);
    const unpaid = candidates.filter((c) => !c.charged);
    const left = await aiCreditsLeft(prisma, s.workspaceId, deps.monthlyCredits);
    const affordable = Math.min(unpaid.length, Math.floor(left / AI_COSTS.INVY));
    let creditNote = "";
    if (affordable < unpaid.length) creditNote = ` ${unpaid.length - affordable} more matched, but you're out of AI credits. Buy more on the Credits page to see them.`;
    const toCharge = unpaid.slice(0, affordable);
    if (toCharge.length) {
      const spent = await spendAiCredits(prisma, s.workspaceId, toCharge.length * AI_COSTS.INVY, "INVY", deps.monthlyCredits, { ref: s.id });
      if (!spent) toCharge.length = 0;
    }
    candidates = [...paidBefore, ...toCharge];
    let pos = shown.length;
    for (const c of candidates) await prisma.invyBusiness.update({ where: { id: c.id }, data: { position: ++pos, charged: true } });

    // 5. Invy explains (the facts were checked; this is its reading of them).
    const all = await prisma.invyBusiness.findMany({ where: { searchId: s.id, position: { not: null } }, orderBy: { position: "asc" } });
    const needWords = all.filter((b) => !b.why || candidates.some((c) => c.id === b.id) || reply);
    let summary = s.summary ?? "";
    if (needWords.length || reply) {
      await progress("Writing up what I found…");
      const ex = await deps.brain
        .explain(
          k,
          needWords.map((b) => ({ id: b.id, name: b.name, category: b.category, rating: b.rating, reviews: b.reviews, reasons: b.reasons as unknown as InvyReason[] })),
          { checked: looked, matched: all.length, wanted: k.count },
        )
        .catch(() => null);
      if (ex?.summary) summary = ex.summary;
      for (const b of needWords) {
        const it = ex?.items[b.id];
        await prisma.invyBusiness.update({ where: { id: b.id }, data: { why: it?.why ?? b.why ?? null, opportunity: it?.opportunity || b.opportunity || defaultOpportunity(k) } });
      }
    }
    const found = all.length;
    const tail =
      found >= k.count
        ? `Here are ${found} ${k.category}.`
        : found
          ? `I found ${found} of the ${k.count} you asked for after checking ${looked} businesses. Ask me to “find more” to keep looking.`
          : `None of the ${looked} businesses I checked matched yet. Try a nearby area, or ask me to “keep looking”.`;
    await finish({ summary, creditsUsed: { increment: toCharge.length * AI_COSTS.INVY }, error: null }, [reply, tail].filter(Boolean).join(" ") + creditNote);
  } catch (e) {
    const msg = e instanceof PlacesError || e instanceof InvyAiError ? e.message : "Something went wrong while searching. Please try again.";
    if (!(e instanceof PlacesError || e instanceof InvyAiError)) console.error("[invy] search failed", searchId, e instanceof Error ? e.message : e);
    await finish({ error: msg.slice(0, 300) }, msg, true);
  }
}

/** Picks the next queued search and runs it (returns false when there's none). */
export async function runNextInvySearch(prisma: PrismaClient, deps: InvyDeps): Promise<boolean> {
  const next = await prisma.invySearch.findFirst({ where: { status: "QUEUED" }, orderBy: { updatedAt: "asc" }, select: { id: true } });
  if (!next) return false;
  const claimed = await prisma.invySearch.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "RUNNING", progress: "Starting…" } });
  if (claimed.count) await runInvySearch(prisma, next.id, deps);
  return true;
}

/** After a crash: searches left running go back in the queue. */
export const requeueStuckInvySearches = (prisma: PrismaClient, olderThanMs = 15 * 60_000) =>
  prisma.invySearch.updateMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: "QUEUED" } });
