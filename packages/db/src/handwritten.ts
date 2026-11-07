import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

/*
 * Handwritten cards: a short note in a handwriting font on a card, drawn as a PNG for each
 * person (their name already filled in). Sent with a LinkedIn message or inside an email.
 * Kept in step with CARD_STYLES / CARD_FONTS in @invytra/shared (this package doesn't depend on it).
 */

export type CardStyle = "cream" | "sticky" | "kraft" | "lime";
export type CardFont = "casual" | "elegant";
export const CARD_SIZE = { width: 1200, height: 800 } as const;

const require = createRequire(import.meta.url);
const fontFile = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
let fonts: { name: string; data: Buffer; weight: 400 | 600; style: "normal" }[] | null = null;
const loadFonts = () =>
  (fonts ??= [
    { name: "Caveat", data: fontFile("@fontsource/caveat", "caveat-latin-600-normal.woff"), weight: 600, style: "normal" },
    { name: "Homemade Apple", data: fontFile("@fontsource/homemade-apple", "homemade-apple-latin-400-normal.woff"), weight: 400, style: "normal" },
  ]);

const LOOK: Record<CardStyle, { desk: string; paper: string; ink: string; tape?: string }> = {
  cream: { desk: "linear-gradient(135deg, #e9e4d8, #d9d2c2)", paper: "linear-gradient(180deg, #fffdf6, #f8f2e3)", ink: "#1f2d5c" },
  sticky: { desk: "linear-gradient(135deg, #e7eaf0, #d5dae3)", paper: "linear-gradient(180deg, #ffe680, #ffd84d)", ink: "#1c1917", tape: "rgba(255,255,255,0.55)" },
  kraft: { desk: "linear-gradient(135deg, #efe9df, #e1d8c8)", paper: "linear-gradient(180deg, #d9b98c, #c9a574)", ink: "#2a1f14" },
  lime: { desk: "linear-gradient(135deg, #f1f4e6, #e2e8cf)", paper: "linear-gradient(180deg, #f2fdc8, #e2f99a)", ink: "#1c1917" },
};

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({ type, props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children } });

/** The text as it can be written by hand: no emojis (a handwriting font has none), tidy spacing. */
export const cardText = (t: string) =>
  t
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim()
    .slice(0, 400);

/** Font size that fits the text on the card (longer notes get smaller writing). */
export function cardFontSize(text: string, font: CardFont): number {
  const n = text.length + (text.match(/\n/g)?.length ?? 0) * 25;
  const base = n <= 60 ? 84 : n <= 110 ? 70 : n <= 160 ? 60 : n <= 220 ? 52 : 46;
  return font === "elegant" ? Math.round(base * 0.72) : base;
}

/** The card as a PNG. `text` is final (placeholders already filled in). */
export async function renderCard(input: { text: string; style?: CardStyle; font?: CardFont }): Promise<Buffer> {
  const style = input.style ?? "cream";
  const font = input.font ?? "casual";
  const look = LOOK[style];
  const text = cardText(input.text);
  const size = cardFontSize(text, font);
  const paper: Record<string, unknown> = {
    display: "flex",
    position: "relative",
    width: 980,
    height: 620,
    padding: "70px 80px",
    backgroundImage: look.paper,
    borderRadius: style === "sticky" ? 6 : 18,
    boxShadow: "0 30px 60px -20px rgba(0,0,0,0.35), 0 8px 18px rgba(0,0,0,0.12)",
    transform: "rotate(-2deg)",
  };
  const children: unknown[] = [];
  if (look.tape) children.push(h("div", { position: "absolute", top: -22, left: 410, width: 160, height: 46, backgroundColor: look.tape, transform: "rotate(3deg)" }));
  children.push(
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        color: look.ink,
        fontFamily: font === "elegant" ? "Homemade Apple" : "Caveat",
        fontWeight: font === "elegant" ? 400 : 600,
        fontSize: size,
        lineHeight: font === "elegant" ? 1.7 : 1.25,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      },
      text,
    ),
  );
  const tree = h("div", { display: "flex", alignItems: "center", justifyContent: "center", width: CARD_SIZE.width, height: CARD_SIZE.height, backgroundImage: look.desk }, h("div", paper, ...children));
  const svg = await satori(tree as never, { ...CARD_SIZE, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE.width } }).render().asPng();
}
