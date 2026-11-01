import { describe, expect, it } from "vitest";
import { readUnsubscribeToken, unsubscribeToken, unsubscribeUrls } from "../src/unsubscribe.js";

describe("unsubscribe tokens", () => {
  const key = "k".repeat(44);
  it("round-trip, and refuse changed or foreign tokens", () => {
    const t = unsubscribeToken("lead123", key);
    expect(readUnsubscribeToken(t, key)).toBe("lead123");
    expect(readUnsubscribeToken(t.replace("lead123", "lead124"), key)).toBeNull();
    expect(readUnsubscribeToken(t, "other-key")).toBeNull();
    expect(readUnsubscribeToken("garbage", key)).toBeNull();
    expect(unsubscribeUrls("https://app.invytra.com/", t)).toEqual({ page: `https://app.invytra.com/unsubscribe/${t}`, oneClick: `https://app.invytra.com/api/unsubscribe/${t}` });
  });
});
