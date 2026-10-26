import { createHash } from "node:crypto";
import type { SessionTaskContext } from "../browser/types.js";
import { humanClick, humanPause } from "./human.js";
import { SELECTORS } from "./selectors.js";
import type { ActionOutcome } from "./actions.js";

export interface ThreadMessage {
  fromMe: boolean;
  text: string;
  /** What LinkedIn shows above the message, e.g. "Oct 18" and "12:15 PM". */
  dateLabel: string;
  timeLabel: string;
}

export interface InboxThread {
  /** LinkedIn's 2026 inbox has no thread links, so threads are keyed by participant name. */
  threadId: string;
  name: string;
  snippet: string;
  timeText: string;
  unread: boolean;
  /** Stable id for this snippet, used to store each new message once. */
  messageKey: string;
  /** The conversation's messages, when it was opened this time (it was new or changed). */
  messages?: ThreadMessage[];
}

export interface InboxOptions {
  /** Conversations to look at, newest first. */
  limit?: number;
  /** Latest snippet key per participant from the last check; changed or new ones are opened. */
  known?: Record<string, string>;
  /** Open at most this many conversations per check (each one counts as reading it on LinkedIn). */
  maxOpen?: number;
}

/**
 * 5. Read the conversation list, then open the conversations that are new,
 * unread or changed since the last check (up to maxOpen) and read their messages.
 */
export async function fetchInbox(ctx: SessionTaskContext, opts: InboxOptions | number = {}): Promise<ActionOutcome<{ threads: InboxThread[] }>> {
  const { limit = 30, known, maxOpen = 10 } = typeof opts === "number" ? { limit: opts } : opts;
  const { page } = ctx;
  await page.goto(new URL(SELECTORS.inbox.path, ctx.baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await humanPause(page, 2500, 4500);
  await ctx.assertHealthy();

  const list = page.getByRole("list", { name: SELECTORS.inbox.conversationList }).first();
  try {
    await list.waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    return { outcome: "DONE", data: { threads: [] } };
  }

  // No named helper functions in here: this runs inside the browser page, and tsx
  // wraps named functions with a `__name` helper the page does not have.
  const raw = await list.locator(":scope > li").evaluateAll(
    (items, sel) =>
      items.map((item) => {
        const [name, snippet, timeText] = [sel.participantName, sel.snippet, sel.timestamp].map((s) =>
          (item.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim(),
        );
        return {
          name: name ?? "",
          snippet: snippet ?? "",
          timeText: timeText ?? "",
          text: ((item as HTMLElement).innerText ?? item.textContent ?? "").replace(/\s+/g, " "),
        };
      }),
    { participantName: SELECTORS.inbox.participantName, snippet: SELECTORS.inbox.snippet, timestamp: SELECTORS.inbox.timestamp },
  );

  const threads: InboxThread[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r.name || SELECTORS.inbox.sponsoredPrefix.test(r.snippet) || seen.has(r.name)) continue;
    seen.add(r.name);
    threads.push({
      threadId: r.name,
      name: r.name,
      snippet: r.snippet,
      timeText: r.timeText,
      unread: SELECTORS.inbox.unreadText.test(r.text),
      messageKey: `${createHash("sha1").update(`${r.name}\n${r.snippet}`).digest("hex").slice(0, 24)}`,
    });
    if (threads.length >= limit) break;
  }

  if (known) {
    const changed = threads.filter((t) => t.unread || known[t.name] !== t.messageKey).slice(0, maxOpen);
    for (const t of changed) {
      try {
        t.messages = await readThread(ctx, t.name);
      } catch {
        // Couldn't open this one; its snippet is still stored. Try again next time.
      }
    }
  }
  return { outcome: "DONE", data: { threads } };
}

/** Opens one conversation from the list and reads its messages, oldest first. */
async function readThread(ctx: SessionTaskContext, name: string): Promise<ThreadMessage[]> {
  const { page } = ctx;
  const list = page.getByRole("list", { name: SELECTORS.inbox.conversationList }).first();
  const heading = list.locator(SELECTORS.inbox.participantName).filter({ hasText: new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, "i") }).first();
  if ((await heading.count()) === 0) return [];
  await humanClick(page, heading);
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();
  await page.locator(SELECTORS.inbox.threadMessage).first().waitFor({ state: "attached", timeout: 10_000 });

  const read = await page.locator(SELECTORS.inbox.threadEvent).evaluateAll(
    (events, sel) => {
      const out: { fromMe: boolean; text: string; dateLabel: string; timeLabel: string }[] = [];
      let date = "";
      let time = "";
      for (const ev of events) {
        const d = ev.querySelector(sel.date);
        if (d) date = (d.textContent ?? "").replace(/\s+/g, " ").trim();
        const t = ev.querySelector(sel.time);
        if (t) time = (t.textContent ?? "").replace(/\s+/g, " ").trim();
        for (const m of Array.from(ev.querySelectorAll(sel.message))) {
          const body = (m.querySelector(sel.body)?.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
          if (!body) continue;
          out.push({ fromMe: !m.classList.contains(sel.other), text: body, dateLabel: date, timeLabel: time });
        }
      }
      return out;
    },
    {
      date: SELECTORS.inbox.threadDate,
      time: SELECTORS.inbox.threadTime,
      message: SELECTORS.inbox.threadMessage,
      body: SELECTORS.inbox.threadBody,
      other: SELECTORS.inbox.threadOtherClass,
    },
  );
  return read.slice(-40);
}

/** Snippets that are our own sent messages, not replies. */
export function isOwnMessage(snippet: string): boolean {
  return /^you:/i.test(snippet.trim());
}

/** The message text of a list snippet, without the "Carol:" / "You:" prefix. */
export function snippetBody(name: string, snippet: string): string {
  const s = snippet.trim();
  const m = /^([^:]{1,60}):\s+([\s\S]*)$/.exec(s);
  if (!m) return s;
  // LinkedIn prefixes the sender: "You:", their first name, or a longer start of their name ("Mohammed Tahur:").
  const who = m[1]!.trim().replace(/\s+/g, " ").toLowerCase();
  const full = name.trim().replace(/\s+/g, " ").toLowerCase();
  return who === "you" || full === who || full.startsWith(`${who} `) ? m[2]!.trim() : s;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
