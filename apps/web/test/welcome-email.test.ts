import { describe, expect, it, vi } from "vitest";
import { sendWelcome, welcomeEmail } from "../src/lib/welcome-email";

describe("welcome email", () => {
  const base = { to: "alex@acme.com", name: "Alex Morgan", workspace: "Acme <Sales>", origin: "https://app.invytra.com/" };

  it("greets by first name, links to the workspace and escapes what the user typed", () => {
    const m = welcomeEmail({ ...base, replyTo: "" });
    expect(m.subject).toBe("Welcome to Invytra, Alex!");
    expect(m.to).toBe("alex@acme.com");
    expect(m.text).toContain('Your workspace "Acme <Sales>" is ready.');
    expect(m.text).toContain("Open your workspace: https://app.invytra.com/");
    expect(m.html).toContain('href="https://app.invytra.com/"');
    expect(m.html).toContain('<img src="https://app.invytra.com/logo-128.png" width="40" height="40" alt="Invytra"');
    expect(m.html).toContain("Acme &#60;Sales&#62;");
    expect(m.html).not.toContain("<Sales>");
  });

  it("only invites replies when there's a reply-to address", () => {
    const none = welcomeEmail({ ...base, replyTo: "" });
    expect(none.replyTo).toBeUndefined();
    expect(none.text).not.toContain("reply to this email");
    const help = welcomeEmail({ ...base, replyTo: "support@invytra.com" });
    expect(help.replyTo).toBe("support@invytra.com");
    expect(help.text).toContain("Just reply to this email.");
  });

  it("never throws: a mail failure doesn't break the sign-up", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendWelcome(async () => { throw new Error("Resend 403: domain not verified"); }, base)).toBe(false);
    expect(err.mock.calls[0]!.join(" ")).not.toContain("alex@acme.com");
    expect(await sendWelcome(null, base)).toBe(false);
    const send = vi.fn(async () => {});
    expect(await sendWelcome(send, base)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    err.mockRestore();
  });
});
