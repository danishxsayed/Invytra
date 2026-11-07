import { z } from "zod";

/*
 * Handwritten cards: a short note drawn in handwriting on a card, made for each person (their
 * name filled in) and sent with a LinkedIn message or inside an email. 2 AI credits per card.
 * Kept in step with renderCard() in @invytra/db.
 */

export const CARD_STYLES = ["cream", "sticky", "kraft", "lime"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export const CARD_STYLE_LABEL: Record<CardStyle, string> = { cream: "Cream card", sticky: "Sticky note", kraft: "Kraft paper", lime: "Lime card" };
export const CARD_FONTS = ["casual", "elegant"] as const;
export type CardFont = (typeof CARD_FONTS)[number];
export const CARD_FONT_LABEL: Record<CardFont, string> = { casual: "Casual pen", elegant: "Elegant script" };
/** Longer notes stop looking handwritten. */
export const CARD_TEXT_MAX = 220;

export const cardSchema = z.object({
  text: z.string().max(CARD_TEXT_MAX, `Cards can be at most ${CARD_TEXT_MAX} characters`),
  style: z.enum(CARD_STYLES),
  font: z.enum(CARD_FONTS),
});
export type Card = z.infer<typeof cardSchema>;
export const DEFAULT_CARD: Card = { text: "", style: "cream", font: "casual" };
