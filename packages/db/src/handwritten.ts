import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";
import satori from "satori";

/*
 * Handwritten notes: a letter written in pen on white paper (blue or black ink, key phrases
 * underlined in red), drawn as a PNG for each person with their details already filled in.
 * Sent as a picture with a LinkedIn message or shown inside an email.
 * Kept in step with CARD_STYLES / CARD_FONTS / CARD_INKS in @invytra/shared (this package doesn't depend on it).
 *
 * Writing: a new line starts a new line, an empty line leaves a gap, and *words in stars* are
 * underlined in red.
 */

export type CardStyle = "lined" | "plain";
export type CardFont = "neat" | "pen" | "quick";
export type CardInk = "blue" | "black";
export const CARD_WIDTH = 1080;
export const CARD_MAX_TEXT = 1500;

const require = createRequire(import.meta.url);
const fontFile = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
type Font = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };
let fonts: Font[] | null = null;
const loadFonts = () =>
  (fonts ??= [
    { name: "Patrick Hand", data: fontFile("@fontsource/patrick-hand", "patrick-hand-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Kalam", data: fontFile("@fontsource/kalam", "kalam-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Caveat", data: fontFile("@fontsource/caveat", "caveat-latin-600-normal.woff"), weight: 400, style: "normal" },
  ]);

/** Each handwriting: its font, size, line spacing and where the writing sits on the line. */
const HAND: Record<CardFont, { family: string; size: number; line: number; lift: number }> = {
  neat: { family: "Patrick Hand", size: 44, line: 66, lift: 9 },
  pen: { family: "Kalam", size: 38, line: 66, lift: 2 },
  quick: { family: "Caveat", size: 52, line: 66, lift: 7 },
};
const INK: Record<CardInk, string> = { blue: "#1d3a8a", black: "#1c1c1f" };
const RED = "#c8323c";
const PAD = { x: 84, top: 92, bottom: 96 };

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({ type, props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children } });

/** The text as it can be written by hand: no emojis (a handwriting font has none), tidy spacing. */
export const cardText = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CARD_MAX_TEXT);

/** One written word and whether it's underlined (and whether the underline runs on to the next word). */
export interface Word {
  text: string;
  mark: boolean;
  markOn: boolean;
}

/** Lines of words; an empty line is a gap. `*like this*` marks underlined words. */
export function cardLines(text: string): Word[][] {
  let on = false;
  return cardText(text)
    .split("\n")
    .map((line) => {
      const words: Word[] = [];
      for (const raw of line.split(" ").filter(Boolean)) {
        let w = raw;
        const opens = w.startsWith("*");
        if (opens) (on = true), (w = w.slice(1));
        const closes = /\*[.,!?;:)"']*$/.test(w);
        if (closes) w = w.replace(/\*([.,!?;:)"']*)$/, "$1");
        const mark = on && w.length > 0;
        const tail = closes ? (/[.,!?;:)"']+$/.exec(w)?.[0] ?? "") : "";
        if (closes) on = false;
        // The underline stops before closing punctuation, as people underline.
        if (tail && mark) words.push({ text: w.slice(0, -tail.length), mark: true, markOn: false }, { text: tail, mark: false, markOn: false });
        else if (w) words.push({ text: w, mark, markOn: mark && on });
      }
      return words;
    });
}

/** Small steady wobble, the same every time for the same text. */
function wobble(seed: string) {
  let x = 0;
  for (const c of seed) x = (x * 31 + c.charCodeAt(0)) | 0;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff - 0.5;
  };
}

const measurers = new Map<string, opentype.Font>();
/** How wide a word is in a handwriting at its size. */
function widthOf(family: string, size: number, text: string): number {
  let f = measurers.get(family);
  if (!f) {
    const data = loadFonts().find((x) => x.name === family)!.data;
    f = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    measurers.set(family, f);
  }
  return f.getAdvanceWidth(text, size);
}

const spaceOf = (hand: (typeof HAND)[CardFont]) => Math.max(widthOf(hand.family, hand.size, " "), hand.size * 0.36);

/** The words placed on lines the width of the paper (long lines wrap); null = an empty line. */
export function cardRows(text: string, font: CardFont = "neat"): (Word & { width: number })[][] {
  const hand = HAND[font] ?? HAND.neat;
  const max = CARD_WIDTH - 2 * PAD.x;
  const space = spaceOf(hand);
  const rows: (Word & { width: number })[][] = [];
  for (const line of cardLines(text)) {
    if (!line.length) {
      rows.push([]);
      continue;
    }
    let row: (Word & { width: number })[] = [];
    let used = 0;
    for (const w of line) {
      const width = widthOf(hand.family, hand.size, w.text);
      const glued = /^[.,!?;:)"']+$/.test(w.text); // punctuation split off an underline stays with its word
      const need = row.length && !glued ? space + width : width;
      if (row.length && !glued && used + need > max) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push({ ...w, width });
      used += row.length > 1 && !glued ? space + width : width;
    }
    rows.push(row);
  }
  while (rows.length && !rows.at(-1)!.length) rows.pop();
  return rows;
}

/** The note as a PNG (CARD_WIDTH wide, as tall as the writing). `text` is final (placeholders filled in). */
export async function renderCard(input: { text: string; style?: CardStyle; font?: CardFont; ink?: CardInk }): Promise<Buffer> {
  const style = input.style ?? "lined";
  const font = HAND[input.font ?? "neat"] ? (input.font ?? "neat") : "neat";
  const hand = HAND[font];
  const ink = INK[input.ink ?? "blue"] ?? INK.blue;
  const rows = cardRows(input.text, font);
  const rnd = wobble(input.text);
  const space = spaceOf(hand);
  const height = Math.max(760, PAD.top + rows.length * hand.line + PAD.bottom);

  const layers: Node[] = [];
  if (style === "lined")
    for (let y = PAD.top + hand.line; y < height - 20; y += hand.line)
      layers.push(h("div", { position: "absolute", left: 0, right: 0, top: y - 2, height: 2, backgroundColor: "rgba(120,140,175,0.30)" }));
  rows.forEach((row, r) => {
    if (!row.length) return;
    const tilt = rnd() * 0.5;
    // One red stroke under each underlined phrase on this line.
    const strokes: Node[] = [];
    let x = 0;
    let from: number | null = null;
    row.forEach((w, i) => {
      const glued = i > 0 && /^[.,!?;:)"']+$/.test(w.text);
      if (i > 0 && !glued) x += space;
      if (w.mark && from === null) from = x;
      x += w.width;
      if (from !== null && !(w.mark && w.markOn && row[i + 1]?.mark)) {
        const width = x - from + 6;
        strokes.push(h("div", { position: "absolute", left: from - 3, width, bottom: hand.lift - 8 + rnd() * 2, height: 3, borderRadius: 2, backgroundColor: RED, transform: `rotate(${((rnd() * 60) / width).toFixed(2)}deg)` }));
        from = null;
      }
    });
    const words = row.map((w, i) => {
      const glued = i > 0 && /^[.,!?;:)"']+$/.test(w.text);
      return h(
        "div",
        {
          position: "relative",
          width: Math.ceil(w.width) + 2,
          flexShrink: 0,
          whiteSpace: "nowrap",
          height: hand.line,
          alignItems: "flex-end",
          paddingBottom: hand.lift,
          marginLeft: i === 0 || glued ? 0 : space,
          transform: `translateY(${(rnd() * 2.4).toFixed(1)}px) rotate(${(tilt + rnd() * 0.9).toFixed(2)}deg)`,
        },
        w.text,
      );
    });
    layers.push(h("div", { position: "absolute", left: PAD.x, top: PAD.top + r * hand.line, height: hand.line }, ...words, ...strokes));
  });

  const paper = h(
    "div",
    { position: "relative", width: CARD_WIDTH, height, color: ink, fontFamily: hand.family, fontSize: hand.size, lineHeight: 1, backgroundImage: "linear-gradient(180deg, #fefefc, #f6f5f0)" },
    ...layers,
  );
  const svg = await satori(paper as never, { width: CARD_WIDTH, height, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
}
