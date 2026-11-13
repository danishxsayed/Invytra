import { aiFromEnv, readProfileContext, refundAiCredits, spendAiCredits, type AiLineWriter } from "@invytra/db";
import { AI_COSTS, DEFAULT_AI_SETTINGS, aiLineMaxChars, campaignSettingsSchema } from "@invytra/shared";
import type { UnipileCtx } from "./work.js";

/** No AI line and no fallback for this person: the step is skipped, nothing generic is sent. */
export const NO_AI_LINE = "NO_AI_LINE";
/** The workspace is out of AI credits and there's no fallback line: send without the AI line. */
export const NO_CREDITS = "";

type Ctx = UnipileCtx & { ai?: AiLineWriter | null };

async function leadFor(ctx: Ctx, campaignLeadId?: string | null) {
  return campaignLeadId
    ? ctx.prisma.campaignLead.findUnique({ where: { id: campaignLeadId }, select: { id: true, workspaceId: true, aiLine: true, campaign: { select: { settings: true } } } })
    : null;
}

/** One personalized note/line's worth of AI credits (null = the workspace has none left). */
const charge = (ctx: Ctx, lead: { id: string; workspaceId: string }) => spendAiCredits(ctx.prisma, lead.workspaceId, AI_COSTS.NOTE, "NOTE", null, { ref: lead.id });

/**
 * The {aiLine} for a note, message or comment about to go out: the one already written for
 * this campaign lead, or a new one from their profile and posts (saved on the lead, 1 AI
 * credit), or the campaign's fallback line. Returns null when there's nothing to send (skip
 * the person), or NO_CREDITS ("") when the workspace is out of AI credits and has no fallback.
 */
export async function aiLineFor(ctx: Ctx, opts: { campaignLeadId?: string | null; providerId: string; template: string; limit: number; fallback?: string }): Promise<string | null> {
  const lead = await leadFor(ctx, opts.campaignLeadId);
  if (lead?.aiLine) return lead.aiLine;
  const settings = (lead && campaignSettingsSchema.safeParse(lead.campaign.settings).data?.ai) || DEFAULT_AI_SETTINGS;
  const fallback = (settings.fallback || opts.fallback || "").trim();
  const save = async (line: string, signal: string) => {
    if (lead) await ctx.prisma.campaignLead.update({ where: { id: lead.id }, data: { aiLine: line, aiSignal: signal, aiLineAt: new Date() } });
    return line;
  };

  const writer = ctx.ai === undefined ? aiFromEnv() : ctx.ai;
  if (writer && settings.offer) {
    const spent = lead ? await charge(ctx, lead) : null;
    if (lead && !spent) return fallback ? save(fallback, "fallback") : NO_CREDITS;
    try {
      const profile = await readProfileContext(ctx.client, ctx.accountId, opts.providerId);
      const r = await writer.write(profile, settings, aiLineMaxChars(opts.template, opts.limit));
      if (r.line) return save(r.line, r.signal ?? "role");
      if (spent && lead) await refundAiCredits(ctx.prisma, lead.workspaceId, spent);
    } catch (e) {
      if (spent && lead) await refundAiCredits(ctx.prisma, lead.workspaceId, spent);
      // AI or profile unavailable right now: the fallback line if there is one, otherwise try later.
      if (!fallback) throw e;
    }
  }
  return fallback ? save(fallback, "fallback") : null;
}

/**
 * A whole note or message written by AI for this person (the step's "AI writes this" switch),
 * using the step's text as the guide. 1 AI credit. Null when AI isn't available, the
 * workspace is out of credits or the answer didn't pass the checks: the step's own text goes
 * out instead.
 */
export async function aiWriteFor(ctx: Ctx, opts: { campaignLeadId?: string | null; providerId: string; guide: string; kind: "note" | "message"; maxChars: number }): Promise<string | null> {
  const lead = await leadFor(ctx, opts.campaignLeadId);
  const settings = (lead && campaignSettingsSchema.safeParse(lead.campaign.settings).data?.ai) || DEFAULT_AI_SETTINGS;
  const writer = ctx.ai === undefined ? aiFromEnv() : ctx.ai;
  if (!writer || !settings.offer || !lead) return null;
  const spent = await charge(ctx, lead);
  if (!spent) return null;
  try {
    const profile = await readProfileContext(ctx.client, ctx.accountId, opts.providerId);
    const text = (await writer.writeMessage(profile, settings, { kind: opts.kind, guide: opts.guide, maxChars: opts.maxChars }))?.trim();
    // Never send leftover placeholders or anything over the limit.
    if (text && text.length <= opts.maxChars && !/[{}]/.test(text)) return text;
  } catch {
    // AI or profile unavailable right now: the step's own text goes out.
  }
  await refundAiCredits(ctx.prisma, lead.workspaceId, spent);
  return null;
}
