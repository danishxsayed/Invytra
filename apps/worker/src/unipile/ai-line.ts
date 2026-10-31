import { aiFromEnv, readProfileContext, type AiLineWriter } from "@invytra/db";
import { DEFAULT_AI_SETTINGS, aiLineMaxChars, campaignSettingsSchema } from "@invytra/shared";
import type { UnipileCtx } from "./work.js";

/** No AI line and no fallback for this person: the step is skipped, nothing generic is sent. */
export const NO_AI_LINE = "NO_AI_LINE";

/**
 * The {aiLine} for a note, message or comment about to go out: the one already written for
 * this campaign lead, or a new one from their profile and posts (saved on the lead), or the
 * campaign's fallback line. Returns null when there's nothing to send (skip the person).
 */
export async function aiLineFor(
  ctx: UnipileCtx & { ai?: AiLineWriter | null },
  opts: { campaignLeadId?: string | null; providerId: string; template: string; limit: number; fallback?: string },
): Promise<string | null> {
  const lead = opts.campaignLeadId
    ? await ctx.prisma.campaignLead.findUnique({ where: { id: opts.campaignLeadId }, select: { id: true, aiLine: true, campaign: { select: { settings: true } } } })
    : null;
  if (lead?.aiLine) return lead.aiLine;
  const settings = (lead && campaignSettingsSchema.safeParse(lead.campaign.settings).data?.ai) || DEFAULT_AI_SETTINGS;
  const fallback = (settings.fallback || opts.fallback || "").trim();
  const save = async (line: string, signal: string) => {
    if (lead) await ctx.prisma.campaignLead.update({ where: { id: lead.id }, data: { aiLine: line, aiSignal: signal, aiLineAt: new Date() } });
    return line;
  };

  const writer = ctx.ai === undefined ? aiFromEnv() : ctx.ai;
  if (writer && settings.offer) {
    try {
      const profile = await readProfileContext(ctx.client, ctx.accountId, opts.providerId);
      const r = await writer.write(profile, settings, aiLineMaxChars(opts.template, opts.limit));
      if (r.line) return save(r.line, r.signal ?? "role");
    } catch (e) {
      // AI or profile unavailable right now: the fallback line if there is one, otherwise try later.
      if (!fallback) throw e;
    }
  }
  return fallback ? save(fallback, "fallback") : null;
}
