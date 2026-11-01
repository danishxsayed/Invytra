import { describe, expect, it } from "vitest";
import { parseIncoming, stripQuoted } from "../src/inbox-reader.js";

const msg = (headers: string, body: string) => `${headers}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;

describe("reading replies", () => {
  it("keeps only the new text of a reply", () => {
    expect(stripQuoted("Sounds good, let's talk Tuesday.\n\nOn Mon, 2 Nov 2026 at 11:00, Tom <tom@x.pro> wrote:\n> Hi Priya")).toBe("Sounds good, let's talk Tuesday.");
    expect(stripQuoted("Yes please\n-----Original Message-----\nFrom: Tom")).toBe("Yes please");
    expect(stripQuoted("Sure\n\nFrom: Tom <tom@x.pro>\nSent: Monday\nTo: Priya")).toBe("Sure");
    expect(stripQuoted("Thanks!\nOn Mon, 2 Nov 2026 at 11:00, Tom Harris\n<tom@x.pro> wrote:\n> hi")).toBe("Thanks!");
  });

  it("reads a reply with its thread headers", async () => {
    const m = await parseIncoming(
      msg("From: Priya Shah <Priya@Acme.io>\r\nTo: tom@x.pro\r\nSubject: Re: Hello Priya\r\nMessage-ID: <r1@acme.io>\r\nIn-Reply-To: <m1@x>\r\nReferences: <m1@x>\r\nDate: Mon, 02 Nov 2026 12:00:00 +0530", "Interested, tell me more.\r\n\r\nOn Mon, Tom wrote:\r\n> Hi"),
      7,
    );
    expect(m).toMatchObject({ uid: 7, kind: "REPLY", fromEmail: "priya@acme.io", fromName: "Priya Shah", subject: "Re: Hello Priya", text: "Interested, tell me more.", inReplyTo: "<m1@x>", references: ["<m1@x>"], messageId: "<r1@acme.io>" });
  });

  it("recognises out-of-office replies", async () => {
    expect((await parseIncoming(msg("From: a@b.co\r\nSubject: Automatic reply: Hello\r\nAuto-Submitted: auto-replied", "I'm away"), 1)).kind).toBe("AUTO_REPLY");
    expect((await parseIncoming(msg("From: a@b.co\r\nSubject: Out of Office", "Away"), 1)).kind).toBe("AUTO_REPLY");
  });

  it("recognises bounces and the address that failed", async () => {
    const dsn =
      "From: Mail Delivery System <MAILER-DAEMON@mx.hostinger.com>\r\nTo: tom@x.pro\r\nSubject: Undelivered Mail Returned to Sender\r\nMIME-Version: 1.0\r\n" +
      'Content-Type: multipart/report; report-type=delivery-status; boundary="B"\r\n\r\n' +
      "--B\r\nContent-Type: text/plain\r\n\r\nI'm sorry to have to inform you that your message could not be delivered.\r\n" +
      "--B\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; mx.hostinger.com\r\n\r\nFinal-Recipient: rfc822; Gone@Epsilon.co\r\nAction: failed\r\nStatus: 5.1.1\r\n--B--\r\n";
    const m = await parseIncoming(dsn, 3);
    expect(m.kind).toBe("BOUNCE");
    expect(m.bounced).toEqual(["gone@epsilon.co"]);
  });
});
