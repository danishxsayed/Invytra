import { BUILT_IN_VARS, EMAIL_AI_LENGTHS, unknownVars, type EmailAiRequest, type EmailDraft } from "@invytra/shared";
import { OpenAiError } from "@invytra/db";

/*
 * The AI email writer (OpenAI). It writes cold/outreach emails from a brief, or rewrites one,
 * using only the workspace's variables, never inventing facts. It only drafts: the person
 * picks a draft, can edit it, and saves and launches the campaign themselves.
 */

const SPAMMY = /\b(free!|act now|100% free|guarantee[d]?|risk[- ]free|click here|buy now|limited time|urgent|\$\$\$|winner)\b/i;

const INSTRUCTIONS: Record<EmailAiRequest["action"], string> = {
  generate: "Write a new email from the brief.",
  rewrite: "Rewrite the current email with fresh wording, keeping its meaning, offer and call to action.",
  shorter: "Make the current email clearly shorter (about half), keeping the offer and the call to action.",
  professional: "Make the current email more professional and polished, keeping its meaning.",
  friendly: "Make the current email warmer and more friendly, keeping its meaning.",
  subject: "Keep the body exactly as it is; write better subject lines (short, specific, lower-case style, no clickbait) and preview text.",
  variations: "Write clearly different versions of the current email (different angle or opening each time), keeping the offer and call to action.",
};

export class AiEmailWriter {
  constructor(
    private readonly apiKey: string,
    readonly model = "gpt-4o-mini",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async write(r: EmailAiRequest): Promise<EmailDraft[]> {
    const vars = [...BUILT_IN_VARS, ...r.variables].map((v) => `{{${v}}}`).join(", ");
    const followUp = r.step > 0;
    const system = [
      "You write B2B outreach emails that get replies. Plain text only.",
      "Rules:",
      "- Sound like one person writing to one person. Short paragraphs, simple words, no buzzwords, no exclamation marks.",
      "- Use only facts from the brief or the current email. Never invent numbers, results, clients, testimonials, awards or claims.",
      `- Personalise only with these variables, written exactly like this: ${vars}. Give names a fallback: {{first_name|there}}. Never make up other {{…}} variables.`,
      "- No links, images, attachments, emojis or HTML. No spam words (free!, guarantee, act now, click here, limited time).",
      "- One clear call to action, as a simple question near the end. No sign-off or signature (the mailbox adds the signature).",
      followUp
        ? "- This is a follow-up in the same thread: subject must be an empty string (it replies under the first email). Refer briefly to the earlier email; add one new reason to reply; shorter than the first."
        : "- Subject: 2–7 words, specific, no clickbait, no ALL CAPS, may use {{first_name}} or {{company_name}}.",
      "- Preview text: one short line (max 90 characters) that complements the subject; it is not repeated in the body.",
      r.brief ? `- Tone: ${r.brief.tone}. Length of the body: ${EMAIL_AI_LENGTHS[r.brief.length]}.` : "",
      `Task: ${INSTRUCTIONS[r.action]}`,
      `Reply as JSON: {"emails": [ {"subject": string, "preview": string, "body": string, "cta": string} ]} with exactly ${r.count} email(s); cta = the call-to-action sentence used in the body.`,
    ]
      .filter(Boolean)
      .join("\n");
    const user = JSON.stringify({ brief: r.brief ?? null, current_email: r.current ?? null, previous_email_in_thread: r.previous ?? null });
    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: r.action === "variations" || r.action === "rewrite" ? 0.9 : 0.7,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new OpenAiError(res.status, `OpenAI ${res.status}: ${body?.error?.message ?? "request failed"}`);
    return cleanDrafts(body?.choices?.[0]?.message?.content ?? "", r);
  }
}

/** Checks the model's drafts: right shape, no made-up variables, no links, nothing spammy; follow-ups keep an empty subject. */
export function cleanDrafts(raw: string, r: Pick<EmailAiRequest, "step" | "variables" | "action" | "current">): EmailDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray((parsed as { emails?: unknown })?.emails) ? ((parsed as { emails: unknown[] }).emails as Record<string, unknown>[]) : [];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return list
    .map((e) => ({
      subject: r.step > 0 ? "" : str(e.subject, 200).replace(/^"|"$/g, ""),
      preview: str(e.preview, 150),
      body: r.action === "subject" && r.current ? r.current.body : str(e.body, 5000).replace(/\r\n/g, "\n"),
      cta: str(e.cta, 300),
    }))
    .filter((d) => d.body && (r.step > 0 || d.subject))
    .filter((d) => !/https?:\/\/|www\.|<\/?[a-z]/i.test(d.body + d.subject))
    .filter((d) => !SPAMMY.test(`${d.subject} ${d.body}`))
    .filter((d) => unknownVars([{ subject: d.subject, body: d.body }], r.variables).length === 0);
}

export function aiEmailFromEnv(env: NodeJS.ProcessEnv = process.env): AiEmailWriter | null {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? new AiEmailWriter(key, env.OPENAI_MODEL?.trim() || "gpt-4o-mini") : null;
}
