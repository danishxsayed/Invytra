import { describe, expect, it } from "vitest";
import { planIntro, readAnswers, setupPlan, type SetupProgress } from "../src/onboarding";

const none: SetupProgress = { linkedinAccounts: 0, mailboxes: 0, people: 0, campaignsLive: 0, voices: 0, doNotContact: 0 };
const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("onboarding answers", () => {
  it("keeps what's valid and drops the rest", () => {
    expect(readAnswers({ role: "founder", goal: "nope", channels: ["linkedin"] })).toEqual({});
    expect(readAnswers({ role: "founder", channels: ["linkedin", "email"], heardFrom: "ai" })).toEqual({ role: "founder", channels: ["linkedin", "email"], heardFrom: "ai" });
    expect(readAnswers(null)).toEqual({});
  });
});

describe("setup plan", () => {
  it("skipped everything: LinkedIn and email, people, campaign, voice", () => {
    expect(ids(setupPlan({}, none))).toEqual(["linkedin", "mailbox", "people", "campaign", "voice"]);
    expect(planIntro({})).toBe("A few steps to get your first replies.");
  });

  it("a founder after customers on LinkedIn: no mailbox step, voice and do-not-contact", () => {
    const plan = setupPlan({ role: "founder", goal: "customers", channels: ["linkedin"] }, none);
    expect(ids(plan)).toEqual(["linkedin", "people", "campaign", "voice", "dnc"]);
    expect(planIntro({ goal: "customers" })).toBe("Built around what you told us: win new customers.");
  });

  it("a recruiter: candidates and a candidate campaign", () => {
    const plan = setupPlan({ role: "recruiter", goal: "hiring", channels: ["linkedin"] }, none);
    expect(plan.find((s) => s.id === "people")!.title).toBe("Add the candidates you want to reach");
    expect(plan.find((s) => s.id === "campaign")!.title).toBe("Launch a campaign to candidates");
    expect(ids(plan)).not.toContain("dnc");
  });

  it("an agency: client accounts, client prospects, no voice step", () => {
    const plan = setupPlan({ role: "agency", channels: ["linkedin", "email"], accounts: "6-20" }, none);
    expect(plan[0]!.title).toBe("Connect your first client's LinkedIn account");
    expect(plan.find((s) => s.id === "people")!.title).toBe("Add your first client's prospects");
    expect(ids(plan)).not.toContain("voice");
  });

  it("several accounts are mentioned; steps tick off from real data", () => {
    const plan = setupPlan({ accounts: "2-5", channels: ["linkedin"] }, { ...none, linkedinAccounts: 1, people: 40 });
    expect(plan[0]).toMatchObject({ title: "Connect your LinkedIn accounts", done: true });
    expect(plan[0]!.why).toContain("2 to 5 accounts");
    expect(plan.filter((s) => s.done).map((s) => s.id)).toEqual(["linkedin", "people"]);
  });

  it("email only: no LinkedIn or voice steps", () => {
    expect(ids(setupPlan({ channels: ["email"], goal: "partners" }, none))).toEqual(["mailbox", "people", "campaign"]);
  });
});
