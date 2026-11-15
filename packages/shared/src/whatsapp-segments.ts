import { z } from "zod";

/*
 * WhatsApp segments: saved rules over contacts ("tag has VIP" and "location contains Mumbai").
 * Contacts join and leave as they match. The rules are turned into a database filter in
 * @invytra/db (segmentWhere); campaigns can target a segment.
 */

export const SEGMENT_COLORS = { green: "#22c55e", blue: "#3b82f6", orange: "#f97316", red: "#ef4444", purple: "#8b5cf6" } as const;
export type SegmentColor = keyof typeof SEGMENT_COLORS;

/** Each rule field, the operators it takes and what kind of value. */
export const SEGMENT_FIELDS = {
  tag: { label: "Tag", ops: { has: "has", not_has: "doesn't have" }, value: "tag" },
  location: { label: "Location", ops: { contains: "contains", not_contains: "doesn't contain" }, value: "text" },
  status: { label: "Status", ops: { is: "is" }, value: { subscribed: "Subscribed", not_opted_in: "Not opted in", opted_out: "Opted out" } },
  whatsapp: { label: "WhatsApp", ops: { is: "is" }, value: { on: "On WhatsApp", not_found: "Not found", unknown: "Not checked yet" } },
  consent: { label: "Consent source", ops: { is: "is" }, value: { IMPORT: "Import", MANUAL: "Added by hand", INBOUND: "Messaged first", LINK: "Chat link or QR code" } },
  added: { label: "Added", ops: { within: "in the last", before: "more than" }, value: "days" },
  active: { label: "Last message from them", ops: { within: "in the last", before: "more than" }, value: "days" },
  email: { label: "Email", ops: { set: "is set", empty: "is empty" }, value: null },
  user_id: { label: "User ID", ops: { set: "is set", empty: "is empty" }, value: null },
} as const;
export type SegmentField = keyof typeof SEGMENT_FIELDS;

export interface SegmentRule {
  field: SegmentField;
  op: string;
  value: string;
}
export interface SegmentRules {
  match: "all" | "any";
  rules: SegmentRule[];
}

const ruleSchema = z
  .object({ field: z.enum(Object.keys(SEGMENT_FIELDS) as [SegmentField, ...SegmentField[]]), op: z.string().max(20), value: z.string().max(200).default("") })
  .superRefine((r, ctx) => {
    const f = SEGMENT_FIELDS[r.field];
    if (!(r.op in f.ops)) return ctx.addIssue({ code: "custom", message: `Choose how ${f.label.toLowerCase()} should match.` });
    const v = r.value.trim();
    if (f.value === "tag" && !v) ctx.addIssue({ code: "custom", message: "Choose a tag." });
    if (f.value === "text" && !v) ctx.addIssue({ code: "custom", message: `Type the ${f.label.toLowerCase()}.` });
    if (f.value === "days" && !/^\d{1,4}$/.test(v)) ctx.addIssue({ code: "custom", message: "Type a number of days." });
    if (f.value && typeof f.value === "object" && !(v in f.value)) ctx.addIssue({ code: "custom", message: `Choose a ${f.label.toLowerCase()}.` });
  });

export const segmentSchema = z.object({
  name: z.string().trim().min(1, "Name the segment.").max(80),
  color: z.enum(Object.keys(SEGMENT_COLORS) as [SegmentColor, ...SegmentColor[]]).default("green"),
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(ruleSchema).min(1, "Add at least one rule.").max(20),
});
export type SegmentInput = z.infer<typeof segmentSchema>;

/** A sensible empty rule for a field. */
export function newRule(field: SegmentField = "tag", tags: string[] = []): SegmentRule {
  const f = SEGMENT_FIELDS[field];
  const op = Object.keys(f.ops)[0]!;
  const value = f.value === "tag" ? (tags[0] ?? "") : f.value === "days" ? "30" : f.value && typeof f.value === "object" ? Object.keys(f.value)[0]! : "";
  return { field, op, value };
}

/** "Tag has VIP and Location contains Mumbai", for lists. */
export function describeSegment(s: SegmentRules): string {
  return s.rules
    .map((r) => {
      const f = SEGMENT_FIELDS[r.field];
      const op = (f.ops as Record<string, string>)[r.op] ?? r.op;
      const v = f.value && typeof f.value === "object" ? (f.value as Record<string, string>)[r.value] : f.value === "days" ? `${r.value} days` : r.value;
      return [f.label, op, v].filter(Boolean).join(" ");
    })
    .join(s.match === "all" ? " and " : " or ");
}

/** A tag's color, the same everywhere (tags have no color of their own). */
export function tagColor(tag: string): string {
  const palette = ["#22c55e", "#3b82f6", "#f97316", "#8b5cf6", "#ef4444", "#eab308", "#14b8a6", "#ec4899"];
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

const ACRONYMS = new Set(["vip", "b2b", "b2c", "crm", "nri", "emi", "sms", "otp", "uae", "usa", "uk", "ngo", "ceo", "hr", "it"]);

/** How a tag reads: "abandoned-cart" → "Abandoned cart", "vip" → "VIP". */
export function tagLabel(tag: string): string {
  const t = tag
    .split("-")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
