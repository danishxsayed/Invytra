import type { UnipileClient, UnipileFullProfile, UnipilePost } from "./unipile.js";

/** Kept in step with AI_SIGNALS in @invytra/shared (this package doesn't depend on it). */
const AI_SIGNALS = ["hiring", "post", "role", "headline", "about", "education", "skills"] as const;
type AiSignal = (typeof AI_SIGNALS)[number];
interface AiSettings {
  offer: string;
  tone: string;
}

/*
 * The AI personalisation line ({aiLine}): one sentence written from the person's LinkedIn
 * profile with OpenAI. Server-side only; the key stays in .env (OPENAI_API_KEY).
 */

/** What the AI gets to read about one person (only what their profile and posts show). */
export interface ProfileContext {
  name: string;
  headline: string;
  about: string;
  location: string;
  experience: { title: string; company: string; start: string; end: string; current: boolean; description: string }[];
  education: { school: string; degree: string }[];
  skills: string[];
  /** Their own recent posts (last 90 days), newest first. */
  posts: { text: string; date: string; daysAgo: number }[];
  /** Post or headline lines that say they're hiring. */
  hiring: string[];
}

const HIRING = /\b(we('| a)?re hiring|now hiring|#hiring|werehiring|is hiring|hiring for|looking for an? |join (our|my) team|open (role|position)s?|job opening|apply (now|here))\b/i;
const POST_DAYS = 90;
const cut = (s: string | undefined | null, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Builds the context from a full Unipile profile and their posts. */
export function profileContext(p: UnipileFullProfile, posts: UnipilePost[], now = new Date()): ProfileContext {
  const recent = posts
    .filter((x) => !x.is_repost && (x.text ?? "").trim())
    .map((x) => {
      const at = x.parsed_datetime ? Date.parse(x.parsed_datetime) : NaN;
      return { text: cut(x.text, 700), date: x.parsed_datetime?.slice(0, 10) ?? "", daysAgo: Number.isFinite(at) ? Math.floor((now.getTime() - at) / 86_400_000) : 999 };
    })
    .filter((x) => x.daysAgo <= POST_DAYS)
    .slice(0, 3);
  const headline = cut(p.headline, 220);
  const hiring = [...(HIRING.test(headline) ? [headline] : []), ...recent.filter((x) => HIRING.test(x.text)).map((x) => cut(x.text, 300))];
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
    headline,
    about: cut(p.summary, 900),
    location: cut(p.location, 80),
    experience: (p.work_experience ?? []).slice(0, 3).map((e) => ({
      title: cut(e.position, 100),
      company: cut(e.company, 100),
      start: e.start ?? "",
      end: e.end ?? "",
      current: !e.end,
      description: cut(e.description, 300),
    })),
    education: (p.education ?? []).slice(0, 2).map((e) => ({ school: cut(e.school, 100), degree: cut([e.degree, e.field_of_study].filter(Boolean).join(", "), 100) })),
    skills: (p.skills ?? []).map((s) => cut(s.name, 40)).filter(Boolean).slice(0, 10),
    posts: recent,
    hiring,
  };
}

/** Reads one person's profile and recent posts through the sender's Unipile account. */
export async function readProfileContext(client: UnipileClient, accountId: string, identifier: string): Promise<ProfileContext> {
  const p = await client.fullProfile(accountId, identifier);
  const posts = await client.userPosts(accountId, p.provider_id, 5).catch(() => []);
  return profileContext(p, posts);
}

export interface AiLineResult {
  /** The line, or null when the profile has nothing specific enough to mention. */
  line: string | null;
  signal: AiSignal | null;
}

/** Phrases that make a line sound automated: such a line is thrown away. */
const CLICHES = /(came across your profile|hope this (message )?finds you|impressive (journey|background|profile)|i was impressed|your (amazing|incredible|inspiring)|reach(ing)? out|i noticed that you|synerg|let'?s connect|would love to connect|as an? (ai|language model)|\{|\})/i;

export class OpenAiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "OpenAiError";
  }
}

export class AiLineWriter {
  constructor(
    private readonly apiKey: string,
    readonly model = "gpt-4o-mini",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** One personalisation line for this person, or { line: null } when nothing specific fits. */
  async write(ctx: ProfileContext, settings: AiSettings, maxChars: number): Promise<AiLineResult> {
    const system = [
      "You write ONE personalisation sentence that opens a LinkedIn connection note or message from the sender to the person described.",
      "Use the strongest real signal, in this order: a hiring signal; a recent post (say what it was about); their current role and company; their headline; their About section; education; skills.",
      "Rules:",
      "- Mention one specific, true detail from the profile data. Never invent or guess anything.",
      "- Write to them directly (\"you\", \"your\"). One sentence, no greeting, no name at the start, no sign-off, no question about meeting.",
      `- At most ${maxChars} characters. Plain text: no emojis, hashtags, quotes or links.`,
      "- No flattery or clichés (\"came across your profile\", \"impressive journey\", \"hope this finds you well\", \"I'd love to connect\").",
      "- Nothing about health, family, religion, politics, age or appearance.",
      "- It may lead naturally toward what the sender offers, but don't pitch or name the product.",
      `- Tone: ${settings.tone}.`,
      "- If nothing in the data is specific enough, return line null.",
      `Reply as JSON: {"line": string|null, "signal": one of ${JSON.stringify(AI_SIGNALS)} or null}.`,
    ].join("\n");
    const user = JSON.stringify({ sender_offers: settings.offer, person: ctx });
    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.6,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new OpenAiError(res.status, `OpenAI ${res.status}: ${body?.error?.message ?? "request failed"}`);
    return cleanAiLine(body?.choices?.[0]?.message?.content ?? "", maxChars);
  }

  /**
   * A whole connection note or message for this person, written from their profile, following
   * the sender's guide text. Null when the model's answer doesn't pass the checks.
   */
  async writeMessage(ctx: ProfileContext, settings: AiSettings, opts: { kind: "note" | "message"; guide: string; maxChars: number }): Promise<string | null> {
    const what = opts.kind === "note" ? "LinkedIn connection request note" : "LinkedIn message to a 1st-degree connection";
    const system = [
      `You write a short ${what} from the sender to the person described, in the sender's voice.`,
      "Use the sender's guide for what to say and how; keep its meaning, call to action and any links exactly.",
      "Make it personal: refer to one specific, true detail from their profile (a hiring signal, a recent post, their role or company, their headline). Never invent anything.",
      "Rules:",
      "- Address them by first name once, naturally. No subject line, no sign-off with a name, no placeholders like {firstName}.",
      `- At most ${opts.maxChars} characters in total. Plain text, at most one emoji, no hashtags.`,
      "- No flattery or clichés (\"came across your profile\", \"impressive journey\", \"hope this finds you well\").",
      "- Nothing about health, family, religion, politics, age or appearance.",
      `- Tone: ${settings.tone}.`,
      'Reply as JSON: {"text": string}.',
    ].join("\n");
    const user = JSON.stringify({ sender_offers: settings.offer, sender_guide: opts.guide || "(none: a short, friendly, relevant note)", person: ctx });
    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new OpenAiError(res.status, `OpenAI ${res.status}: ${body?.error?.message ?? "request failed"}`);
    return cleanAiMessage(body?.choices?.[0]?.message?.content ?? "", opts);
  }
}

/** Checks a whole AI-written note or message: within the limit, no leftover placeholders, no new links. */
export function cleanAiMessage(raw: string, opts: { guide: string; maxChars: number }): string | null {
  let parsed: { text?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.text !== "string") return null;
  const text = parsed.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/^["'“]+|["'”]+$/g, "").trim();
  if (!text || text.length > opts.maxChars) return null;
  if (/[{}]/.test(text) || /as an? (ai|language model)/i.test(text) || /#\w/.test(text)) return null;
  // Links only if the guide had them (and then only those).
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  if (links.some((l) => !opts.guide.includes(l.replace(/[.,!?)]+$/, "")))) return null;
  return text;
}

/** Checks the model's answer: one clean sentence within the limit, or null. */
export function cleanAiLine(raw: string, maxChars: number): AiLineResult {
  let parsed: { line?: unknown; signal?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { line: null, signal: null };
  }
  const signal = AI_SIGNALS.includes(parsed.signal as AiSignal) ? (parsed.signal as AiSignal) : null;
  if (typeof parsed.line !== "string") return { line: null, signal: null };
  const line = parsed.line.replace(/\s+/g, " ").replace(/^["'“]+|["'”]+$/g, "").trim();
  if (!line || line.length > maxChars || CLICHES.test(line) || /https?:\/\/|#\w/.test(line)) return { line: null, signal: null };
  return { line, signal };
}

/** The configured writer, or null when OPENAI_API_KEY isn't set. */
export function aiFromEnv(env: NodeJS.ProcessEnv = process.env): AiLineWriter | null {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? new AiLineWriter(key, env.OPENAI_MODEL?.trim() || "gpt-4o-mini") : null;
}
