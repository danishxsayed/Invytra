import { describe, expect, it } from "vitest";
import { MAILBOX_PRESETS, checkMailHost, explainMailError, testMailbox, type MailboxLogin } from "../src/mailbox.js";

const login: MailboxLogin = { ...MAILBOX_PRESETS.GOOGLE, username: "a@b.co", password: "secret-pw" };

describe("mailboxes", () => {
  it("has the usual hosts' servers filled in", () => {
    expect(MAILBOX_PRESETS.GOOGLE).toMatchObject({ smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993 });
    expect(MAILBOX_PRESETS.MICROSOFT).toMatchObject({ smtpPort: 587, smtpSecure: false });
  });

  it("refuses server names that aren't public mail servers", async () => {
    await expect(checkMailHost("localhost", {})).rejects.toThrow(/isn't a mail server name/);
    await expect(checkMailHost("127.0.0.1", {})).rejects.toThrow(/isn't a mail server name/);
    await expect(checkMailHost("smtp.example.com", { ALLOW_PRIVATE_MAIL_HOSTS: "true" })).resolves.toBeUndefined();
  });

  it("explains failures in plain words, never echoing the password", () => {
    expect(explainMailError({ code: "EAUTH", message: "535 bad secret-pw" }, "SMTP")).toMatch(/didn't accept the email and password/);
    expect(explainMailError({ code: "ETIMEDOUT" }, "IMAP")).toMatch(/Couldn't reach the IMAP server/);
    expect(explainMailError({ message: "wrong version number" }, "SMTP")).toMatch(/465 = SSL, 587 = STARTTLS/);
    expect(explainMailError({ authenticationFailed: true, message: "x" }, "IMAP")).not.toContain("secret-pw");
  });

  it("checks sending and reading separately", async () => {
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    const r = await testMailbox(login, {
      smtp: async () => undefined,
      imap: async () => {
        throw Object.assign(new Error("Authentication failed"), { authenticationFailed: true });
      },
    });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    expect(r.smtp).toEqual({ ok: true });
    expect(r.imap).toMatchObject({ ok: false, error: expect.stringMatching(/app password/) });
  });
});
