import { describe, expect, it } from "vitest";
import { emailSequenceSchema } from "../src/email-campaign.js";

describe("email sequence", () => {
  it("checks the handwritten card's text", () => {
    const card = (text: string) => ({ text, style: "plain" as const, font: "pen" as const });
    expect(emailSequenceSchema.safeParse([{ subject: "Hi", body: "x", delayDays: 0, card: card("Thanks {{first_name|there}}!") }]).success).toBe(true);
    const bad = emailSequenceSchema.safeParse([{ subject: "Hi", body: "x", delayDays: 0, card: card("  ") }]);
    expect(bad.error!.issues.map((i) => i.message)).toEqual(["Email 1: write what the handwritten note says."]);
  });

  it("needs a first subject, text in each email, and a day between emails", () => {
    expect(emailSequenceSchema.safeParse([{ subject: "Hi", body: "x", delayDays: 0 }, { subject: "", body: "y", delayDays: 2 }]).success).toBe(true);
    const bad = emailSequenceSchema.safeParse([{ subject: "", body: " ", delayDays: 0 }, { subject: "", body: "y", delayDays: 0 }]);
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.message)).toEqual(["The first email needs a subject.", "Email 1 has no text.", "Email 2: wait at least 1 day after the previous email."]);
  });
});
