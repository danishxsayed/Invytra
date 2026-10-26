import type { SessionTaskContext } from "../browser/types.js";
import type { ActionOutcome } from "./actions.js";
import { sendMessage } from "./actions.js";
import { humanClick, humanPause, humanType } from "./human.js";
import { SELECTORS } from "./selectors.js";

/**
 * Reply in an existing conversation, the way a person would: open Messaging,
 * click the conversation with that name, type, send, and check the text shows
 * in the thread. If the conversation isn't in the recent list and we know the
 * person's profile, message them from their profile instead.
 */
export async function sendReply(
  ctx: SessionTaskContext,
  name: string,
  text: string,
  profileUrl?: string | null,
): Promise<ActionOutcome<{ name: string; via: "inbox" | "profile" }>> {
  const body = text.trim();
  if (!body) throw new Error("Reply text is empty");
  const { page } = ctx;
  await page.goto(new URL(SELECTORS.inbox.path, ctx.baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await humanPause(page, 2000, 3500);
  await ctx.assertHealthy();

  const list = page.getByRole("list", { name: SELECTORS.inbox.conversationList }).first();
  await list.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  const item = list
    .locator(":scope > li")
    .filter({ has: page.locator(SELECTORS.inbox.participantName, { hasText: new RegExp(`^\\s*${escape(name)}\\s*$`, "i") }) })
    .first();

  if ((await item.count()) === 0) {
    if (profileUrl) {
      const r = await sendMessage(ctx, profileUrl, body);
      if (r.outcome === "SKIPPED") return { outcome: "SKIPPED", reason: r.reason };
      return { outcome: "DONE", data: { name: r.data.name, via: "profile" } };
    }
    throw new Error(`The conversation with ${name} isn't in the recent messages list. Reply on LinkedIn instead.`);
  }

  await humanClick(page, item.locator(SELECTORS.inbox.participantName).first());
  const box = page.locator(SELECTORS.inbox.composeBox).filter({ visible: true }).last();
  await box.waitFor({ state: "visible", timeout: 15_000 });
  await humanPause(page, 800, 1600);
  await humanType(page, box, body);
  await humanPause(page, 500, 1200);
  await humanClick(page, page.getByRole("button", { name: SELECTORS.inbox.sendButton }).filter({ visible: true }).last());
  await humanPause(page, 1500, 2500);
  await ctx.assertHealthy();

  const probe = body.split("\n")[0]!.slice(0, 40);
  if ((await page.getByText(probe, { exact: false }).filter({ visible: true }).count()) === 0) {
    throw new Error(`The reply to ${name} was not confirmed in the conversation`);
  }
  return { outcome: "DONE", data: { name, via: "inbox" } };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
