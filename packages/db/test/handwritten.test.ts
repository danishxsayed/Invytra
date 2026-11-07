import { describe, expect, it } from "vitest";
import { CARD_SIZE, cardFontSize, cardText, renderCard } from "../src/handwritten.js";

describe("handwritten cards", () => {
  it("draws a PNG card in each style", async () => {
    for (const style of ["cream", "sticky", "kraft", "lime"] as const) {
      const png = await renderCard({ text: "Hi Priya,\nLoved your post on remote hiring!", style });
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(CARD_SIZE.width);
      expect(png.readUInt32BE(20)).toBe(CARD_SIZE.height);
    }
  }, 30_000);
  it("leaves out emojis and writes long notes smaller", () => {
    expect(cardText("Hi Sara! 👋  Congrats 🎉 on the role")).toBe("Hi Sara! Congrats on the role");
    expect(cardFontSize("Short note", "casual")).toBeGreaterThan(cardFontSize("x".repeat(200), "casual"));
    expect(cardFontSize("Short note", "elegant")).toBeLessThan(cardFontSize("Short note", "casual"));
  });
});
