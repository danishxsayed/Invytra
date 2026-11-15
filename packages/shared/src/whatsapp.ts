import { phoneKey } from "./do-not-contact.js";

/*
 * WhatsApp (official Cloud API): the rules for message templates and numbers, shared by the
 * web app (builder, preview, checks before submitting to Meta) and the worker. Meta's limits
 * are mirrored here so a template is checked before Meta sees it.
 */

export const WA_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type WaCategory = (typeof WA_CATEGORIES)[number];

export const WA_CATEGORY_INFO: Record<WaCategory, { label: string; sub: string }> = {
  MARKETING: { label: "Marketing", sub: "Outreach, offers, launches, follow-ups" },
  UTILITY: { label: "Utility", sub: "Orders, bookings, account updates" },
  AUTHENTICATION: { label: "Authentication", sub: "One-time passcodes only" },
};

/** The kinds of template the builder makes (Meta has more; these are the ones Invytra sends). */
export const WA_TEMPLATE_KINDS = {
  buttons: { label: "Template with buttons", sub: "Quick replies, a website link, a call button or a copy-code button" },
  simple: { label: "Simple template", sub: "A header, the message and a footer, no buttons" },
  otp: { label: "One-time passcode", sub: "A login or verification code with a copy button" },
  pay: { label: "WhatsApp Pay checkout", sub: "Messages people can pay you through", soon: true },
  carousel: { label: "Carousel", sub: "Several product cards people swipe through", soon: true },
} as const;
export type WaTemplateKind = keyof typeof WA_TEMPLATE_KINDS;

/** Media a header can carry, and what the upload accepts. */
export const WA_HEADER_MEDIA = {
  IMAGE: { label: "Image", accept: "image/jpeg,image/png", types: ["image/jpeg", "image/png"], maxMb: 5, hint: "JPG or PNG, up to 5 MB" },
  VIDEO: { label: "Video", accept: "video/mp4", types: ["video/mp4"], maxMb: 10, hint: "MP4, up to 10 MB" },
  DOCUMENT: { label: "Document", accept: "application/pdf", types: ["application/pdf"], maxMb: 10, hint: "PDF, up to 10 MB" },
} as const;
export type WaHeaderMedia = keyof typeof WA_HEADER_MEDIA;

/** Languages offered in the builder (Meta codes). */
export const WA_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "ur", label: "Urdu" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "id", label: "Indonesian" },
  { code: "tr", label: "Turkish" },
] as const;
export const waLanguageLabel = (code: string) => WA_LANGUAGES.find((l) => l.code === code)?.label ?? code;

export type WaTemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "PENDING_DELETION" | "DELETED" | "LIMIT_EXCEEDED" | "DRAFT";

export const WA_STATUS_INFO: Record<string, { label: string; tone: "green" | "amber" | "red" | "stone" }> = {
  APPROVED: { label: "Approved", tone: "green" },
  PENDING: { label: "In review", tone: "amber" },
  IN_APPEAL: { label: "In appeal", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "red" },
  PAUSED: { label: "Paused by Meta", tone: "red" },
  DISABLED: { label: "Disabled by Meta", tone: "red" },
  LIMIT_EXCEEDED: { label: "Limit reached", tone: "red" },
  PENDING_DELETION: { label: "Being deleted", tone: "stone" },
  DELETED: { label: "Deleted", tone: "stone" },
};
export const waStatusInfo = (s: string) => WA_STATUS_INFO[s] ?? { label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "), tone: "stone" as const };

/* ---------- The builder's template ---------- */

export type WaButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  /** Marketing only: copies an offer code (Meta names the button itself). */
  | { type: "COPY_CODE"; text: string; code: string };

export interface WaTemplateDraft {
  name: string;
  language: string;
  category: WaCategory;
  header: { type: "NONE" } | { type: "TEXT"; text: string; example?: string } | { type: WaHeaderMedia; handle?: string; fileName?: string };
  body: string;
  /** One sample per {{n}} in the body, in order (Meta reviews with them). */
  bodyExamples: string[];
  footer: string;
  buttons: WaButton[];
  /** Authentication templates: Meta writes the message; these are its options. */
  otp?: { securityNote: boolean; expiryMinutes: number | null; buttonText: string };
}

export const WA_LIMITS = { name: 512, headerText: 60, body: 1024, footer: 60, buttonText: 25, buttons: 10, urlButtons: 2, phoneButtons: 1, quickReplies: 10 } as const;

/** The {{1}}, {{2}} … numbers in a text, in order of appearance. */
export function waVariables(text: string): number[] {
  return [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
}

/** "Follow-up note" → "follow_up_note" (Meta: lowercase letters, numbers and underscores). */
export function waTemplateName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, WA_LIMITS.name);
}

/** Adds the next variable number to the end of a text. */
export const nextVariable = (text: string) => Math.max(0, ...waVariables(text)) + 1;

/** Everything Meta would reject, found before submitting (empty = fine). */
export function checkTemplate(t: WaTemplateDraft): string[] {
  const errs: string[] = [];
  if (!t.name) errs.push("Give the template a name.");
  else if (!/^[a-z0-9_]+$/.test(t.name)) errs.push("The name can only use lowercase letters, numbers and underscores.");
  if (!WA_LANGUAGES.some((l) => l.code === t.language)) errs.push("Choose a language.");
  if (!(WA_CATEGORIES as readonly string[]).includes(t.category)) errs.push("Choose a category.");
  if (t.category === "AUTHENTICATION") {
    const o = t.otp ?? { securityNote: true, expiryMinutes: 10, buttonText: "Copy code" };
    if (o.expiryMinutes !== null && (!Number.isInteger(o.expiryMinutes) || o.expiryMinutes < 1 || o.expiryMinutes > 90)) errs.push("The code can expire after 1 to 90 minutes.");
    if (!o.buttonText.trim() || o.buttonText.length > WA_LIMITS.buttonText) errs.push(`Write the copy button's text (up to ${WA_LIMITS.buttonText} characters).`);
    return errs;
  }

  if (t.header.type === "TEXT") {
    const v = waVariables(t.header.text);
    if (!t.header.text.trim()) errs.push("Write the header, or choose no header.");
    if (t.header.text.length > WA_LIMITS.headerText) errs.push(`The header can be up to ${WA_LIMITS.headerText} characters.`);
    if (v.length > 1 || (v.length === 1 && v[0] !== 1)) errs.push("The header can have one variable: {{1}}.");
    if (v.length === 1 && !t.header.example?.trim()) errs.push("Add a sample value for the header's {{1}}.");
    if (/[\n*_~]|\p{Extended_Pictographic}/u.test(t.header.text)) errs.push("The header can't have new lines, formatting or emojis.");
  }
  if (t.header.type in WA_HEADER_MEDIA && !("handle" in t.header && t.header.handle)) errs.push(`Upload the header ${WA_HEADER_MEDIA[t.header.type as WaHeaderMedia].label.toLowerCase()}.`);

  const body = t.body.trim();
  if (!body) errs.push("Write the message.");
  if (t.body.length > WA_LIMITS.body) errs.push(`The message can be up to ${WA_LIMITS.body} characters.`);
  const vars = waVariables(t.body);
  const distinct = [...new Set(vars)].sort((a, b) => a - b);
  if (distinct.some((n, i) => n !== i + 1)) errs.push("Number the variables in order: {{1}}, {{2}}, {{3}} …");
  if (body && (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(body))) errs.push("The message can't start or end with a variable: add a word before or after it.");
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(body)) errs.push("Put some words between two variables.");
  if (distinct.length && body.replace(/\{\{\s*\d+\s*\}\}/g, "").trim().split(/\s+/).length < distinct.length * 2 + 1)
    errs.push("Too many variables for such a short message: Meta rejects templates that are mostly variables.");
  distinct.forEach((n) => {
    if (!t.bodyExamples[n - 1]?.trim()) errs.push(`Add a sample value for {{${n}}}.`);
  });

  if (t.footer.length > WA_LIMITS.footer) errs.push(`The footer can be up to ${WA_LIMITS.footer} characters.`);
  if (waVariables(t.footer).length) errs.push("The footer can't have variables.");

  const count = (type: WaButton["type"]) => t.buttons.filter((b) => b.type === type).length;
  if (t.buttons.length > WA_LIMITS.buttons) errs.push(`Up to ${WA_LIMITS.buttons} buttons.`);
  if (count("URL") > WA_LIMITS.urlButtons) errs.push(`Up to ${WA_LIMITS.urlButtons} website buttons.`);
  if (count("PHONE_NUMBER") > WA_LIMITS.phoneButtons) errs.push("Up to one call button.");
  if (count("COPY_CODE") > 1) errs.push("Up to one copy-code button.");
  if (count("COPY_CODE") && t.category !== "MARKETING") errs.push("A copy-code button is only for Marketing templates.");
  t.buttons.forEach((b, i) => {
    const n = `Button ${i + 1}`;
    if (!b.text.trim() && b.type !== "COPY_CODE") errs.push(`${n}: write its text.`);
    if (b.text.length > WA_LIMITS.buttonText) errs.push(`${n}: up to ${WA_LIMITS.buttonText} characters.`);
    if (b.type === "URL") {
      if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(b.url.replace(/\{\{1\}\}$/, "x"))) errs.push(`${n}: use a full https:// link.`);
      const uv = waVariables(b.url);
      if (uv.length > 1 || (uv.length === 1 && !b.url.endsWith("{{1}}"))) errs.push(`${n}: a link can have one variable, {{1}}, at the very end.`);
      if (uv.length === 1 && !b.example?.trim()) errs.push(`${n}: add a sample full link for the variable.`);
    }
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{7,15}$/.test(b.phone.replace(/[\s-]/g, ""))) errs.push(`${n}: use the number with its country code.`);
    if (b.type === "COPY_CODE" && !/^[A-Za-z0-9_-]{1,15}$/.test(b.code.trim())) errs.push(`${n}: the offer code can be up to 15 letters or numbers.`);
  });
  // Meta: quick replies and the other buttons must be grouped, not mixed.
  const kinds = t.buttons.map((b) => (b.type === "QUICK_REPLY" ? "q" : "c")).join("");
  if (/qc+q|cq+c/.test(kinds)) errs.push("Keep quick replies together, before or after the link and call buttons.");
  return errs;
}

/** The template in Meta's shape (the body of POST /{waba}/message_templates). */
export function toMetaTemplate(t: WaTemplateDraft) {
  const components: Record<string, unknown>[] = [];
  if (t.category === "AUTHENTICATION") {
    const o = t.otp ?? { securityNote: true, expiryMinutes: 10, buttonText: "Copy code" };
    components.push({ type: "BODY", add_security_recommendation: o.securityNote });
    if (o.expiryMinutes) components.push({ type: "FOOTER", code_expiration_minutes: o.expiryMinutes });
    components.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: o.buttonText.trim() }] });
    return { name: t.name, language: t.language, category: t.category, components };
  }
  if (t.header.type === "TEXT")
    components.push({ type: "HEADER", format: "TEXT", text: t.header.text, ...(waVariables(t.header.text).length && { example: { header_text: [t.header.example ?? ""] } }) });
  if (t.header.type in WA_HEADER_MEDIA) components.push({ type: "HEADER", format: t.header.type, example: { header_handle: ["handle" in t.header ? (t.header.handle ?? "") : ""] } });
  const n = new Set(waVariables(t.body)).size;
  components.push({ type: "BODY", text: t.body.trim(), ...(n && { example: { body_text: [t.bodyExamples.slice(0, n)] } }) });
  if (t.footer.trim()) components.push({ type: "FOOTER", text: t.footer.trim() });
  if (t.buttons.length)
    components.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) =>
        b.type === "QUICK_REPLY"
          ? { type: "QUICK_REPLY", text: b.text.trim() }
          : b.type === "URL"
            ? { type: "URL", text: b.text.trim(), url: b.url.trim(), ...(waVariables(b.url).length && { example: [b.example?.trim() ?? ""] }) }
            : b.type === "COPY_CODE"
              ? { type: "COPY_CODE", example: b.code.trim() }
              : { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.replace(/[\s-]/g, "") },
      ),
    });
  return { name: t.name, language: t.language, category: t.category, components };
}

/** A template from Meta, read back for the list and the preview. */
export interface WaTemplateView {
  header: { type: "NONE" } | { type: "TEXT"; text: string } | { type: "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" };
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
}

export function readMetaComponents(components: unknown): WaTemplateView {
  const list = Array.isArray(components) ? (components as Record<string, unknown>[]) : [];
  const find = (type: string) => list.find((c) => String(c.type).toUpperCase() === type);
  const h = find("HEADER");
  const format = String(h?.format ?? "").toUpperCase();
  const header: WaTemplateView["header"] = !h ? { type: "NONE" } : format === "TEXT" ? { type: "TEXT", text: String(h.text ?? "") } : { type: (["IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(format) ? format : "IMAGE") as "IMAGE" };
  const buttons = Array.isArray(find("BUTTONS")?.buttons)
    ? (find("BUTTONS")!.buttons as Record<string, unknown>[]).map((b) => {
        const type = String(b.type ?? "").toUpperCase();
        return { type, text: String(b.text ?? "") || (type === "COPY_CODE" ? "Copy offer code" : type === "OTP" ? "Copy code" : "") };
      })
    : [];
  const body = find("BODY");
  const footer = find("FOOTER");
  // Authentication templates: Meta writes the words; show what people will read.
  const authBody = body && body.text === undefined && "add_security_recommendation" in body;
  return {
    header,
    body: authBody ? `{{1}} is your verification code.${body.add_security_recommendation ? " For your security, do not share this code." : ""}` : String(body?.text ?? ""),
    footer: footer && footer.text === undefined && footer.code_expiration_minutes ? `This code expires in ${footer.code_expiration_minutes} minutes.` : String(footer?.text ?? ""),
    buttons,
  };
}

/** Fills {{n}} with values (missing ones stay as {{n}}). */
export const fillVariables = (text: string, values: readonly string[]) => text.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => values[Number(n) - 1] || m);

/* ---------- Numbers ---------- */

/** Meta's quality rating of a number. */
export const WA_QUALITY: Record<string, { label: string; tone: "green" | "amber" | "red" | "stone"; note: string }> = {
  GREEN: { label: "High", tone: "green", note: "People like your messages. Keep it that way." },
  YELLOW: { label: "Medium", tone: "amber", note: "Some people blocked or reported you lately. Send to fewer, warmer contacts." },
  RED: { label: "Low", tone: "red", note: "Many blocks or reports. Meta may lower your limit or restrict the number: pause campaigns and review your templates." },
  UNKNOWN: { label: "Not rated yet", tone: "stone", note: "Meta rates the number once it has sent messages." },
};
export const waQuality = (q: string | null | undefined) => WA_QUALITY[(q ?? "UNKNOWN").toUpperCase()] ?? WA_QUALITY.UNKNOWN!;

/** "TIER_1K" → 1000 new people a day (null = unlimited / unknown). */
export function waDailyLimit(tier: string | null | undefined): number | null {
  const m = /TIER_(\d+)(K)?/i.exec(tier ?? "");
  if (/UNLIMITED/i.test(tier ?? "")) return null;
  if (!m) return tier === "TIER_50" ? 50 : null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}
export function waLimitLabel(tier: string | null | undefined): string {
  if (/UNLIMITED/i.test(tier ?? "")) return "Unlimited";
  const n = waDailyLimit(tier);
  return n === null ? "Not set yet" : `${n >= 1000 ? `${n / 1000}K` : n} people / 24h`;
}

/** Digits only, with the country code ("+971 50 123 4567" → "971501234567"); null when it can't be a phone number. */
export const waPhone = (raw: string): string | null => phoneKey(raw);
