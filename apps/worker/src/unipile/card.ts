import { refundAiCredits, renderCard, spendAiCredits, type CardFont, type CardStyle } from "@invytra/db";
import { AI_COSTS, CARD_FONTS, CARD_STYLES, monthlyAiCredits } from "@invytra/shared";
import type { UnipileCtx } from "./work.js";

/** The handwritten card asked for in an action's payload, or null. */
export function cardOf(p: Record<string, unknown>): { text: string; style: CardStyle; font: CardFont } | null {
  const c = p.card as { text?: unknown; style?: unknown; font?: unknown } | undefined;
  if (!c || typeof c.text !== "string" || !c.text.trim()) return null;
  return {
    text: c.text,
    style: (CARD_STYLES as readonly string[]).includes(String(c.style)) ? (c.style as CardStyle) : "cream",
    font: (CARD_FONTS as readonly string[]).includes(String(c.font)) ? (c.font as CardFont) : "casual",
  };
}

/**
 * The card image for one person (2 AI credits), or "NO_CREDITS" when the workspace has none
 * left (the message then goes without it). A drawing failure gives the credits back.
 */
export async function cardImageFor(ctx: UnipileCtx, campaignLeadId: string | null | undefined, card: { text: string; style: CardStyle; font: CardFont }): Promise<Buffer | "NO_CREDITS"> {
  const lead = campaignLeadId ? await ctx.prisma.campaignLead.findUnique({ where: { id: campaignLeadId }, select: { id: true, workspaceId: true } }) : null;
  const spent = lead ? await spendAiCredits(ctx.prisma, lead.workspaceId, AI_COSTS.HANDWRITTEN, "HANDWRITTEN", monthlyAiCredits, { ref: lead.id }) : null;
  if (lead && !spent) return "NO_CREDITS";
  try {
    return await renderCard(card);
  } catch (e) {
    if (lead && spent) await refundAiCredits(ctx.prisma, lead.workspaceId, spent);
    throw e;
  }
}
