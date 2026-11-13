import { sendingProblem } from "./subscriptions";
import type { Prisma, PrismaClient } from "@invytra/db";
import { INVY_MESSAGE_MAX, type InvyReason, type SiteCheck, type SocialLink } from "@invytra/shared";
import type { Result } from "./accounts";
import { addListsToCampaign, createEmailCampaign } from "./email-campaigns";
import { importContacts } from "./email-contacts";

/*
 * Ask Invy in the dashboard: start a search or a follow-up (the worker runs it), list and
 * open searches, save businesses, send them to an email campaign, export. Every query is
 * scoped to the signed-in workspace (CLAUDE.md rule 0).
 */

export type InvyMsg = { role: "user" | "invy"; text: string; at: string };

const cleanText = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, INVY_MESSAGE_MAX);

export async function startSearch(prisma: PrismaClient, workspaceId: string, userId: string, text: string): Promise<Result<{ id: string }>> {
  const stop = await sendingProblem(prisma, workspaceId);
  if (stop) return { ok: false, error: stop };
  const t = cleanText(text);
  if (t.length < 4) return { ok: false, error: "Tell Invy what to find, e.g. “20 dental clinics in Mumbai without online booking”." };
  const s = await prisma.invySearch.create({
    data: { workspaceId, userId, title: "", status: "QUEUED", progress: "Waiting to start…", messages: [{ role: "user", text: t, at: new Date().toISOString() }] },
    select: { id: true },
  });
  return { ok: true, value: s };
}

/** A follow-up in the same search ("only in Koramangala", "10 more"). */
export async function followUp(prisma: PrismaClient, workspaceId: string, id: string, text: string): Promise<Result> {
  const stop = await sendingProblem(prisma, workspaceId);
  if (stop) return { ok: false, error: stop };
  const t = cleanText(text);
  if (!t) return { ok: false, error: "Type a message." };
  const s = await prisma.invySearch.findFirst({ where: { id, workspaceId } });
  if (!s) return { ok: false, error: "That search is gone." };
  if (s.status === "QUEUED" || s.status === "RUNNING") return { ok: false, error: "Invy is still working on the last message." };
  const messages = [...((s.messages as InvyMsg[]) ?? []), { role: "user" as const, text: t, at: new Date().toISOString() }];
  await prisma.invySearch.update({ where: { id }, data: { messages, status: "QUEUED", progress: "Waiting to start…", error: null } });
  return { ok: true, value: undefined };
}

export const listSearches = (prisma: PrismaClient, workspaceId: string) =>
  prisma.invySearch
    .findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, status: true, messages: true, updatedAt: true, _count: { select: { businesses: { where: { position: { not: null } } } } } },
    })
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        title: r.title || ((r.messages as InvyMsg[])[0]?.text ?? "Search"),
        status: r.status,
        found: r._count.businesses,
        updatedAt: r.updatedAt,
      })),
    );

export type InvyCard = {
  id: string;
  n: number;
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviews: number | null;
  emails: string[];
  /** Social profiles linked from its website (or the social page its listing points to). */
  socials: SocialLink[];
  reasons: InvyReason[];
  check: SiteCheck | null;
  why: string | null;
  opportunity: string | null;
  saved: boolean;
};

const socialsOf = (check: unknown): SocialLink[] => ((check as SiteCheck | null)?.socials ?? []).slice(0, 6);

/** Social links as one CSV cell ("instagram: https://…; facebook: https://…"). */
export const socialsText = (s: unknown) => ((s as SocialLink[] | null) ?? []).map((x) => `${x.network}: ${x.url}`).join("; ");

export async function getSearch(prisma: PrismaClient, workspaceId: string, id: string) {
  const s = await prisma.invySearch.findFirst({ where: { id, workspaceId } });
  if (!s) return null;
  const rows = await prisma.invyBusiness.findMany({ where: { searchId: id, position: { not: null } }, orderBy: { position: "asc" } });
  const saved = new Set(
    (await prisma.invyProspect.findMany({ where: { workspaceId, placeId: { in: rows.map((r) => r.placeId) } }, select: { placeId: true } })).map((p) => p.placeId),
  );
  const looked = await prisma.invyBusiness.count({ where: { searchId: id } });
  const cards: InvyCard[] = rows.map((r) => ({
    id: r.id,
    n: r.position!,
    placeId: r.placeId,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    website: r.website,
    mapsUrl: r.mapsUrl,
    rating: r.rating,
    reviews: r.reviews,
    emails: r.emails,
    socials: socialsOf(r.check),
    reasons: (r.reasons as unknown as InvyReason[]) ?? [],
    check: (r.check as unknown as SiteCheck | null) ?? null,
    why: r.why,
    opportunity: r.opportunity,
    saved: saved.has(r.placeId),
  }));
  return {
    id: s.id,
    title: s.title || ((s.messages as InvyMsg[])[0]?.text ?? "Search"),
    status: s.status,
    progress: s.progress,
    summary: s.summary,
    error: s.error,
    messages: (s.messages as InvyMsg[]) ?? [],
    creditsUsed: s.creditsUsed,
    looked,
    cards,
  };
}
export type InvySearchView = NonNullable<Awaited<ReturnType<typeof getSearch>>>;

export async function renameSearch(prisma: PrismaClient, workspaceId: string, id: string, title: string): Promise<Result> {
  const t = title.trim().slice(0, 120);
  if (!t) return { ok: false, error: "Give the search a name." };
  const r = await prisma.invySearch.updateMany({ where: { id, workspaceId }, data: { title: t } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That search is gone." };
}

export async function deleteSearch(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const s = await prisma.invySearch.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!s) return { ok: false, error: "That search is already gone." };
  if (s.status === "RUNNING") return { ok: false, error: "Invy is working on this search. Delete it when it's done." };
  await prisma.invySearch.delete({ where: { id } });
  return { ok: true, value: undefined };
}

/** The businesses of this search with these ids (only this workspace's, only those shown). */
const pick = (prisma: PrismaClient, workspaceId: string, searchId: string, ids: string[]) =>
  prisma.invyBusiness.findMany({ where: { workspaceId, searchId, id: { in: ids.slice(0, 500) }, position: { not: null } }, orderBy: { position: "asc" } });

/** Saves businesses to the workspace's saved list (later searches skip them). */
export async function saveBusinesses(prisma: PrismaClient, workspaceId: string, searchId: string, ids: string[]): Promise<Result<number>> {
  const rows = await pick(prisma, workspaceId, searchId, ids);
  for (const b of rows) {
    const data = {
      name: b.name,
      category: b.category,
      address: b.address,
      lat: b.lat,
      lng: b.lng,
      phone: b.phone,
      website: b.website,
      mapsUrl: b.mapsUrl,
      email: b.emails[0] ?? null,
      socials: socialsOf(b.check),
      why: b.why,
      opportunity: b.opportunity,
      searchId,
    };
    await prisma.invyProspect.upsert({ where: { workspaceId_placeId: { workspaceId, placeId: b.placeId } }, create: { workspaceId, placeId: b.placeId, ...data }, update: data });
  }
  return { ok: true, value: rows.length };
}

export async function unsaveBusiness(prisma: PrismaClient, workspaceId: string, prospectId: string): Promise<Result> {
  const r = await prisma.invyProspect.deleteMany({ where: { id: prospectId, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "Already removed." };
}

export const listSaved = (prisma: PrismaClient, workspaceId: string) => prisma.invyProspect.findMany({ where: { workspaceId }, orderBy: { savedAt: "desc" }, take: 1000 });

const csvCell = (v: unknown, forSpreadsheet = true) => {
  const s = v == null ? "" : String(v);
  // Never let a spreadsheet run a cell as a formula (downloads only; the import reads it as text).
  const safe = forSpreadsheet && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The chosen businesses as CSV (all shown ones when none are chosen). */
export async function searchCsv(prisma: PrismaClient, workspaceId: string, searchId: string, ids: string[] | null): Promise<string | null> {
  const s = await prisma.invySearch.findFirst({ where: { id: searchId, workspaceId }, select: { id: true } });
  if (!s) return null;
  const rows = await prisma.invyBusiness.findMany({
    where: { searchId, position: { not: null }, ...(ids?.length ? { id: { in: ids } } : {}) },
    orderBy: { position: "asc" },
  });
  const head = ["#", "Business", "Category", "Address", "Phone", "Email", "Social profiles", "Website", "Google rating", "Google reviews", "Why", "Opportunity", "Checked facts", "Google Maps", "Latitude", "Longitude"];
  const lines = rows.map((b) =>
    [b.position, b.name, b.category, b.address, b.phone, b.emails.join("; "), socialsText(socialsOf(b.check)), b.website, b.rating, b.reviews, b.why, b.opportunity, ((b.reasons as unknown as InvyReason[]) ?? []).map((r) => r.text).join(" "), b.mapsUrl, b.lat, b.lng]
      .map((v) => csvCell(v))
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/**
 * Puts the chosen businesses that have an email into an email list and a new draft email
 * campaign (nothing is sent: the user writes and launches it). Businesses without an email
 * are left out and counted.
 */
export async function emailBusinesses(prisma: PrismaClient, workspaceId: string, searchId: string, ids: string[]): Promise<Result<{ campaignId: string; added: number; noEmail: number }>> {
  const s = await prisma.invySearch.findFirst({ where: { id: searchId, workspaceId }, select: { title: true, messages: true } });
  if (!s) return { ok: false, error: "That search is gone." };
  const rows = await pick(prisma, workspaceId, searchId, ids);
  const withEmail = rows.filter((b) => b.emails.length);
  if (!withEmail.length) return { ok: false, error: "None of these businesses has a public email address. Save them, or call them instead." };
  const title = (s.title || "Ask Invy search").slice(0, 60);
  const head = ["email", "company_name", "website", "custom:phone", "custom:address", "custom:opportunity"];
  const text = [
    "email,company,website,phone,address,opportunity",
    ...withEmail.map((b) => [b.emails[0], b.name, b.website, b.phone, b.address, b.opportunity].map((v) => csvCell(v, false)).join(",")),
  ].join("\n");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const imp = await importContacts(prisma, workspaceId, { text, mapping: head, list: { name: `Ask Invy: ${title} (${stamp})`.slice(0, 80) } });
  if (!imp.ok) return imp;
  const c = await createEmailCampaign(prisma, workspaceId, `Ask Invy: ${title}`.slice(0, 80));
  if (!c.ok) return c;
  const added = await addListsToCampaign(prisma, workspaceId, c.value.id, [imp.value.listId]);
  if (!added.ok) return added;
  await saveBusinesses(prisma, workspaceId, searchId, withEmail.map((b) => b.id));
  await prisma.invyProspect.updateMany({ where: { workspaceId, placeId: { in: withEmail.map((b) => b.placeId) } }, data: { emailedAt: new Date() } });
  return { ok: true, value: { campaignId: c.value.id, added: withEmail.length, noEmail: rows.length - withEmail.length } };
}

export type { Prisma };
