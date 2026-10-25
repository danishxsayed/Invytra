import type { SessionTaskContext } from "../browser/types.js";
import type { ActionOutcome } from "./actions.js";
import { openProfile } from "./actions.js";
import { humanBrowse, humanClick, humanPause } from "./human.js";
import { control, normalizeProfileUrl, readProfile, topCard } from "./profile.js";
import { SELECTORS } from "./selectors.js";

/** Like the person's most recent post (their activity page, newest first). */
export async function likeLatestPost(ctx: SessionTaskContext, profileUrl: string): Promise<ActionOutcome<{ liked: boolean }>> {
  const { page } = ctx;
  const url = new URL(SELECTORS.activity.path, normalizeProfileUrl(profileUrl, ctx.baseUrl)).toString();
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(page, 2000, 4000);
  await ctx.assertHealthy();
  if (res && res.status() === 404) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
  await humanBrowse(page);

  const posts = page.locator(SELECTORS.activity.post).filter({ visible: true }).filter({ has: page.getByRole("button", { name: SELECTORS.activity.likeButton }) });
  if ((await posts.count()) === 0) {
    return { outcome: "SKIPPED", reason: "NO_POSTS" };
  }
  const like = posts.first().getByRole("button", { name: SELECTORS.activity.likeButton }).filter({ visible: true }).first();
  if ((await like.getAttribute("aria-pressed")) === "true") return { outcome: "SKIPPED", reason: "ALREADY_LIKED" };
  await humanPause(page, 800, 2000);
  await humanClick(page, like);
  await humanPause(page, 1200, 2500);
  await ctx.assertHealthy();
  const pressed = await like.getAttribute("aria-pressed");
  if (pressed === "false") throw new Error("The like didn't register");
  return { outcome: "DONE", data: { liked: true } };
}

/** Withdraw a pending invitation from the person's profile. */
export async function withdrawInvite(ctx: SessionTaskContext, profileUrl: string): Promise<ActionOutcome<{ name: string }>> {
  const { page } = ctx;
  const info = await openProfile(ctx, profileUrl, false);
  const data = { name: info.name };
  if (info.status === "UNAVAILABLE") return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE", data };
  if (info.status === "CONNECTED") return { outcome: "SKIPPED", reason: "CONNECTED", data };
  if (info.status === "NOT_CONNECTED") return { outcome: "SKIPPED", reason: "NOT_PENDING", data };

  const card = topCard(page);
  const dialog = () => page.locator(SELECTORS.invite.dialog).filter({ visible: true }).filter({ hasText: SELECTORS.withdraw.dialogText }).last();
  const pending = card.getByLabel(SELECTORS.profile.pendingLabel).filter({ visible: true }).or(control(card, SELECTORS.profile.pendingText));
  await humanPause(page, 800, 1800);
  await humanClick(page, pending.first());
  await humanPause(page, 700, 1500);
  if ((await dialog().count()) === 0) {
    // Newer layout: "Withdraw invitation" sits in a menu (under Pending or More).
    let item = page.getByRole("menuitem", { name: SELECTORS.withdraw.menuItem }).filter({ visible: true });
    if ((await item.count()) === 0) {
      await humanClick(page, control(card, SELECTORS.profile.moreButton).first());
      await humanPause(page, 500, 1200);
      item = page.getByRole("menuitem", { name: SELECTORS.withdraw.menuItem }).filter({ visible: true });
    }
    if ((await item.count()) === 0) throw new Error("No way to withdraw the invitation was found");
    await humanClick(page, item.first());
    await humanPause(page, 700, 1500);
  }
  const confirm = dialog().getByRole("button", { name: SELECTORS.withdraw.confirmButton }).filter({ visible: true });
  if ((await confirm.count()) > 0) await humanClick(page, confirm.first());
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();
  const after = await readProfile(page);
  if (after.status === "PENDING") throw new Error(`The invitation to ${info.name} still shows as pending`);
  return { outcome: "DONE", data };
}
