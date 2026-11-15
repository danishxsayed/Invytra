import type { Prisma } from "@prisma/client";

/*
 * A segment's rules as a database filter over WhatsApp contacts (rules and their checks:
 * packages/shared/src/whatsapp-segments.ts). Used by the contacts page, the segment
 * counts and the campaign engine, so a segment means the same thing everywhere.
 */

type Rule = { field: string; op: string; value: string };
const DAY = 86_400_000;

function ruleWhere(r: Rule, now: Date): Prisma.WhatsappContactWhereInput {
  const v = r.value.trim();
  const days = (n: string) => new Date(now.getTime() - Math.max(0, Number(n) || 0) * DAY);
  switch (r.field) {
    case "tag":
      return r.op === "not_has" ? { NOT: { tags: { has: v } } } : { tags: { has: v } };
    case "location":
      return r.op === "not_contains" ? { OR: [{ location: null }, { NOT: { location: { contains: v, mode: "insensitive" } } }] } : { location: { contains: v, mode: "insensitive" } };
    case "status":
      return v === "opted_out" ? { optedOutAt: { not: null } } : v === "not_opted_in" ? { optedOutAt: null, consentSource: null } : { optedOutAt: null, consentSource: { not: null } };
    case "whatsapp":
      return { waStatus: v === "on" ? "ON" : v === "not_found" ? "NOT_FOUND" : null };
    case "consent":
      return { consentSource: v };
    case "added":
      return r.op === "before" ? { createdAt: { lt: days(v) } } : { createdAt: { gte: days(v) } };
    case "active":
      return r.op === "before" ? { OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: days(v) } }] } : { lastInboundAt: { gte: days(v) } };
    case "email":
      return r.op === "empty" ? { email: null } : { email: { not: null } };
    case "user_id":
      return r.op === "empty" ? { externalId: null } : { externalId: { not: null } };
    default:
      return { id: "__never__" };
  }
}

/** The contacts a segment holds (add the workspace yourself). */
export function segmentWhere(s: { match: string; rules: unknown }, now = new Date()): Prisma.WhatsappContactWhereInput {
  const rules = (Array.isArray(s.rules) ? s.rules : []) as Rule[];
  if (!rules.length) return { id: "__never__" };
  const parts = rules.map((r) => ruleWhere(r, now));
  return s.match === "any" ? { OR: parts } : { AND: parts };
}
