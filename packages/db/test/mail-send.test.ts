import { describe, expect, it } from "vitest";
import { emailBody, sendEmail, type MailSender } from "../src/mail-send.js";
import { MAILBOX_PRESETS } from "../src/mailbox.js";

const login = { ...MAILBOX_PRESETS.HOSTINGER, provider: "HOSTINGER" as const, username: "tom@x.co", password: "pw" };
const mail = { fromName: "Tom", from: "tom@x.co", to: "a@b.co", subject: "Hi", text: "Hello <there>\nline two\n\nBye", signature: "Tom\nCrawlers" };

describe("sendEmail", () => {
  it("adds the signature and an HTML part that matches the text", () => {
    const b = emailBody(mail.text, mail.signature);
    expect(b.text).toBe("Hello <there>\nline two\n\nBye\n\nTom\nCrawlers");
    expect(b.html).toContain("<p>Hello &lt;there&gt;<br>line two</p>");
    expect(b.html).toContain("<p>Tom<br>Crawlers</p>");
    expect(emailBody("Hi  \n", "  ").text).toBe("Hi");
  });

  it("returns the message id, or a plain reason instead of throwing", async () => {
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    let sent: unknown;
    const ok: MailSender = { send: async (_l, m) => ((sent = m), { messageId: "<1@x.co>" }) };
    expect(await sendEmail(login, mail, ok)).toEqual({ ok: true, messageId: "<1@x.co>" });
    expect(sent).toMatchObject({ to: "a@b.co", text: expect.stringContaining("Crawlers") });

    const auth: MailSender = { send: async () => Promise.reject(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 })) };
    expect(await sendEmail(login, mail, auth)).toMatchObject({ ok: false, error: expect.stringContaining("didn't accept") });

    const refused: MailSender = { send: async () => Promise.reject(Object.assign(new Error("x"), { responseCode: 550, response: "550 5.1.1 User unknown" })) };
    expect(await sendEmail(login, mail, refused)).toEqual({ ok: false, error: "The receiving server refused this address. (Server said: 550 5.1.1 User unknown)" });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
  });
});
