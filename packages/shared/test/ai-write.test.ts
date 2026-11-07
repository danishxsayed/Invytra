import { describe, expect, it } from "vitest";
import { aiProblems, usesAiWrite } from "../src/ai.js";
import { plannedAction } from "../src/campaign-flow.js";
import { sequenceProblems, type CampaignStep } from "../src/campaign.js";

describe("AI writes the whole note or message", () => {
  const steps: CampaignStep[] = [
    { type: "VISIT", delayDays: 0 },
    { type: "INVITE", delayDays: 1, note: "Mention their hiring", aiWrite: true },
    { type: "MESSAGE", delayDays: 1, text: "", aiWrite: true },
  ];
  it("allows an empty message when AI writes it, and needs the offer", () => {
    expect(usesAiWrite(steps)).toBe(true);
    expect(sequenceProblems(steps).some((p) => p.includes("write the message"))).toBe(false);
    expect(aiProblems(steps, { offer: "", tone: "friendly", fallback: "" })[0]).toMatch(/AI writes some of your notes/);
    expect(aiProblems(steps, { offer: "Clinic apps", tone: "friendly", fallback: "" })).toEqual([]);
  });
  it("passes the switch on to the planned action", () => {
    const lead = { state: "IN_PROGRESS", step: 1, reason: null } as never;
    expect(plannedAction(steps, lead)).toEqual({ type: "CONNECTION_REQUEST", note: "Mention their hiring", aiWrite: true });
    expect(plannedAction([{ type: "MESSAGE", delayDays: 0, text: "Hi" }], { state: "IN_PROGRESS", step: 0, reason: null } as never)).toEqual({ type: "MESSAGE", text: "Hi" });
  });
});
