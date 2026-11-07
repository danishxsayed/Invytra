import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMPAIGN_SETTINGS as S,
  SEQUENCE_PRESETS,
  applyResult,
  campaignSettingsSchema,
  daysText,
  waitingToStart,
  nameKey,
  plannedAction,
  sequenceProblems,
  sequenceSchema,
  audienceIsFiltered,
  accountIsPremium,
  canAddMessage,
  eventUrl,
  canExecute,
  DEFAULT_LIMITS,
  COMMENTS_PER_DAY,
  EVENT_INVITES_PER_DAY,
  audienceProblems,
  audienceSkip,
  parseDegree,
  type CampaignSettings,
  type CampaignStep,
  type FlowLead,
} from "../src/index.js";

const steps: CampaignStep[] = [
  { type: "VISIT", delayDays: 0 },
  { type: "INVITE", delayDays: 1, note: "Hi {firstName}, saw your work at {company}." },
  { type: "MESSAGE", delayDays: 1, text: "Thanks for connecting, {firstName}!" },
  { type: "MESSAGE", delayDays: 4, text: "Following up on my note." },
];
const now = new Date("2026-10-20T06:00:00Z");
const DAY = 86400_000;
const r0 = () => 0;
const lead = (o: Partial<FlowLead> = {}): FlowLead => ({ state: "QUEUED", step: 0, invitedAt: null, connectedAt: null, ...o });

describe("sequence rules", () => {
  it("accepts a normal sequence", () => {
    expect(sequenceProblems(steps)).toEqual([]);
    expect(sequenceSchema.safeParse(steps).success).toBe(true);
  });
  it("explains what's wrong", () => {
    expect(sequenceProblems([])).toContain("Add at least one step.");
    expect(sequenceProblems([{ type: "VISIT", delayDays: 0 }])).toContain("Add an invite or a message.");
    expect(sequenceProblems([steps[1]!, steps[1]!])).toContain("Use only one invite step.");
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: " " }])).toEqual(["Step 1: write the message."]);
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "Hi {first}" }])[0]).toMatch(/unknown placeholder/);
    // A handwritten card can go alone, but it needs its own text.
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "", card: { text: "Hi {firstName}!", style: "cream", font: "casual" } }])).toEqual([]);
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "Hello", card: { text: " ", style: "cream", font: "casual" } }])).toEqual(["Step 1: write what the handwritten card says."]);
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "Hello", card: { text: "Hi {first}", style: "cream", font: "casual" } }])[0]).toMatch(/handwritten card contains unknown placeholder/);
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "", aiWrite: true }])).toEqual([]);
    expect(sequenceProblems([{ type: "INVITE", delayDays: 0, note: "Hi {firstName}, …" }])[0]).toMatch(/note contains/);
  });
  it("presets need the person's own words before launch", () => {
    expect(sequenceProblems(SEQUENCE_PRESETS.invite_followups.steps)).toContain("Step 3: write the message.");
    expect(sequenceProblems(SEQUENCE_PRESETS.invite_only.steps)).toEqual([]); // an invite without a note is fine
  });
});

describe("lead flow", () => {
  it("visits, invites, waits for acceptance, then messages", () => {
    expect(plannedAction(steps, lead())).toEqual({ type: "PROFILE_VISIT" });

    let l: FlowLead = lead();
    let u = applyResult(steps, S, l, { type: "PROFILE_VISIT", status: "SUCCEEDED", error: null }, now, r0);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 1 });
    expect(u.nextAt!.getTime() - now.getTime()).toBe(DAY); // invite 1 day after the visit
    l = { ...l, ...u };
    expect(plannedAction(steps, l)).toEqual({ type: "CONNECTION_REQUEST", note: "Hi {firstName}, saw your work at {company}." });

    u = applyResult(steps, S, l, { type: "CONNECTION_REQUEST", status: "SUCCEEDED", error: null }, now, r0);
    expect(u).toMatchObject({ state: "WAITING_ACCEPT", step: 2, invitedAt: now });
    l = { ...l, ...u };
    expect(plannedAction(steps, l)).toEqual({ type: "CHECK_CONNECTION" });

    const later = new Date(now.getTime() + 3 * DAY);
    u = applyResult(steps, S, l, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "PENDING" }, later, r0);
    expect(u).toMatchObject({ state: "WAITING_ACCEPT", step: 2 });
    u = applyResult(steps, S, l, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "CONNECTED" }, later, r0);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 2, connectedAt: later });
    l = { ...l, ...u };
    expect(plannedAction(steps, l)).toEqual({ type: "MESSAGE", text: "Thanks for connecting, {firstName}!" });

    u = applyResult(steps, S, l, { type: "MESSAGE", status: "SUCCEEDED", error: null }, later, r0);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 3 });
    expect(u.nextAt!.getTime() - later.getTime()).toBe(4 * DAY);
    l = { ...l, ...u };
    u = applyResult(steps, S, l, { type: "MESSAGE", status: "SUCCEEDED", error: null }, later, r0);
    expect(u).toMatchObject({ state: "DONE", nextAt: null });
    expect(plannedAction(steps, { ...l, ...u })).toBeNull();
  });

  it("skips straight to messages when they're already connected", () => {
    const u = applyResult(steps, S, lead({ state: "IN_PROGRESS", step: 1 }), { type: "CONNECTION_REQUEST", status: "SKIPPED", error: "CONNECTED" }, now, r0);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 2, connectedAt: now });
  });

  it("waits on an invite that was already pending", () => {
    const u = applyResult(steps, S, lead({ state: "IN_PROGRESS", step: 1 }), { type: "CONNECTION_REQUEST", status: "SKIPPED", error: "PENDING" }, now, r0);
    expect(u).toMatchObject({ state: "WAITING_ACCEPT", step: 2 });
  });

  it("gives up on invites not accepted in time, or withdrawn", () => {
    const l = lead({ state: "WAITING_ACCEPT", step: 2, invitedAt: new Date(now.getTime() - 22 * DAY) });
    expect(
      applyResult(steps, { ...S, withdrawExpired: false }, l, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "PENDING" }, now),
    ).toMatchObject({ state: "NOT_ACCEPTED", reason: "EXPIRED" });
    expect(
      applyResult(steps, S, { ...l, invitedAt: now }, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "NOT_CONNECTED" }, now),
    ).toMatchObject({ state: "NOT_ACCEPTED", reason: "WITHDRAWN" });
  });

  it("stops on profiles that can't be invited, and never retries failed messages", () => {
    const l = lead({ state: "IN_PROGRESS", step: 1 });
    expect(applyResult(steps, S, l, { type: "CONNECTION_REQUEST", status: "SKIPPED", error: "EMAIL_REQUIRED" }, now)).toMatchObject({
      state: "SKIPPED",
      reason: "EMAIL_REQUIRED",
    });
    expect(applyResult(steps, S, lead({ state: "IN_PROGRESS", step: 2 }), { type: "MESSAGE", status: "FAILED", error: "Timeout\nstack" }, now)).toMatchObject({
      state: "FAILED",
      reason: "Timeout",
    });
    expect(
      applyResult(steps, S, lead({ state: "IN_PROGRESS", step: 2 }), { type: "MESSAGE", status: "SKIPPED", error: "NOT_CONNECTED (PENDING)" }, now),
    ).toMatchObject({ state: "SKIPPED", reason: "NOT_CONNECTED" });
  });

  it("holds the lead when LinkedIn's weekly invite limit is hit, and re-runs cancelled steps", () => {
    const l = lead({ state: "IN_PROGRESS", step: 1 });
    const u = applyResult(steps, S, l, { type: "CONNECTION_REQUEST", status: "FAILED", error: "WEEKLY_INVITE_LIMIT" }, now);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 1 });
    expect(u.nextAt!.getTime() - now.getTime()).toBe(3 * DAY);
    expect(applyResult(steps, S, l, { type: "CONNECTION_REQUEST", status: "SKIPPED", error: "CANCELLED" }, now)).toEqual({
      state: "IN_PROGRESS",
      step: 1,
      nextAt: now,
    });
  });

  it("finishes invite-only campaigns once accepted", () => {
    const only = SEQUENCE_PRESETS.invite_only.steps as CampaignStep[];
    const u = applyResult(only, S, lead({ state: "WAITING_ACCEPT", step: 2, invitedAt: now }), { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "CONNECTED" }, now);
    expect(u).toMatchObject({ state: "DONE", connectedAt: now });
  });
});

describe("reply matching names", () => {
  it("ignores case, emoji and extra spaces", () => {
    expect(nameKey("  Jane   DOE 🚀 ")).toBe(nameKey("jane doe"));
    expect(nameKey("José Núñez")).toBe("josé núñez");
  });
});

describe("campaign sending days and start date", () => {
  it("defaults to Monday–Friday, starting right away (older campaigns too)", () => {
    expect(campaignSettingsSchema.parse({})).toEqual({ acceptWithinDays: 21, days: [1, 2, 3, 4, 5], startAt: null, withdrawExpired: true, degrees: [1, 2, 3], premiumOnly: false, skipOtherCampaigns: true, fetchAllAtOnce: false, ai: { offer: "", tone: "friendly", fallback: "" } });
  });
  it("allows weekends, sorted and without repeats", () => {
    expect(campaignSettingsSchema.parse({ days: [7, 6, 6, 1] }).days).toEqual([1, 6, 7]);
    expect(campaignSettingsSchema.safeParse({ days: [] }).success).toBe(false);
    expect(campaignSettingsSchema.safeParse({ days: [8] }).success).toBe(false);
  });
  it("describes the days in words", () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(daysText([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(daysText([6, 7])).toBe("Sat, Sun");
    expect(daysText([1, 3, 5])).toBe("Mon, Wed, Fri");
  });
  it("waits for a start date in the future", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    expect(waitingToStart({ startAt: "2026-10-26T18:30:00.000Z" }, now)).toBe(true);
    expect(waitingToStart({ startAt: "2026-10-24T18:30:00.000Z" }, now)).toBe(false);
    expect(waitingToStart({ startAt: null }, now)).toBe(false);
  });
});

describe("like and withdraw steps", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const steps: CampaignStep[] = [
    { type: "LIKE_POST", delayDays: 0 },
    { type: "INVITE", delayDays: 1, note: "" },
  ];
  it("plans a like, and moves on whatever happens to it", () => {
    const lead = { state: "QUEUED" as const, step: 0, invitedAt: null, connectedAt: null };
    expect(plannedAction(steps, lead)).toEqual({ type: "LIKE_POST" });
    for (const [status, error] of [["SUCCEEDED", null], ["SKIPPED", "NO_POSTS"], ["FAILED", "Timeout"]] as const) {
      expect(applyResult(steps, S, lead, { type: "LIKE_POST", status, error }, now, () => 0)).toMatchObject({ state: "IN_PROGRESS", step: 1 });
    }
    expect(applyResult(steps, S, lead, { type: "LIKE_POST", status: "SKIPPED", error: "PROFILE_UNAVAILABLE" }, now)).toMatchObject({ state: "SKIPPED" });
  });
  it("needs an invite or a message besides likes", () => {
    expect(sequenceProblems([{ type: "LIKE_POST", delayDays: 0 }])).toContain("Add an invite or a message.");
  });
  it("withdraws an expired invite, then stops the lead", () => {
    const waiting = { state: "WAITING_ACCEPT" as const, step: 2, invitedAt: new Date(now.getTime() - 22 * 86400_000), connectedAt: null };
    const u = applyResult(steps, S, waiting, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "PENDING" }, now, () => 0);
    expect(u).toMatchObject({ state: "WAITING_ACCEPT", reason: "WITHDRAW" });
    expect(u.nextAt!.getTime() - now.getTime()).toBeLessThan(3600_000);
    const lead = { ...waiting, reason: u.reason };
    expect(plannedAction(steps, lead)).toEqual({ type: "WITHDRAW_INVITE" });
    expect(applyResult(steps, S, lead, { type: "WITHDRAW_INVITE", status: "SUCCEEDED", error: null }, now)).toMatchObject({ state: "NOT_ACCEPTED", reason: "EXPIRED_WITHDRAWN" });
    expect(applyResult(steps, S, lead, { type: "WITHDRAW_INVITE", status: "SKIPPED", error: "CONNECTED" }, now)).toMatchObject({ state: "DONE" });
    expect(applyResult(steps, S, lead, { type: "WITHDRAW_INVITE", status: "FAILED", error: "x" }, now)).toMatchObject({ state: "NOT_ACCEPTED", reason: "EXPIRED" });
  });
  it("leaves expired invites alone when withdrawing is off", () => {
    const waiting = { state: "WAITING_ACCEPT" as const, step: 2, invitedAt: new Date(now.getTime() - 22 * 86400_000), connectedAt: null };
    expect(
      applyResult(steps, { ...S, withdrawExpired: false }, waiting, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "PENDING" }, now),
    ).toMatchObject({ state: "NOT_ACCEPTED", reason: "EXPIRED" });
  });
});

describe("campaign audience", () => {
  const settings = (o: Partial<CampaignSettings> = {}) => campaignSettingsSchema.parse(o);

  it("older campaigns include everyone and skip other campaigns", () => {
    const s = settings();
    expect(s.degrees).toEqual([1, 2, 3]);
    expect(s.premiumOnly).toBe(false);
    expect(s.skipOtherCampaigns).toBe(true);
    expect(audienceIsFiltered(s)).toBe(false);
  });

  it("reads connection degrees only from degree-shaped text", () => {
    expect(parseDegree("· 2nd")).toBe(2);
    expect(parseDegree("Kenny Stewart • 3rd+")).toBe(3);
    expect(parseDegree("1st")).toBe(1);
    expect(parseDegree("3rd+ degree connection")).toBe(3);
    expect(parseDegree("2nd degree connection")).toBe(2);
    expect(parseDegree("1st Choice Flooring")).toBeNull();
    expect(parseDegree("Founder at 21st Century Ltd")).toBeNull();
    expect(parseDegree(null)).toBeNull();
  });

  it("skips known non-matches and lets unknowns through", () => {
    const a = settings({ degrees: [2, 3], premiumOnly: true });
    expect(audienceSkip(a, { degree: 1 })).toBe("AUDIENCE:DEGREE_1");
    expect(audienceSkip(a, { degree: 2, premium: false })).toBe("AUDIENCE:NOT_PREMIUM");
    expect(audienceSkip(a, { degree: 3, premium: true })).toBeNull();
    expect(audienceSkip(a, {})).toBeNull();
  });

  it("a message-only campaign must include 1st-degree connections", () => {
    const steps: CampaignStep[] = [{ type: "MESSAGE", text: "Hi", delayDays: 0 }];
    expect(audienceProblems(steps, settings({ degrees: [2, 3] }))[0]).toMatch(/only message \(or invite to events\) 1st-degree/);
    expect(audienceProblems(steps, settings({ degrees: [1] }))).toEqual([]);
  });

  it("an audience skip found on the profile stops the lead", () => {
    const u = applyResult([], settings(), { state: "IN_PROGRESS", step: 0, invitedAt: null, connectedAt: null }, { type: "LIKE_POST", status: "SKIPPED", error: "AUDIENCE:DEGREE_3" }, new Date());
    expect(u).toMatchObject({ state: "SKIPPED", reason: "AUDIENCE:DEGREE_3" });
  });
});

describe("step picker rules", () => {
  const settings = (o: Partial<CampaignSettings> = {}) => campaignSettingsSchema.parse(o);
  it("a follow step runs a FOLLOW_PROFILE action and never stops the lead", () => {
    const steps: CampaignStep[] = [{ type: "FOLLOW", delayDays: 0 }, { type: "INVITE", delayDays: 1, note: "" }];
    const lead: FlowLead = { state: "QUEUED", step: 0, invitedAt: null, connectedAt: null };
    expect(plannedAction(steps, lead)).toEqual({ type: "FOLLOW_PROFILE" });
    const u = applyResult(steps, settings(), lead, { type: "FOLLOW_PROFILE", status: "SKIPPED", error: "ALREADY_FOLLOWING" }, new Date(), () => 0);
    expect(u).toMatchObject({ state: "IN_PROGRESS", step: 1 });
  });
  it("allows a few profile views anywhere, one follow", () => {
    const v: CampaignStep = { type: "VISIT", delayDays: 0 };
    const inv: CampaignStep = { type: "INVITE", delayDays: 0, note: "" };
    expect(sequenceProblems([v, inv, v])).toEqual([]);
    expect(sequenceProblems([v, v, v, v, inv])[0]).toMatch(/at most 3 profile visit/);
    expect(sequenceProblems([{ type: "FOLLOW", delayDays: 0 }, { type: "FOLLOW", delayDays: 0 }, inv])[0]).toMatch(/only one follow/);
  });
  it("messages need an invite first, or 1st-degree connections", () => {
    const msg: CampaignStep = { type: "MESSAGE", delayDays: 0, text: "Hi" };
    const inv: CampaignStep = { type: "INVITE", delayDays: 0, note: "" };
    expect(canAddMessage([], settings({ degrees: [2, 3] }))).toBe(false);
    expect(canAddMessage([inv], settings({ degrees: [2, 3] }))).toBe(true);
    expect(canAddMessage([], settings({ degrees: [1] }))).toBe(true);
    expect(audienceProblems([msg, inv], settings({ degrees: [2, 3] }))[0]).toMatch(/before the connection request only reaches 1st-degree/);
    expect(audienceProblems([inv, msg], settings({ degrees: [2, 3] }))).toEqual([]);
  });
  it("an account's plan: what the user set wins over what was detected", () => {
    expect(accountIsPremium({ premium: null })).toBeNull();
    expect(accountIsPremium({ premium: false, premiumOverride: true })).toBe(true);
    expect(accountIsPremium({ premium: true })).toBe(true);
  });
});

describe("comment and event steps", () => {
  const settings = (o: Partial<CampaignSettings> = {}) => campaignSettingsSchema.parse(o);
  const inv: CampaignStep = { type: "INVITE", delayDays: 0, note: "" };
  it("checks the comment text and the event link", () => {
    expect(sequenceProblems([inv, { type: "COMMENT", delayDays: 0, text: " " }])[0]).toMatch(/write the comment/);
    expect(sequenceProblems([inv, { type: "EVENT", delayDays: 0, eventUrl: "https://example.com/x" }])[0]).toMatch(/link to your LinkedIn event/);
    expect(sequenceProblems([inv, { type: "EVENT", delayDays: 0, eventUrl: "https://www.linkedin.com/events/7250123/" }])).toEqual([]);
    expect(eventUrl("linkedin.com/events/abc")).toBeNull(); // needs https://
    expect(eventUrl("https://in.linkedin.com/events/growth-7250/?x=1")).toBe("https://www.linkedin.com/events/growth-7250/");
  });
  it("plans the actions, and neither one ever stops the lead", () => {
    const steps: CampaignStep[] = [{ type: "COMMENT", delayDays: 0, text: "Nice, {firstName}" }, { type: "EVENT", delayDays: 1, eventUrl: "https://www.linkedin.com/events/1/" }];
    const lead: FlowLead = { state: "IN_PROGRESS", step: 0, invitedAt: null, connectedAt: null };
    expect(plannedAction(steps, lead)).toEqual({ type: "COMMENT_POST", text: "Nice, {firstName}" });
    expect(plannedAction(steps, { ...lead, step: 1 })).toEqual({ type: "EVENT_INVITE", eventUrl: "https://www.linkedin.com/events/1/" });
    expect(applyResult(steps, settings(), { ...lead, step: 1 }, { type: "EVENT_INVITE", status: "SKIPPED", error: "NOT_IN_CONNECTIONS" }, new Date())).toMatchObject({ state: "DONE" });
  });
  it("event invites need connections, like messages", () => {
    const ev: CampaignStep = { type: "EVENT", delayDays: 0, eventUrl: "https://www.linkedin.com/events/1/" };
    expect(audienceProblems([ev], settings({ degrees: [2, 3] }))[0]).toMatch(/1st-degree/);
    expect(audienceProblems([ev, inv], settings({ degrees: [2, 3] }))[0]).toMatch(/an event invite before the connection request/);
    expect(audienceProblems([inv, ev], settings({ degrees: [2, 3] }))).toEqual([]);
  });
  it("comments and event invites have their own daily caps", () => {
    const account = { status: "ACTIVE" as const, timeZone: "UTC", workingHours: { days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 }, limits: DEFAULT_LIMITS };
    const usage = (o: object) => ({ today: { PROFILE_VISIT: 0, CONNECTION_REQUEST: 0, MESSAGE: 0, ...o }, connectionRequestsThisWeek: 0 });
    expect(canExecute("COMMENT_POST", account, usage({ COMMENT_POST: COMMENTS_PER_DAY }))).toMatchObject({ allowed: false });
    expect(canExecute("COMMENT_POST", account, usage({ COMMENT_POST: 1 }))).toEqual({ allowed: true });
    expect(canExecute("EVENT_INVITE", account, usage({ EVENT_INVITE: EVENT_INVITES_PER_DAY }))).toMatchObject({ allowed: false });
  });
});

import { aiLineMaxChars, aiProblems, fillTemplate, usesAiLine } from "../src/index.js";
describe("AI personalisation ({aiLine})", () => {
  const steps = [{ type: "INVITE", delayDays: 0, note: "Hi {firstName}, {aiLine}" }] as const;
  it("knows when a sequence uses it, and needs to know what you offer", () => {
    expect(usesAiLine([...steps])).toBe(true);
    expect(aiProblems([...steps], { offer: "", tone: "friendly", fallback: "" })).toHaveLength(1);
    expect(aiProblems([...steps], { offer: "Custom apps for clinics", tone: "friendly", fallback: "" })).toEqual([]);
  });
  it("fills {aiLine}, and refuses to send without it", () => {
    expect(fillTemplate("Hi {firstName}, {aiLine}", { firstName: "Raj", aiLine: "Saw your post on hiring a React dev." })).toBe("Hi Raj, Saw your post on hiring a React dev.");
    expect(fillTemplate("Hi {firstName}, {aiLine}", { firstName: "Raj" })).toBeNull();
  });
  it("keeps a note within LinkedIn's limit", () => {
    expect(aiLineMaxChars("Hi {firstName}, {aiLine} Open to connect?", 300)).toBe(220);
    expect(aiLineMaxChars("x".repeat(250) + "{aiLine}", 300)).toBe(60);
  });
});

