import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSession, encryptSession } from "../src/browser/session-crypto.js";

const key = randomBytes(32).toString("base64");
const state = JSON.stringify({ cookies: [{ name: "li_at", value: "secret" }], origins: [] });

describe("session crypto", () => {
  it("round-trips a session", () => {
    expect(decryptSession(encryptSession(state, key), key)).toBe(state);
  });
  it("never stores plaintext", () => {
    expect(encryptSession(state, key).toString("utf8")).not.toContain("secret");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSession(state, key).equals(encryptSession(state, key))).toBe(false);
  });
  it("rejects a wrong key", () => {
    const other = randomBytes(32).toString("base64");
    expect(() => decryptSession(encryptSession(state, key), other)).toThrow();
  });
  it("rejects tampered data", () => {
    const blob = encryptSession(state, key);
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptSession(blob, key)).toThrow();
  });
  it("rejects a key of the wrong length", () => {
    expect(() => encryptSession(state, Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
