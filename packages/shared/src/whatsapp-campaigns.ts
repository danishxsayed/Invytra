import { readMetaComponents } from "./whatsapp.js";

/*
 * WhatsApp campaigns: what a template needs filled per person ({{1}} … in the header, body and
 * a link button), where each value comes from (a contact field, a custom variable, or fixed
 * text, with a fallback), and the message Meta is sent for one contact. Shared by the web
 * builder (preview, checks) and the worker (sending).
 */

export const WA_FIELDS = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  company: "Company",
  email: "Email",
  phone: "WhatsApp number",
} as const;
export type WaField = keyof typeof WA_FIELDS;

export type WaVarSource = { kind: "field"; field: WaField; fallback: string } | { kind: "custom"; key: string; fallback: string } | { kind: "text"; value: string };

/** One slot to fill: "header" (its {{1}}), "body:N", or "button:I" (a link button's {{1}}, I = button index). */
export type WaSlot = `header` | `body:${number}` | `button:${number}`;

export interface WaTemplateNeeds {
  slots: { slot: WaSlot; label: string }[];
  /** The header is an image/video/document: each send needs its link. */
  media: "IMAGE" | "VIDEO" | "DOCUMENT" | null;
}

const vars = (t: string) => [...new Set([...t.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

/** What a template needs filled for each person. */
export function templateNeeds(components: unknown): WaTemplateNeeds {
  const list = Array.isArray(components) ? (components as Record<string, unknown>[]) : [];
  const v = readMetaComponents(components);
  const slots: WaTemplateNeeds["slots"] = [];
  if (v.header.type === "TEXT" && vars(v.header.text).length) slots.push({ slot: "header", label: "Header {{1}}" });
  for (const n of vars(v.body)) slots.push({ slot: `body:${n}`, label: `{{${n}}}` });
  const buttons = (list.find((c) => String(c.type).toUpperCase() === "BUTTONS")?.buttons as Record<string, unknown>[] | undefined) ?? [];
  buttons.forEach((b, i) => {
    if (String(b.type).toUpperCase() === "URL" && vars(String(b.url ?? "")).length) slots.push({ slot: `button:${i}`, label: `Link of “${String(b.text ?? "button")}”` });
  });
  const media = v.header.type === "IMAGE" || v.header.type === "VIDEO" || v.header.type === "DOCUMENT" ? v.header.type : null;
  return { slots, media };
}

export interface WaContactValues {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  profileName?: string | null;
  company: string | null;
  email: string | null;
  vars: unknown;
}

/** A slot's value for one contact ("" when nothing fits and there's no fallback). */
export function resolveSource(src: WaVarSource | undefined, c: WaContactValues): string {
  if (!src) return "";
  if (src.kind === "text") return src.value.trim();
  let v = "";
  if (src.kind === "custom") v = String(((c.vars ?? {}) as Record<string, unknown>)[src.key] ?? "");
  else
    v =
      src.field === "first_name"
        ? (c.firstName ?? c.profileName?.split(/\s+/)[0] ?? "")
        : src.field === "last_name"
          ? (c.lastName ?? "")
          : src.field === "full_name"
            ? [c.firstName, c.lastName].filter(Boolean).join(" ") || (c.profileName ?? "")
            : src.field === "company"
              ? (c.company ?? "")
              : src.field === "email"
                ? (c.email ?? "")
                : `+${c.phone}`;
  return (v.trim() || src.fallback.trim()).replace(/\s+/g, " ").slice(0, 900);
}

/** Problems with a campaign's variable settings (empty = fine). */
export function checkSources(needs: WaTemplateNeeds, map: Partial<Record<WaSlot, WaVarSource>>, mediaUrl: string): string[] {
  const errs: string[] = [];
  for (const { slot, label } of needs.slots) {
    const s = map[slot];
    if (!s) errs.push(`Choose what goes into ${label}.`);
    else if (s.kind === "text" && !s.value.trim()) errs.push(`Write the text for ${label}.`);
    else if (s.kind !== "text" && !s.fallback.trim()) errs.push(`Add a fallback for ${label}, for people without it (WhatsApp can't send an empty value).`);
  }
  if (needs.media && !/^https:\/\/\S+$/i.test(mediaUrl.trim())) errs.push(`Add a public https:// link to the ${needs.media.toLowerCase()} for the header.`);
  return errs;
}

/** The `components` of a template message for one contact (POST /{phone}/messages). */
export function sendComponents(needs: WaTemplateNeeds, map: Partial<Record<WaSlot, WaVarSource>>, c: WaContactValues, mediaUrl: string) {
  const out: Record<string, unknown>[] = [];
  const text = (slot: WaSlot) => ({ type: "text", text: resolveSource(map[slot], c) || "-" });
  if (needs.media) out.push({ type: "header", parameters: [{ type: needs.media.toLowerCase(), [needs.media.toLowerCase()]: { link: mediaUrl.trim() } }] });
  else if (needs.slots.some((s) => s.slot === "header")) out.push({ type: "header", parameters: [text("header")] });
  const body = needs.slots.filter((s) => s.slot.startsWith("body:")).map((s) => text(s.slot));
  if (body.length) out.push({ type: "body", parameters: body });
  for (const s of needs.slots.filter((x) => x.slot.startsWith("button:")))
    out.push({ type: "button", sub_type: "url", index: String(Number(s.slot.split(":")[1])), parameters: [text(s.slot)] });
  return out;
}

/** The body as this contact will read it. */
export function previewBody(body: string, map: Partial<Record<WaSlot, WaVarSource>>, c: WaContactValues): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => resolveSource(map[`body:${Number(n)}`], c) || m);
}

/* ---------- Statuses ---------- */

export const WA_CAMPAIGN_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "stone" | "sky" }> = {
  SCHEDULED: { label: "Scheduled", tone: "sky" },
  SENDING: { label: "Sending", tone: "green" },
  PAUSED: { label: "Paused", tone: "amber" },
  DONE: { label: "Finished", tone: "stone" },
  CANCELLED: { label: "Cancelled", tone: "stone" },
};

/** Meta's send errors, in words a customer can act on. */
export function waSendError(code: number | undefined, fallback: string): string {
  switch (code) {
    case 131026:
      return "Not on WhatsApp, or can't receive this message";
    case 131047:
      return "More than 24 hours since their last reply: only a template can be sent";
    case 131049:
      return "Meta held it back to protect people from too many marketing messages";
    case 131050:
      return "They stopped marketing messages from businesses";
    case 131048:
    case 131056:
      return "Too many messages to this number: try later";
    case 132000:
      return "The template's variables don't match";
    case 132001:
      return "The template doesn't exist in this language, or isn't approved";
    case 132015:
    case 132016:
      return "The template is paused or disabled by Meta";
    case 131042:
      return "Payment problem on the WhatsApp account";
    case 130472:
      return "Held back by Meta (number part of an experiment)";
    case 131053:
      return "The header file couldn't be downloaded";
    default:
      return fallback.slice(0, 200);
  }
}
