import type { CampaignSettings, CampaignStep } from "./campaign.js";

/**
 * Who a campaign is for ("Configure" step): connection levels and Premium.
 * The facts come from search imports and from every profile the worker opens;
 * anyone known not to fit is skipped before they are contacted.
 */

/** 1 = 1st-degree connection, 2 = 2nd, 3 = 3rd and beyond (incl. out of network). */
export type Degree = 1 | 2 | 3;
export const DEGREES: readonly Degree[] = [1, 2, 3];
export const DEGREE_LABEL: Record<Degree, string> = { 1: "1st", 2: "2nd", 3: "3rd+" };

export interface AudienceFacts {
  degree?: number | null;
  premium?: boolean | null;
}

export type Audience = Pick<CampaignSettings, "degrees" | "premiumOnly">;

/** Reason prefix for people skipped by the campaign's audience settings. */
export const AUDIENCE_SKIP = "AUDIENCE";

/**
 * "· 2nd", "Jane Doe • 3rd+", "2nd degree connection", or just "1st" → the degree.
 * Only these shapes count, so a headline like "1st Choice Flooring" is not read as one.
 */
export function parseDegree(text: string | null | undefined): Degree | null {
  const t = (text ?? "").trim();
  const m =
    /^(1st|2nd|3rd)\+?$/i.exec(t) ?? /[•·]\s*(1st|2nd|3rd)\+?(?![\p{L}\d])/iu.exec(t) ?? /\b(1st|2nd|3rd)\+?\s+degree\b/i.exec(t);
  if (!m) return null;
  const d = m[1]!.toLowerCase();
  return d === "1st" ? 1 : d === "2nd" ? 2 : 3;
}

/** Whether the setting actually filters anyone. */
export function audienceIsFiltered(a: Audience): boolean {
  return a.premiumOnly || DEGREES.some((d) => !a.degrees.includes(d));
}

/**
 * Why this person is outside the audience ("AUDIENCE:DEGREE_3", "AUDIENCE:NOT_PREMIUM"),
 * or null if they fit or we don't know yet.
 */
export function audienceSkip(a: Audience, facts: AudienceFacts): string | null {
  const d = facts.degree;
  if (d === 1 || d === 2 || d === 3) {
    if (!a.degrees.includes(d)) return `${AUDIENCE_SKIP}:DEGREE_${d}`;
  }
  if (a.premiumOnly && facts.premium === false) return `${AUDIENCE_SKIP}:NOT_PREMIUM`;
  return null;
}

/** Problems with the audience setting for this sequence (shown in the builder, checked on save). */
export function audienceProblems(steps: CampaignStep[], a: Audience): string[] {
  const p: string[] = [];
  if (a.degrees.length === 0) p.push("Pick at least one connection level.");
  const invites = steps.some((s) => s.type === "INVITE");
  const messages = steps.some((s) => s.type === "MESSAGE");
  const events = steps.some((s) => s.type === "EVENT");
  if (!invites && (messages || events) && a.degrees.length > 0 && !a.degrees.includes(1)) {
    p.push("Without a connection request you can only message (or invite to events) 1st-degree connections. Include 1st, or add a connection request.");
  }
  const invite = steps.findIndex((s) => s.type === "INVITE");
  const early = steps.findIndex((s) => s.type === "MESSAGE" || s.type === "EVENT");
  if (invites && early !== -1 && early < invite && !a.degrees.includes(1)) {
    const what = steps[early]!.type === "EVENT" ? "an event invite" : "a message";
    p.push(`Step ${early + 1}: ${what} before the connection request only reaches 1st-degree connections. Move it after the request.`);
  }
  return p;
}

/**
 * Whether a message step makes sense yet: people must be connected first, so the sequence needs
 * an invite, or the campaign must include 1st-degree connections.
 */
export function canAddMessage(steps: CampaignStep[], a: Pick<Audience, "degrees">): boolean {
  return steps.some((s) => s.type === "INVITE") || a.degrees.includes(1);
}

/** A connected LinkedIn account's plan: what the user set, else what was detected (null = unknown). */
export function accountIsPremium(a: { premium?: boolean | null; premiumOverride?: boolean | null }): boolean | null {
  return a.premiumOverride ?? a.premium ?? null;
}
