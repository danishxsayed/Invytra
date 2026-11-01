import { describe, expect, it } from "vitest";
import { emailBody, sendEmail, type MailSender } from "../src/mail-send.js";
import { MAILBOX_PRESETS } from "../src/mailbox.js";

const login = { ...MAILBOX_PRESETS.HOSTINGER, provider: "HOSTINGER" as const, username: "tom@x.co", password: "pw" };
const mail = { fromName: "Tom", from: "tom@x.co", to: "a@b.co", subject: "Hi", text: "Hello <there>\nline two\n\nBye", signature: "Tom\nCrawlers" };

describe("unsubscribe line", () => {
  const u = { text: "Don't want these emails? [Unsubscribe here]", url: "https://app.x/unsubscribe/t1" };
  it("goes at the bottom, linked in HTML and spelled out in text", () => {
    const b = emailBody("Hi Priya", "Tom", u);
    expect(b.text).toBe("Hi Priya\n\nTom\n\nDon't want these emails? Unsubscribe here: https://app.x/unsubscribe/t1");
    expect(b.html).toContain(`Don&#39;t want these emails? <a href="https://app.x/unsubscribe/t1">Unsubscribe here</a>`.replace("&#39;", "'"));
  });
  it("puts preview text first, hidden", () => {
    expect(emailBody("Hi", "", null, "A quick idea").html).toMatch(/^<div style="display:none[^"]*">A quick idea<\/div>/);
  });
  it("goes where the email says {{unsubscribe}}, or disappears when off", () => {
    expect(emailBody("Hi\n\n{{unsubscribe}}\n\nP.S. more", "", u).text).toBe("Hi\n\nDon't want these emails? Unsubscribe here: https://app.x/unsubscribe/t1\n\nP.S. more");
    expect(emailBody("Hi {{unsubscribe}}", "", null).text).toBe("Hi");
  });
});

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
    expect(await sendEmail(login, mail, refused)).toEqual({ ok: false, refused: true, error: "The receiving server refused this address. (Server said: 550 5.1.1 User unknown)" });
    const busy: MailSender = { send: async () => Promise.reject(Object.assign(new Error("x"), { responseCode: 452, command: "RCPT TO", response: "452 4.2.2 Mailbox full" })) };
    expect(await sendEmail(login, mail, busy)).toEqual({ ok: false, temporary: true, error: "The receiving server couldn't take it right now. (Server said: 452 4.2.2 Mailbox full)" });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
  });
});
