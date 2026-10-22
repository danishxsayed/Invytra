import { describe, expect, it } from "vitest";
import { outcomeText, slugName, timeAgo } from "../src/lib/format";
import { signSession, verifySession } from "../src/lib/session-token";
import { clearFailures, isThrottled, recordFailure } from "../src/lib/throttle";

const key = new Uint8Array(32).fill(7);
const otherKey = new Uint8Array(32).fill(8);

describe("session tokens", () => {
  it("round-trips user and workspace", async () => {
    const t = await signSession({ userId: "u1", workspaceId: "w1" }, key);
    expect(await verifySession(t, key)).toEqual({ userId: "u1", workspaceId: "w1" });
  });
  it("rejects a token signed with another key", async () => {
    const t = await signSession({ userId: "u1", workspaceId: "w1" }, otherKey);
    expect(await verifySession(t, key)).toBeNull();
  });
  it("rejects a tampered token", async () => {
    const t = await signSession({ userId: "u1", workspaceId: "w1" }, key);
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u1", wid: "someone-else" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, key)).toBeNull();
    expect(await verifySession(`${h}.${p}.x${s!.slice(1)}`, key)).toBeNull();
  });
  it("rejects missing or garbage tokens", async () => {
    expect(await verifySession(undefined, key)).toBeNull();
    expect(await verifySession("nope", key)).toBeNull();
  });
});

describe("login throttle", () => {
  it("blocks after 5 failures and resets on success", () => {
    const k = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordFailure(k);
    expect(isThrottled(k)).toBe(true);
    clearFailures(k);
    expect(isThrottled(k)).toBe(false);
  });
  it("forgets failures after 15 minutes", () => {
    const k = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordFailure(k, 0);
    expect(isThrottled(k, 16 * 60_000)).toBe(false);
  });
});

describe("format", () => {
  it("turns a profile slug into a readable name", () =>
    expect(slugName("https://www.linkedin.com/in/xavier-eduardo-ramirez-lara-07256210b/")).toBe("xavier eduardo ramirez lara"));
  it("describes times", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(timeAgo(new Date("2026-10-22T11:58:00Z"), now)).toBe("2 min ago");
    expect(timeAgo(new Date("2026-10-22T14:00:00Z"), now)).toBe("in 2 h");
  });
  it("explains outcomes in plain words", () => {
    expect(outcomeText({ status: "SUCCEEDED", type: "CONNECTION_REQUEST", error: null, payload: { note: "x", result: { withNote: false } } })).toMatch(/free-note limit/);
    expect(outcomeText({ status: "SKIPPED", type: "CONNECTION_REQUEST", error: "PENDING", payload: {} })).toBe("Already invited");
    expect(outcomeText({ status: "QUEUED", type: "MESSAGE", error: "waiting: OUTSIDE_WORKING_HOURS", payload: {} })).toBe("Waiting for working hours");
  });
});
