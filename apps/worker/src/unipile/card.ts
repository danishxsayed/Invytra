import { VoiceError, refundAiCredits, renderCard, spendAiCredits, voiceFromEnv, voiceMessageFile, type CardFont, type CardInk, type CardStyle, type VoiceSample } from "@invytra/db";
import { AI_COSTS, CARD_FONTS, CARD_INKS, CARD_STYLES } from "@invytra/shared";
import type { UnipileCtx } from "./work.js";

/*
 * Extras drawn or spoken for each person on a LinkedIn message: a handwritten note (2 AI
 * credits) and a voice note in the customer's own voice (5). Each is paid when it's made and
 * paid back (refund) if it can't be made or sent.
 */

type CardSpec = { text: string; style: CardStyle; font: CardFont; ink: CardInk };

/** The handwritten note asked for in an action's payload, or null. */
export function cardOf(p: Record<string, unknown>): CardSpec | null {
  const c = p.card as { text?: unknown; style?: unknown; font?: unknown; ink?: unknown } | undefined;
  if (!c || typeof c.text !== "string" || !c.text.trim()) return null;
  return {
    text: c.text,
    style: (CARD_STYLES as readonly string[]).includes(String(c.style)) ? (c.style as CardStyle) : "lined",
    font: (CARD_FONTS as readonly string[]).includes(String(c.font)) ? (c.font as CardFont) : "neat",
    ink: (CARD_INKS as readonly string[]).includes(String(c.ink)) ? (c.ink as CardInk) : "blue",
  };
}

/** The voice note asked for in an action's payload, or null. */
export function voiceOf(p: Record<string, unknown>): { voiceId: string; script: string } | null {
  const v = p.voice as { voiceId?: unknown; script?: unknown } | undefined;
  return v && typeof v.voiceId === "string" && typeof v.script === "string" && v.script.trim() ? { voiceId: v.voiceId, script: v.script } : null;
}

export interface Made<T> {
  value: T;
  /** Gives the credits back (it wasn't sent). */
  refund(): Promise<void>;
}

export async function leadOf(ctx: UnipileCtx, campaignLeadId: string | null | undefined) {
  return campaignLeadId ? ctx.prisma.campaignLead.findUnique({ where: { id: campaignLeadId }, select: { id: true, workspaceId: true } }) : null;
}

/** Pays for one extra and makes it; the credits come back if making it fails. */
export async function paid<T>(ctx: UnipileCtx, lead: { id: string; workspaceId: string } | null, action: "HANDWRITTEN" | "VOICE" | "VIDEO", make: () => Promise<T>): Promise<Made<T> | "NO_CREDITS"> {
  const spent = lead ? await spendAiCredits(ctx.prisma, lead.workspaceId, AI_COSTS[action], action, null, { ref: lead.id }) : null;
  if (lead && !spent) return "NO_CREDITS";
  const refund = async () => {
    if (lead && spent) await refundAiCredits(ctx.prisma, lead.workspaceId, spent);
  };
  try {
    return { value: await make(), refund };
  } catch (e) {
    await refund();
    throw e;
  }
}

/** The handwritten note image for one person (2 AI credits), or "NO_CREDITS". */
export async function cardImageFor(ctx: UnipileCtx, campaignLeadId: string | null | undefined, card: CardSpec): Promise<Made<Buffer> | "NO_CREDITS"> {
  return paid(ctx, await leadOf(ctx, campaignLeadId), "HANDWRITTEN", () => renderCard(card));
}

/**
 * The voice note for one person (10 AI credits): the script read in the chosen voice, as a
 * LinkedIn voice message. "NO_VOICE" when the voice was deleted or voice notes aren't set up
 * (no ELEVENLABS_API_KEY); a VoiceError (credits given back) when the voice service refuses.
 */
export async function voiceNoteFor(ctx: UnipileCtx, campaignLeadId: string | null | undefined, voiceId: string, script: string): Promise<Made<VoiceSample> | "NO_CREDITS" | "NO_VOICE"> {
  const maker = ctx.voice !== undefined ? ctx.voice : voiceFromEnv();
  const lead = await leadOf(ctx, campaignLeadId);
  if (!maker || !lead) return "NO_VOICE";
  const clone = await ctx.prisma.voiceClone.findFirst({ where: { id: voiceId, workspaceId: lead.workspaceId }, select: { providerVoiceId: true } });
  if (!clone) return "NO_VOICE";
  return paid(ctx, lead, "VOICE", async () => voiceMessageFile(await maker.speak(clone.providerVoiceId, script)));
}

export { VoiceError };
