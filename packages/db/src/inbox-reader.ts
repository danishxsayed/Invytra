import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { checkMailHost, type MailboxLogin } from "./mailbox.js";
import { warmupFolders } from "./warmup-imap.js";

/*
 * Reading a campaign mailbox's inbox for replies and bounces: only messages that arrived
 * since the last read (by IMAP UID), parsed and sorted into reply / auto-reply / bounce.
 */

export interface IncomingMail {
  uid: number;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  date: Date;
  /** The new text only (quoted history cut), at most 4000 characters. */
  text: string;
  inReplyTo: string | null;
  references: string[];
  kind: "REPLY" | "AUTO_REPLY" | "BOUNCE";
  /** For a bounce: the addresses that failed. */
  bounced: string[];
  /** For a bounce: permanent (no such address) or temporary (mailbox full…); "delayed" = still being retried by the server. */
  bounceType?: "HARD" | "SOFT" | "DELAYED";
  /** For a bounce: the receiving server's reason, e.g. "550 5.1.1 User unknown". */
  bounceReason?: string;
  /** Found in the spam folder (and moved back to the inbox). */
  fromSpam?: boolean;
}

/** A spam-folder message's envelope, to decide whether it's from a lead before downloading it. */
export interface SpamEnvelope {
  messageId: string | null;
  fromEmail: string;
  inReplyTo: string | null;
}

export interface ReadCursor {
  uidValidity: bigint | null;
  uidNext: number | null;
}

export interface MailboxReader {
  /**
   * New INBOX messages after the cursor (or since `since` when there is none / it's stale).
   * With `fromLead`, the last days of the spam folder are checked too: messages it accepts
   * are read and moved back to the inbox (teaching the provider they aren't spam).
   */
  read(
    login: MailboxLogin,
    cursor: ReadCursor,
    since: Date,
    fromLead?: (e: SpamEnvelope) => boolean | Promise<boolean>,
  ): Promise<{ uidValidity: bigint; uidNext: number; messages: IncomingMail[] }>;
}

const MAX_PER_READ = 200;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** The new part of a reply: everything above "On … wrote:", "-----Original Message-----" or quoted lines. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*>/.test(l)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^_{10,}$/.test(l.trim())) break;
    // "On Mon, 2 Nov 2026 at 11:00, Tom <tom@x> wrote:" (sometimes wrapped over two lines)
    if (/^On .{4,}wrote:\s*$/i.test(l) || (/^On .{4,}/i.test(l) && /wrote:\s*$/i.test(lines[i + 1] ?? ""))) break;
    if (/^From: .+/i.test(l) && /^(Sent|Date): .+/i.test(lines[i + 1] ?? "")) break;
    out.push(l);
  }
  return out.join("\n").trim().slice(0, 4000);
}

/** Hard or soft, from the delivery report's Status (5.x.x / 4.x.x) and Action, else from its words. */
export function classifyBounce(raw: string, text: string): { bounceType: "HARD" | "SOFT" | "DELAYED"; bounceReason: string } {
  const action = /^Action:\s*(\w+)/im.exec(raw)?.[1]?.toLowerCase();
  const status = /^Status:\s*([245])\.\d{1,3}\.\d{1,3}/im.exec(raw)?.[1];
  const diag = /^Diagnostic-Code:\s*(?:smtp;\s*)?(.+(?:\r?\n[ \t].+)*)/im.exec(raw)?.[1]?.replace(/\s+/g, " ").trim();
  const words = text.replace(/\s+/g, " ");
  const reason = (diag || /\b[45]\d\d[ -][45]\.\d+\.\d+[^.\n]*/.exec(words)?.[0] || words.split(/(?<=\.)\s/).find((x) => x.length > 20) || "Undeliverable").slice(0, 300);
  if (action === "delayed") return { bounceType: "DELAYED", bounceReason: reason };
  if (status === "5") return { bounceType: "HARD", bounceReason: reason };
  if (status === "4") return { bounceType: "SOFT", bounceReason: reason };
  if (/mailbox (is )?full|over ?quota|quota exceeded|temporar|try again later|insufficient storage|greylist/i.test(words)) return { bounceType: "SOFT", bounceReason: reason };
  return { bounceType: "HARD", bounceReason: reason };
}

const first = (a: AddressObject | AddressObject[] | undefined) => (Array.isArray(a) ? a[0] : a)?.value[0];

/** Parses one raw message and says what it is. */
export async function parseIncoming(source: Buffer | string, uid: number): Promise<IncomingMail> {
  const p = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
  const from = first(p.from);
  const fromEmail = (from?.address ?? "").toLowerCase();
  const subject = p.subject ?? "";
  const h = (name: string) => String(p.headers.get(name) ?? "").toLowerCase();
  const ctype = p.headers.get("content-type") as { value?: string; params?: Record<string, string> } | undefined;
  const raw = typeof source === "string" ? source : source.toString("utf8");

  const isBounce =
    /^(mailer-daemon|postmaster|mail-daemon)@/i.test(fromEmail) ||
    (ctype?.value === "multipart/report" && /delivery-status/i.test(ctype.params?.["report-type"] ?? "")) ||
    /^(undeliver|delivery status notification|mail delivery (failed|failure)|failure notice|returned mail|delivery failure)/i.test(subject);
  const isAuto =
    !isBounce &&
    ((h("auto-submitted") !== "" && h("auto-submitted") !== "no") ||
      h("x-autoreply") !== "" ||
      h("x-autorespond") !== "" ||
      /auto_reply|auto-reply/.test(h("precedence")) ||
      /^(automatic reply|auto(matic)?[- ]?reply|autoreply|out of (the )?office|ooo\b|abwesenheit|absence)/i.test(subject));

  let bounced: string[] = [];
  let bounceType: IncomingMail["bounceType"];
  let bounceReason: string | undefined;
  if (isBounce) {
    const finals = [...raw.matchAll(/(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s>]+)>?/gi)].map((m) => m[1]!.toLowerCase());
    bounced = [...new Set(finals.length ? finals : (p.text ?? "").match(EMAIL_IN_TEXT)?.map((e) => e.toLowerCase()) ?? [])];
    ({ bounceType, bounceReason } = classifyBounce(raw, p.text ?? ""));
  }
  const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : [];
  return {
    uid,
    messageId: p.messageId ?? null,
    fromEmail,
    fromName: from?.name || null,
    subject,
    date: p.date ?? new Date(),
    text: isBounce ? (p.text ?? "").trim().slice(0, 4000) : stripQuoted(p.text ?? ""),
    inReplyTo: p.inReplyTo ?? null,
    references: refs,
    kind: isBounce ? "BOUNCE" : isAuto ? "AUTO_REPLY" : "REPLY",
    bounced,
    ...(isBounce && { bounceType, bounceReason }),
  };
}

const SPAM_DAYS = 3;

export const realMailboxReader: MailboxReader = {
  async read(l, cursor, since, fromLead) {
    await checkMailHost(l.imapHost);
    const c = new ImapFlow({
      host: l.imapHost,
      port: l.imapPort,
      secure: l.imapPort === 993,
      auth: { user: l.username, pass: l.password },
      logger: false,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });
    c.on("error", () => undefined);
    await c.connect();
    try {
      let result: { uidValidity: bigint; uidNext: number; messages: IncomingMail[] };
      const lock = await c.getMailboxLock("INBOX");
      try {
        const box = c.mailbox as { uidValidity: bigint; uidNext: number };
        const fresh = cursor.uidValidity !== null && cursor.uidNext !== null && BigInt(cursor.uidValidity) === BigInt(box.uidValidity);
        let uids: number[];
        if (fresh) {
          if (cursor.uidNext! >= box.uidNext) uids = [];
          else uids = ((await c.search({ uid: `${cursor.uidNext}:*` }, { uid: true })) || []).filter((u) => u >= cursor.uidNext!);
        } else {
          uids = (await c.search({ since }, { uid: true })) || [];
        }
        uids = uids.sort((a, b) => a - b).slice(0, MAX_PER_READ);
        const messages: IncomingMail[] = [];
        if (uids.length) {
          for await (const m of c.fetch(uids, { uid: true, source: true }, { uid: true })) {
            try {
              messages.push(await parseIncoming(m.source, m.uid));
            } catch {
              // An unreadable message is skipped, not fatal.
            }
          }
        }
        const last = uids.length ? uids[uids.length - 1]! + 1 : box.uidNext;
        result = { uidValidity: BigInt(box.uidValidity), uidNext: uids.length === MAX_PER_READ ? last : Math.max(last, box.uidNext), messages };
      } finally {
        lock.release();
      }
      if (fromLead) result.messages.push(...(await readSpam(c, fromLead)));
      return result;
    } finally {
      await c.logout().catch(() => c.close());
    }
  },
};

/** Leads' messages that landed in the spam folder in the last few days: read them and move them to the inbox. */
async function readSpam(c: ImapFlow, fromLead: (e: SpamEnvelope) => boolean | Promise<boolean>): Promise<IncomingMail[]> {
  const { junk } = warmupFolders(await c.list());
  if (!junk) return [];
  const lock = await c.getMailboxLock(junk);
  const out: IncomingMail[] = [];
  try {
    const recent = ((await c.search({ since: new Date(Date.now() - SPAM_DAYS * 86_400_000) }, { uid: true })) || []).sort((a, b) => b - a).slice(0, MAX_PER_READ);
    if (!recent.length) return [];
    const wanted: number[] = [];
    for await (const m of c.fetch(recent, { uid: true, envelope: true }, { uid: true })) {
      const env = m.envelope;
      const e: SpamEnvelope = { messageId: env?.messageId ?? null, fromEmail: (env?.from?.[0]?.address ?? "").toLowerCase(), inReplyTo: env?.inReplyTo ?? null };
      if (await fromLead(e)) wanted.push(m.uid);
    }
    if (!wanted.length) return [];
    for await (const m of c.fetch(wanted, { uid: true, source: true }, { uid: true })) {
      try {
        out.push({ ...(await parseIncoming(m.source, m.uid)), fromSpam: true });
      } catch {
        // skip unreadable
      }
    }
    await c.messageMove(wanted, "INBOX", { uid: true }).catch(() => undefined);
  } finally {
    lock.release();
  }
  return out;
}
