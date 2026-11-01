import { describe, expect, it } from "vitest";
import { warmupCode, warmupEmail, warmupReply } from "../src/warmup-content.js";
import { WARMUP_FOLDER, warmupFolders } from "../src/warmup-imap.js";

describe("warm-up emails", () => {
  it("are short, link-free, addressed by first name, and carry the code", () => {
    const code = warmupCode();
    expect(code).toMatch(/^wu[0-9a-f]{12}$/);
    const e = warmupEmail("Tom Harris", "Priya Shah", code, () => 0);
    expect(e.text).toMatch(/^Hi Priya,/);
    expect(e.text).toContain(`ref ${code}`);
    expect(e.text).not.toMatch(/https?:/);
    expect(e.text).toContain("\nTom\n");
    expect(warmupReply(e.subject, "Priya Shah", "wu1").subject).toBe(`Re: ${e.subject}`);
    expect(warmupReply("Re: x", "P", "wu1").subject).toBe("Re: x");
  });
});

describe("warm-up folders", () => {
  it("finds spam by its special-use flag or name", () => {
    expect(warmupFolders([{ path: "INBOX", name: "INBOX" }, { path: "[Gmail]/Spam", name: "Spam", specialUse: "\\Junk", delimiter: "/" }])).toEqual({ junk: "[Gmail]/Spam", warm: WARMUP_FOLDER, exists: false });
    expect(warmupFolders([{ path: "INBOX", name: "INBOX" }, { path: "Junk", name: "Junk" }]).junk).toBe("Junk");
  });
  it("creates the folder under INBOX on servers that keep everything there", () => {
    const list = [
      { path: "INBOX", name: "INBOX", delimiter: "." },
      { path: "INBOX.Sent", name: "Sent", delimiter: "." },
      { path: "INBOX.Spam", name: "Spam", delimiter: ".", specialUse: "\\Junk" },
    ];
    expect(warmupFolders(list)).toEqual({ junk: "INBOX.Spam", warm: `INBOX.${WARMUP_FOLDER}`, exists: false });
    expect(warmupFolders([...list, { path: `INBOX.${WARMUP_FOLDER}`, name: WARMUP_FOLDER }]).exists).toBe(true);
  });
});
