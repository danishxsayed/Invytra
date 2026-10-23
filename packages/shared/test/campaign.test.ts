import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMPAIGN_SETTINGS as S,
  SEQUENCE_PRESETS,
  applyResult,
  nameKey,
  plannedAction,
  sequenceProblems,
  sequenceSchema,
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
    expect(sequenceProblems([steps[1]!, steps[0]!])).toContain("Put the profile visit before the invite.");
    expect(sequenceProblems([steps[1]!, steps[1]!])).toContain("Use only one invite step.");
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: " " }])).toEqual(["Step 1: write the message."]);
    expect(sequenceProblems([{ type: "MESSAGE", delayDays: 0, text: "Hi {first}" }])[0]).toMatch(/unknown placeholder/);
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
    expect(applyResult(steps, S, l, { type: "CHECK_CONNECTION", status: "SUCCEEDED", error: null, connection: "PENDING" }, now)).toMatchObject({
      state: "NOT_ACCEPTED",
      reason: "EXPIRED",
    });
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
