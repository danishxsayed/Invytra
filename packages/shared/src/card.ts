import { z } from "zod";

/*
 * Handwritten notes: a letter written in pen on white paper, made for each person (their name
 * filled in) and sent as a picture with a LinkedIn message or inside an email. 2 AI credits each.
 * Writing: a new line starts a new line, an empty line leaves a gap, *words in stars* are
 * underlined in red. Kept in step with renderCard() in @invytra/db.
 */

export const CARD_STYLES = ["lined", "plain"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export const CARD_STYLE_LABEL: Record<CardStyle, string> = { lined: "Lined paper", plain: "Plain paper" };
export const CARD_FONTS = ["neat", "pen", "quick"] as const;
export type CardFont = (typeof CARD_FONTS)[number];
export const CARD_FONT_LABEL: Record<CardFont, string> = { neat: "Neat print", pen: "Pen", quick: "Quick hand" };
export const CARD_INKS = ["blue", "black"] as const;
export type CardInk = (typeof CARD_INKS)[number];
export const CARD_INK_LABEL: Record<CardInk, string> = { blue: "Blue ink", black: "Black ink" };
/** About a page of writing. */
export const CARD_TEXT_MAX = 1500;

export const cardSchema = z.object({
  text: z.string().max(CARD_TEXT_MAX, `Handwritten notes can be at most ${CARD_TEXT_MAX} characters`),
  style: z.enum(CARD_STYLES),
  font: z.enum(CARD_FONTS),
  ink: z.enum(CARD_INKS).optional(),
});
export type Card = z.infer<typeof cardSchema>;
export const DEFAULT_CARD: Card = { text: "", style: "lined", font: "neat", ink: "blue" };

/** A starting letter, with the name placeholder of the channel ({firstName} or {{first_name|there}}). */
export const cardStarter = (name: string) =>
  `Hi *${name}*,\n\nThank you for connecting! I wanted to write you a quick note myself.\n\nI'd love to show you *how we can help* your business grow. Would you be open to a *quick 15-minute call* this week?\n\nBest regards,\nYour name`;

/** The starter letter's signature, still to be replaced with the sender's name. */
export const unsignedCard = (text: string) => /\bYour name\b/.test(text);
