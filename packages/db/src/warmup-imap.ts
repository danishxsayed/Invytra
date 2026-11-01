import { ImapFlow } from "imapflow";
import { checkMailHost, type MailboxLogin } from "./mailbox.js";

/*
 * The receiving side of warm-up: find a warm-up email by its code in the inbox or in spam,
 * mark it read and move it to an "Invytra Warmup" folder, so moving it out of spam teaches
 * the provider it isn't spam and the customer's inbox stays clean.
 */

export type Landing = "INBOX" | "SPAM";

export interface WarmupInboxSession {
  /** Where the email with this code was found (and filed away), or null if not there yet. */
  handle(code: string): Promise<Landing | null>;
  close(): Promise<void>;
}

export interface WarmupInbox {
  open(login: MailboxLogin): Promise<WarmupInboxSession>;
}

export const WARMUP_FOLDER = "Invytra Warmup";
const TIMEOUT_MS = 20_000;

interface ListEntry {
  path: string;
  name: string;
  delimiter?: string;
  specialUse?: string;
}

/** The spam folder, and the path to use for the warm-up folder, from the mailbox's folder list. */
export function warmupFolders(list: ListEntry[]): { junk: string | null; warm: string; exists: boolean } {
  const junk = list.find((f) => f.specialUse === "\\Junk") ?? list.find((f) => /^(spam|junk|junk e-?mail|bulk mail)$/i.test(f.name));
  const found = list.find((f) => f.name === WARMUP_FOLDER);
  if (found) return { junk: junk?.path ?? null, warm: found.path, exists: true };
  // Servers that keep every folder under INBOX (INBOX.Sent, INBOX.Spam …) need the same here.
  const d = list.find((f) => f.delimiter)?.delimiter ?? "/";
  const underInbox = list.filter((f) => f.path.toUpperCase() !== "INBOX").every((f) => f.path.toUpperCase().startsWith(`INBOX${d}`)) && list.length > 1;
  return { junk: junk?.path ?? null, warm: underInbox ? `INBOX${d}${WARMUP_FOLDER}` : WARMUP_FOLDER, exists: false };
}

export const realWarmupInbox: WarmupInbox = {
  async open(l) {
    await checkMailHost(l.imapHost);
    const c = new ImapFlow({
      host: l.imapHost,
      port: l.imapPort,
      secure: l.imapPort === 993,
      auth: { user: l.username, pass: l.password },
      logger: false,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: 60_000,
    });
    c.on("error", () => undefined);
    await c.connect();
    const folders = warmupFolders((await c.list()) as ListEntry[]);
    let warm: string | null = folders.warm;
    if (!folders.exists) {
      try {
        await c.mailboxCreate(folders.warm);
      } catch (e) {
        if (!/exist/i.test(String((e as Error)?.message) + String((e as { responseText?: string })?.responseText))) warm = null;
      }
    }
    const places: [string, Landing][] = [["INBOX", "INBOX"], ...(folders.junk ? [[folders.junk, "SPAM"] as [string, Landing]] : [])];

    return {
      async handle(code) {
        for (const [path, landing] of places) {
          const lock = await c.getMailboxLock(path);
          try {
            const uids = await c.search({ body: code }, { uid: true });
            if (!uids || uids.length === 0) continue;
            await c.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
            await c.messageMove(uids, warm ?? "INBOX", { uid: true });
            return landing;
          } finally {
            lock.release();
          }
        }
        return null;
      },
      async close() {
        await c.logout().catch(() => c.close());
      },
    };
  },
};
