import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSealed, openSecret, sealSecret, signConnectTicket, verifyConnectTicket } from "../src/index.js";

const key = randomBytes(32).toString("base64");
const other = randomBytes(32).toString("base64");

describe("sealed secrets", () => {
  it("round-trips and hides the value", () => {
    const sealed = sealSecret("http://user:pass@proxy.example:8000", key);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("pass");
    expect(openSecret(sealed, key)).toBe("http://user:pass@proxy.example:8000");
  });
  it("passes plain values through and keeps empty as empty", () => {
    expect(openSecret("http://plain:1", key)).toBe("http://plain:1");
    expect(sealSecret("", key)).toBe("");
  });
  it("fails with the wrong key", () => {
    expect(() => openSecret(sealSecret("x", key), other)).toThrow();
  });
});

describe("connect tickets", () => {
  it("verifies its own tickets with unique ids", async () => {
    const a = await signConnectTicket({ accountId: "a1", workspaceId: "w1", userId: "u1" }, key);
    const b = await signConnectTicket({ accountId: "a1", workspaceId: "w1", userId: "u1" }, key);
    const ca = await verifyConnectTicket(a, key);
    expect(ca).toMatchObject({ accountId: "a1", workspaceId: "w1", userId: "u1" });
    expect(ca!.ticketId).not.toBe((await verifyConnectTicket(b, key))!.ticketId);
  });
  it("rejects tampered, foreign-key and garbage tickets", async () => {
    const t = await signConnectTicket({ accountId: "a1", workspaceId: "w1", userId: "u1" }, key);
    expect(await verifyConnectTicket(t, other)).toBeNull();
    expect(await verifyConnectTicket(t.slice(0, -2) + "xx", key)).toBeNull();
    expect(await verifyConnectTicket("nope", key)).toBeNull();
  });
});
