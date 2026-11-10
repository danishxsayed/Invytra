import { INVY_DEFAULT_COUNT, INVY_NEEDS, invyCriteriaSchema, type InvyCriteria, type InvyReason } from "@invytra/shared";

/*
 * Ask Invy's AI (OpenAI): turns the conversation into search criteria, and writes the summary
 * and a short "why" and "opportunity" per business from the evidence it's given, nothing else.
 */

export class InvyAiError extends Error {}

export type ChatTurn = { role: "user" | "invy"; text: string };

export interface InvyBrain {
  /** Criteria for the conversation so far (a follow-up refines the previous criteria). */
  understand(turns: ChatTurn[], previous: InvyCriteria | null): Promise<{ criteria: InvyCriteria; reply: string } | { question: string }>;
  /** A summary and, per business, why it fits and what could be offered. */
  explain(
    criteria: InvyCriteria,
    businesses: { id: string; name: string; category: string | null; rating: number | null; reviews: number | null; reasons: InvyReason[] }[],
    stats: { checked: number; matched: number; wanted: number },
  ): Promise<{ summary: string; items: Record<string, { why: string; opportunity: string }> }>;
}

type Chat = { role: "system" | "user"; content: string };

export class OpenAiInvy implements InvyBrain {
  constructor(
    private readonly key: string,
    private readonly model = "gpt-4o-mini",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async json(messages: Chat[], maxTokens: number): Promise<unknown> {
    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, temperature: 0.2, max_tokens: maxTokens, response_format: { type: "json_object" }, messages }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new InvyAiError(`The AI didn't answer (${res.status}${body?.error?.message ? `: ${body.error.message.slice(0, 120)}` : ""}).`);
    try {
      return JSON.parse(body?.choices?.[0]?.message?.content ?? "");
    } catch {
      throw new InvyAiError("The AI's answer couldn't be read. Please try again.");
    }
  }

  async understand(turns: ChatTurn[], previous: InvyCriteria | null) {
    const system = [
      "You turn a request to find local businesses into search criteria for Google Maps.",
      "Return JSON: {\"criteria\": {...}, \"reply\": string} or, only when the request has no business type or no place, {\"question\": string}.",
      "criteria fields:",
      "- category: the kind of business, plural, lower case (\"restaurants\", \"dental clinics\", \"IT companies\").",
      "- location: the city/area as given, with country when clear (\"Bangalore, India\").",
      `- count: how many they want (default ${INVY_DEFAULT_COUNT}, at most 100).`,
      "- website: \"none\" if they want businesses without a website (or only social pages), \"has\" if they need one to exist (e.g. outdated website), else \"any\".",
      `- needs: any of ${JSON.stringify(INVY_NEEDS)} that the request implies (outdated_site: old-looking website; no_booking: no online booking/appointments; no_ordering: no online ordering; not_mobile: not mobile friendly; poor_presence: weak online presence; few_reviews: few reviews). Empty if none.`,
      "- minRating: a minimum Google rating if asked, else null.",
      "- queries: 1 to 6 Google Maps search phrases. The first is \"<category> in <location>\". When count is above 20, add phrases for well-known neighbourhoods or areas of that place so more businesses can be found (e.g. \"restaurants in Indiranagar, Bangalore\").",
      "- offer: what the user could sell them, if it's clear (\"website development\", \"custom software\"), else null.",
      "For a follow-up, change the previous criteria only as asked (\"10 more\" raises count by 10; \"only in Koramangala\" narrows location and queries).",
      "reply: one short sentence saying what you'll look for, in plain words. No promises about results.",
      "Never answer anything unrelated to finding businesses; ask a question instead.",
    ].join("\n");
    const out = (await this.json(
      [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ previous_criteria: previous, conversation: turns.slice(-8) }) },
      ],
      600,
    )) as { criteria?: unknown; reply?: unknown; question?: unknown };
    if (typeof out.question === "string" && !out.criteria) return { question: out.question.slice(0, 300) };
    const c = invyCriteriaSchema.safeParse(out.criteria);
    if (!c.success) return { question: "I couldn't work out the business type and the place. Try e.g. “Find 20 dental clinics in Mumbai without online booking”." };
    return { criteria: c.data, reply: typeof out.reply === "string" ? out.reply.slice(0, 300) : "" };
  }

  async explain(criteria: InvyCriteria, businesses: Parameters<InvyBrain["explain"]>[1], stats: Parameters<InvyBrain["explain"]>[2]) {
    const system = [
      "You explain business prospects found for a user, using ONLY the facts given for each business. Never invent details (no owners, revenue, emails, history).",
      "Return JSON: {\"summary\": string, \"items\": {\"<id>\": {\"why\": string, \"opportunity\": string}}}.",
      "summary: 2-3 plain sentences: how many were found of how many wanted, what was checked (Google listings, and their websites when they have one), and that claims come from those checks. If fewer were found than wanted, say so plainly.",
      "why: one sentence on why this business fits the request, based on its reasons. Careful wording: say \"no website on its Google listing\", not \"has no website\".",
      "opportunity: a short phrase of what could be offered to them (\"Website development\", \"Online booking system\").",
    ].join("\n");
    const out = (await this.json(
      [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ request: criteria, stats, businesses: businesses.map((b) => ({ ...b, reasons: b.reasons.map((r) => r.text) })) }) },
      ],
      Math.min(4000, 250 + businesses.length * 70),
    )) as { summary?: unknown; items?: Record<string, { why?: unknown; opportunity?: unknown }> };
    const items: Record<string, { why: string; opportunity: string }> = {};
    for (const b of businesses) {
      const it = out.items?.[b.id];
      if (it && typeof it.why === "string") items[b.id] = { why: it.why.slice(0, 300), opportunity: typeof it.opportunity === "string" ? it.opportunity.slice(0, 80) : "" };
    }
    return { summary: typeof out.summary === "string" ? out.summary.slice(0, 800) : "", items };
  }
}

export function invyBrainFromEnv(env: NodeJS.ProcessEnv = process.env): InvyBrain | null {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? new OpenAiInvy(key, env.OPENAI_MODEL?.trim() || "gpt-4o-mini") : null;
}
