import { describe, expect, it } from "vitest";
import { CARD_WIDTH, cardLines, cardRows, cardText, renderCard } from "../src/handwritten.js";

describe("handwritten notes", () => {
  it("draws a PNG letter in each handwriting, as tall as the writing", async () => {
    const short = "Hi *Priya*,\nLoved your post on remote hiring!";
    for (const font of ["neat", "pen", "quick"] as const) {
      const png = await renderCard({ text: short, font, style: font === "pen" ? "plain" : "lined", ink: "black" });
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(CARD_WIDTH);
    }
    const long = await renderCard({ text: Array(14).fill("A longer paragraph that keeps going for a while.").join("\n\n") });
    expect(long.readUInt32BE(20)).toBeGreaterThan(1500);
  }, 30_000);

  it("reads *stars* as red underlines (punctuation left out), and wraps long lines", () => {
    expect(cardText("Hi Sara! 👋  Congrats 🎉 on the role")).toBe("Hi Sara! Congrats on the role");
    const [line] = cardLines("Hi *Sara Lee*, a *quick call*?");
    expect(line!.map((w) => [w.text, w.mark])).toEqual([["Hi", false], ["Sara", true], ["Lee", true], [",", false], ["a", false], ["quick", true], ["call", true], ["?", false]]);
    expect(line![1]!.markOn).toBe(true);
    expect(line![2]!.markOn).toBe(false);
    expect(cardRows("word ".repeat(80)).length).toBeGreaterThan(3);
    expect(cardRows("One\n\nTwo")).toHaveLength(3);
  });
});
