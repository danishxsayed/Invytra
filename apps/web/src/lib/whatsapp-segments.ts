import { segmentWhere, type PrismaClient } from "@invytra/db";
import { segmentSchema, waTag, type SegmentRules } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * WhatsApp segments of a workspace: saved rules over contacts (see whatsapp-segments.ts in
 * shared and db). Listed with live counts, previewed while being built, targeted by
 * campaigns. Deleting a segment never touches its contacts. Scoped to the workspace.
 */

export async function listSegments(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const rows = await prisma.whatsappSegment.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const counts = await Promise.all(rows.map((s) => prisma.whatsappContact.count({ where: { workspaceId, ...segmentWhere(s, now) } })));
  return rows.map((s, i) => ({ id: s.id, name: s.name, color: s.color, match: s.match as "all" | "any", rules: s.rules as unknown as SegmentRules["rules"], count: counts[i]! }));
}

export const getSegment = (prisma: PrismaClient, workspaceId: string, id: string) => prisma.whatsappSegment.findFirst({ where: { id, workspaceId } });

/** How many contacts the rules match, and a few names, while the segment is being built. */
export async function previewSegment(prisma: PrismaClient, workspaceId: string, input: unknown, now = new Date()): Promise<{ count: number; names: string[] } | { error: string }> {
  const p = segmentSchema.pick({ match: true, rules: true }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  const where = { workspaceId, ...segmentWhere(clean(p.data), now) };
  const [count, some] = await Promise.all([
    prisma.whatsappContact.count({ where }),
    prisma.whatsappContact.findMany({ where, take: 3, orderBy: [{ firstName: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], select: { firstName: true, lastName: true, profileName: true, phone: true } }),
  ]);
  return { count, names: some.map((c) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || `+${c.phone}`) };
}

/** Tag values as stored (lowercase, dashes). */
const clean = <T extends { rules: { field: string; op: string; value: string }[] }>(s: T): T => ({ ...s, rules: s.rules.map((r) => ({ ...r, value: r.field === "tag" ? waTag(r.value) : r.value.trim() })) });

export async function saveSegment(prisma: PrismaClient, workspaceId: string, id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const p = segmentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const d = clean(p.data);
  const clash = await prisma.whatsappSegment.findFirst({ where: { workspaceId, name: { equals: d.name, mode: "insensitive" }, ...(id && { NOT: { id } }) }, select: { id: true } });
  if (clash) return { ok: false, error: "You already have a segment with this name." };
  if (id) {
    const r = await prisma.whatsappSegment.updateMany({ where: { id, workspaceId }, data: { name: d.name, color: d.color, match: d.match, rules: d.rules } });
    return r.count ? { ok: true, value: { id } } : { ok: false, error: "That segment is gone." };
  }
  if ((await prisma.whatsappSegment.count({ where: { workspaceId } })) >= 50) return { ok: false, error: "You can have up to 50 segments. Delete one you don't use first." };
  const s = await prisma.whatsappSegment.create({ data: { workspaceId, name: d.name, color: d.color, match: d.match, rules: d.rules } });
  return { ok: true, value: { id: s.id } };
}

export async function renameSegment(prisma: PrismaClient, workspaceId: string, id: string, nameRaw: string): Promise<Result> {
  const name = nameRaw.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name the segment." };
  const r = await prisma.whatsappSegment.updateMany({ where: { id, workspaceId }, data: { name } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That segment is gone." };
}

/** Deletes segments (never their contacts). Campaigns that used one keep the recipients they already have. */
export async function deleteSegments(prisma: PrismaClient, workspaceId: string, raw: unknown): Promise<Result<number>> {
  const ids = z.array(z.string().min(1).max(40)).min(1, "Choose a segment.").max(50).safeParse(raw);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]!.message };
  const r = await prisma.whatsappSegment.deleteMany({ where: { workspaceId, id: { in: ids.data } } });
  return { ok: true, value: r.count };
}
