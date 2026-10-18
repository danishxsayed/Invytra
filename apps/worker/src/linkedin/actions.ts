import { CONNECTION_NOTE_MAX_CHARS } from "@invytra/shared";
import { createHash } from "node:crypto";
import type { SessionTaskContext } from "../browser/types.js";
import { humanBrowse, humanClick, humanPause, humanType } from "./human.js";
import {
  connectControl,
  connectMenuItem,
  control,
  normalizeProfileUrl,
  readProfile,
  topCard,
  type ConnectionStatus,
  type ProfileInfo,
} from "./profile.js";
import { INVITE_BLOCK_MARKERS, SELECTORS } from "./selectors.js";

export type ActionOutcome<T = Record<string, unknown>> =
  | { outcome: "DONE"; data: T }
  | { outcome: "SKIPPED"; reason: string; data?: T };

/** LinkedIn says this account has used up its weekly invitations. Stop sending invites. */
export class InviteLimitReachedError extends Error {
  constructor() {
    super("LinkedIn weekly invitation limit reached");
    this.name = "InviteLimitReachedError";
  }
}

async function openProfile(ctx: SessionTaskContext, profileUrl: string, browse: boolean): Promise<ProfileInfo> {
  const url = normalizeProfileUrl(profileUrl, ctx.baseUrl);
  await ctx.page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(ctx.page, 1500, 3500);
  await ctx.assertHealthy();
  if (browse) await humanBrowse(ctx.page);
  return readProfile(ctx.page);
}

async function pageMentions(ctx: SessionTaskContext, markers: readonly string[]): Promise<boolean> {
  const text = (await ctx.page.evaluate(() => document.body?.innerText ?? "")).toLowerCase();
  return markers.some((m) => text.includes(m));
}

/** 1. Visit a profile like a person would (scroll, pause) and read the header. */
export async function visitProfile(ctx: SessionTaskContext, profileUrl: string): Promise<ActionOutcome<ProfileInfo>> {
  const info = await openProfile(ctx, profileUrl, true);
  if (info.status === "UNAVAILABLE") return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE", data: info };
  return { outcome: "DONE", data: info };
}

/** 3. Read the connection status without scrolling. */
export async function checkConnectionStatus(
  ctx: SessionTaskContext,
  profileUrl: string,
): Promise<ActionOutcome<{ status: ConnectionStatus; name: string }>> {
  const info = await openProfile(ctx, profileUrl, false);
  return { outcome: "DONE", data: { status: info.status, name: info.name } };
}

/** 2. Send a connection request, optionally with a note (max 300 characters). */
export async function sendConnectionRequest(
  ctx: SessionTaskContext,
  profileUrl: string,
  note?: string,
): Promise<ActionOutcome<{ name: string; withNote: boolean }>> {
  const trimmedNote = note?.trim() || undefined;
  if (trimmedNote && trimmedNote.length > CONNECTION_NOTE_MAX_CHARS) {
    throw new Error(`Note is ${trimmedNote.length} characters; LinkedIn allows ${CONNECTION_NOTE_MAX_CHARS}`);
  }
  const { page } = ctx;
  const info = await openProfile(ctx, profileUrl, true);
  const data = { name: info.name, withNote: Boolean(trimmedNote) };
  if (info.status !== "NOT_CONNECTED") return { outcome: "SKIPPED", reason: info.status, data };

  let connect = connectControl(page, info.name);
  if ((await connect.count()) === 0) {
    const more = control(topCard(page), SELECTORS.profile.moreButton).first();
    if ((await more.count()) === 0) return { outcome: "SKIPPED", reason: "CONNECT_NOT_AVAILABLE", data };
    await humanClick(page, more);
    await humanPause(page, 500, 1200);
    connect = connectControl(page, info.name).or(connectMenuItem(page, info.name));
    if ((await connect.count()) === 0) {
      await page.keyboard.press("Escape");
      return { outcome: "SKIPPED", reason: "CONNECT_NOT_AVAILABLE", data };
    }
  }
  await humanClick(page, connect.first());

  // After Connect, LinkedIn shows a dialog — or (on some accounts) sends straight away.
  const dialog = page.locator(SELECTORS.invite.dialog).filter({ visible: true }).last();
  const deadline = Date.now() + 12_000;
  let sentWithoutDialog = false;
  for (;;) {
    if (await pageMentions(ctx, INVITE_BLOCK_MARKERS.weeklyLimit)) throw new InviteLimitReachedError();
    if (await pageMentions(ctx, INVITE_BLOCK_MARKERS.emailRequired)) {
      await page.keyboard.press("Escape");
      return { outcome: "SKIPPED", reason: "EMAIL_REQUIRED", data };
    }
    if ((await dialog.count()) > 0) break;
    if ((await readProfile(page)).status === "PENDING") {
      sentWithoutDialog = true;
      break;
    }
    if (Date.now() > deadline) throw new Error("No invitation dialog appeared after clicking Connect");
    await page.waitForTimeout(500);
  }

  if (sentWithoutDialog) data.withNote = false; // LinkedIn sent it without offering a note
  if (!sentWithoutDialog) {
    await humanPause(page, 600, 1400);
    const button = (name: RegExp) =>
      dialog.getByRole("button", { name }).or(dialog.getByRole("link", { name })).filter({ visible: true });
    if (trimmedNote) {
      await humanClick(page, button(SELECTORS.invite.addNoteButton).first());
      await humanPause(page, 500, 1200);
      const box = page.locator(SELECTORS.invite.dialog).filter({ visible: true }).last()
        .locator(SELECTORS.invite.noteTextarea).filter({ visible: true }).first();
      await humanType(page, box, trimmedNote);
      await humanPause(page, 600, 1500);
      await humanClick(page, button(SELECTORS.invite.sendButton).first());
    } else {
      const withoutNote = button(SELECTORS.invite.sendWithoutNoteButton);
      const send = (await withoutNote.count()) > 0 ? withoutNote : button(SELECTORS.invite.sendButton);
      await humanClick(page, send.first());
    }
    await humanPause(page, 1500, 3000);
  }

  if (await pageMentions(ctx, INVITE_BLOCK_MARKERS.weeklyLimit)) throw new InviteLimitReachedError();
  await ctx.assertHealthy();

  const after = await readProfile(page);
  if (after.status !== "PENDING") {
    throw new Error(`Invitation to ${info.name} was not confirmed (status after sending: ${after.status})`);
  }
  return { outcome: "DONE", data };
}

/** 4. Send a message to a 1st-degree connection. */
export async function sendMessage(
  ctx: SessionTaskContext,
  profileUrl: string,
  text: string,
): Promise<ActionOutcome<{ name: string }>> {
  const body = text.trim();
  if (!body) throw new Error("Message text is empty");
  const { page } = ctx;
  const info = await openProfile(ctx, profileUrl, false);
  if (info.status !== "CONNECTED") return { outcome: "SKIPPED", reason: `NOT_CONNECTED (${info.status})`, data: { name: info.name } };

  await humanClick(page, control(topCard(page), SELECTORS.profile.messageControl).first());
  const box = page.locator(SELECTORS.message.composeBox).filter({ visible: true }).last();
  await box.waitFor({ state: "visible", timeout: 15_000 });
  await humanPause(page, 800, 1800);
  await humanType(page, box, body);
  await humanPause(page, 600, 1500);

  const send = page.getByRole("button", { name: SELECTORS.message.sendButton }).filter({ visible: true }).last();
  await humanClick(page, send);
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();

  // Confirm the text now appears in the conversation
  const probe = body.slice(0, 40);
  const shown = await page.getByText(probe, { exact: false }).filter({ visible: true }).count();
  if (shown === 0) throw new Error(`Message to ${info.name} was not confirmed in the conversation`);

  const close = page.getByRole("button", { name: SELECTORS.message.closeConversation }).filter({ visible: true });
  if ((await close.count()) > 0) await humanClick(page, close.first());
  return { outcome: "DONE", data: { name: info.name } };
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
}

/** 5. Read the conversation list and return the latest snippet of each thread. */
export async function fetchInbox(ctx: SessionTaskContext, limit = 20): Promise<ActionOutcome<{ threads: InboxThread[] }>> {
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
  return { outcome: "DONE", data: { threads } };
}

/** Snippets that are our own sent messages, not replies. */
export function isOwnMessage(snippet: string): boolean {
  return /^you:/i.test(snippet.trim());
}
