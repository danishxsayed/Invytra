import { fillTemplate, type Audience, type TemplateVars } from "@invytra/shared";
import type { SessionTaskContext } from "../browser/types.js";
import type { ActionOutcome, ProfileFacts } from "./actions.js";
import { openProfile, outsideAudience } from "./actions.js";
import { humanBrowse, humanClick, humanPause, humanType } from "./human.js";
import { control, escapeRegex, normalizeProfileUrl, readProfile, topCard } from "./profile.js";
import { SELECTORS } from "./selectors.js";

/** Like the person's most recent post (their activity page, newest first). */
export async function likeLatestPost(ctx: SessionTaskContext, profileUrl: string, audience?: Audience): Promise<ActionOutcome<{ liked: boolean } & ProfileFacts>> {
  const { page } = ctx;
  // First contact in a campaign with an audience: look at their profile card before liking anything.
  let facts: ProfileFacts = {};
  if (audience) {
    const info = await openProfile(ctx, profileUrl, false);
    if (info.status === "UNAVAILABLE") return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
    facts = { degree: info.degree, premium: info.premium };
    const outside = outsideAudience(audience, info);
    if (outside) return { outcome: "SKIPPED", reason: outside, data: { liked: false, ...facts } };
  }
  const url = new URL(SELECTORS.activity.path, normalizeProfileUrl(profileUrl, ctx.baseUrl)).toString();
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(page, 2000, 4000);
  await ctx.assertHealthy();
  if (res && res.status() === 404) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
  await humanBrowse(page);

  const posts = page.locator(SELECTORS.activity.post).filter({ visible: true }).filter({ has: page.getByRole("button", { name: SELECTORS.activity.likeButton }) });
  if ((await posts.count()) === 0) {
    return { outcome: "SKIPPED", reason: "NO_POSTS", data: { liked: false, ...facts } };
  }
  const like = posts.first().getByRole("button", { name: SELECTORS.activity.likeButton }).filter({ visible: true }).first();
  if ((await like.getAttribute("aria-pressed")) === "true") return { outcome: "SKIPPED", reason: "ALREADY_LIKED", data: { liked: false, ...facts } };
  await humanPause(page, 800, 2000);
  await humanClick(page, like);
  await humanPause(page, 1200, 2500);
  await ctx.assertHealthy();
  const pressed = await like.getAttribute("aria-pressed");
  if (pressed === "false") throw new Error("The like didn't register");
  return { outcome: "DONE", data: { liked: true, ...facts } };
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

/** Follow the person's profile (they get a notification; their posts show in your feed). */
export async function followProfile(ctx: SessionTaskContext, profileUrl: string, audience?: Audience): Promise<ActionOutcome<{ followed: boolean } & ProfileFacts>> {
  const { page } = ctx;
  const info = await openProfile(ctx, profileUrl, true);
  if (info.status === "UNAVAILABLE") return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
  const data = { followed: false, degree: info.degree, premium: info.premium };
  const outside = outsideAudience(audience, info);
  if (outside) return { outcome: "SKIPPED", reason: outside, data };

  const card = topCard(page);
  const following = () => control(card, SELECTORS.follow.done).or(page.getByRole("menuitem", { name: SELECTORS.follow.done }).filter({ visible: true }));
  if ((await control(card, SELECTORS.follow.done).count()) > 0) return { outcome: "SKIPPED", reason: "ALREADY_FOLLOWING", data };

  let follow = control(card, SELECTORS.follow.control);
  if ((await follow.count()) === 0) {
    // Not on the card: it's under More.
    await humanClick(page, control(card, SELECTORS.profile.moreButton).first());
    await humanPause(page, 500, 1200);
    if ((await page.getByRole("menuitem", { name: SELECTORS.follow.done }).filter({ visible: true }).count()) > 0) {
      await page.keyboard.press("Escape");
      return { outcome: "SKIPPED", reason: "ALREADY_FOLLOWING", data };
    }
    follow = page.getByRole("menuitem", { name: SELECTORS.follow.control }).filter({ visible: true });
  }
  if ((await follow.count()) === 0) return { outcome: "SKIPPED", reason: "FOLLOW_NOT_AVAILABLE", data };
  await humanPause(page, 600, 1500);
  await humanClick(page, follow.first());
  await humanPause(page, 1200, 2500);
  await ctx.assertHealthy();
  if ((await following().count()) === 0) {
    // The menu closes after a click; look on the card and in the menu again.
    const more = control(card, SELECTORS.profile.moreButton);
    if ((await control(card, SELECTORS.follow.done).count()) === 0 && (await more.count()) > 0) {
      await humanClick(page, more.first());
      await humanPause(page, 400, 900);
      const ok = (await page.getByRole("menuitem", { name: SELECTORS.follow.done }).filter({ visible: true }).count()) > 0;
      await page.keyboard.press("Escape");
      if (!ok) throw new Error(`Following ${info.name} wasn't confirmed`);
    }
  }
  return { outcome: "DONE", data: { ...data, followed: true } };
}

/**
 * Like their latest post (if not liked yet) and leave a comment on it. Placeholders like
 * {firstName} are filled in; a comment that can't be filled is never posted.
 */
export async function commentOnLatestPost(
  ctx: SessionTaskContext,
  profileUrl: string,
  text: string,
  vars: TemplateVars = {},
  audience?: Audience,
): Promise<ActionOutcome<{ commented: boolean; liked: boolean } & ProfileFacts>> {
  const { page } = ctx;
  let facts: ProfileFacts = {};
  if (audience) {
    const info = await openProfile(ctx, profileUrl, false);
    if (info.status === "UNAVAILABLE") return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
    facts = { degree: info.degree, premium: info.premium };
    const outside = outsideAudience(audience, info);
    if (outside) return { outcome: "SKIPPED", reason: outside, data: { commented: false, liked: false, ...facts } };
  }
  const filled = fillTemplate(text.trim(), vars, [vars.firstName, vars.lastName].filter(Boolean).join(" "));
  if (!filled) return { outcome: "SKIPPED", reason: "MISSING_DETAIL", data: { commented: false, liked: false, ...facts } };

  const url = new URL(SELECTORS.activity.path, normalizeProfileUrl(profileUrl, ctx.baseUrl)).toString();
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(page, 2000, 4000);
  await ctx.assertHealthy();
  if (res && res.status() === 404) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
  await humanBrowse(page);

  const posts = page.locator(SELECTORS.activity.post).filter({ visible: true }).filter({ has: page.getByRole("button", { name: SELECTORS.activity.likeButton }) });
  if ((await posts.count()) === 0) return { outcome: "SKIPPED", reason: "NO_POSTS", data: { commented: false, liked: false, ...facts } };
  const post = posts.first();

  // Like it first (a comment without a like looks odd).
  let liked = false;
  const like = post.getByRole("button", { name: SELECTORS.activity.likeButton }).filter({ visible: true }).first();
  if ((await like.getAttribute("aria-pressed")) !== "true") {
    await humanPause(page, 800, 1800);
    await humanClick(page, like);
    await humanPause(page, 1000, 2000);
    liked = (await like.getAttribute("aria-pressed")) === "true";
  }

  const open = post.getByRole("button", { name: SELECTORS.comment.openButton }).filter({ visible: true }).first();
  if ((await open.count()) === 0) return { outcome: "SKIPPED", reason: "COMMENT_NOT_AVAILABLE", data: { commented: false, liked, ...facts } };
  await humanClick(page, open);
  await humanPause(page, 1000, 2000);
  const box = post.locator(SELECTORS.comment.box).filter({ visible: true }).first();
  await box.waitFor({ state: "visible", timeout: 10_000 });
  await humanType(page, box, filled);
  await humanPause(page, 800, 1800);
  const submit = post.getByRole("button", { name: SELECTORS.comment.submit }).filter({ visible: true }).last();
  await humanClick(page, submit);
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();
  const probe = filled.slice(0, 40);
  if ((await post.getByText(probe, { exact: false }).filter({ visible: true }).count()) === 0) throw new Error("The comment wasn't confirmed under the post");
  return { outcome: "DONE", data: { commented: true, liked, ...facts } };
}

/**
 * Invite a connection to one of your LinkedIn events: open the event, "Invite", search the
 * person's name among your connections, tick them and send. Only connections can be invited.
 */
export async function inviteToEvent(ctx: SessionTaskContext, eventUrl: string, name: string): Promise<ActionOutcome<{ invited: boolean }>> {
  const { page } = ctx;
  const who = name.trim();
  if (!who) return { outcome: "SKIPPED", reason: "NO_NAME" };
  const target = new URL(eventUrl);
  const res = await page.goto(new URL(target.pathname, ctx.baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();
  const text = (await page.evaluate(() => document.body?.innerText ?? "")).toLowerCase();
  if ((res && res.status() === 404) || SELECTORS.event.missingMarkers.some((m) => text.includes(m))) return { outcome: "SKIPPED", reason: "EVENT_NOT_FOUND" };

  const invite = page.getByRole("button", { name: SELECTORS.event.inviteButton }).filter({ visible: true }).first();
  if ((await invite.count()) === 0) return { outcome: "SKIPPED", reason: "EVENT_NO_INVITE" };
  await humanClick(page, invite);
  await humanPause(page, 1000, 2000);
  const dialog = page.locator('[role="dialog"], dialog[open]').filter({ visible: true }).last();
  await dialog.waitFor({ state: "visible", timeout: 10_000 });

  const search = dialog.getByRole("textbox").or(dialog.getByRole("searchbox")).or(dialog.getByPlaceholder(SELECTORS.event.search)).first();
  await humanType(page, search, who);
  await humanPause(page, 1500, 3000);

  // One result row per connection; checkbox (or the row itself) picks them.
  const row = dialog.locator("li, [role='option']").filter({ hasText: new RegExp(escapeRegex(who), "i") });
  if ((await row.count()) === 0) {
    await page.keyboard.press("Escape");
    return { outcome: "SKIPPED", reason: "NOT_IN_CONNECTIONS" };
  }
  const pick = row.first();
  const box = pick.getByRole("checkbox").first();
  if (((await box.count()) > 0 && (await box.isDisabled())) || SELECTORS.event.alreadyInvited.test((await pick.innerText()).replace(who, ""))) {
    await page.keyboard.press("Escape");
    return { outcome: "SKIPPED", reason: "ALREADY_INVITED" };
  }
  await humanClick(page, (await box.count()) > 0 ? box : pick);
  await humanPause(page, 800, 1600);
  const send = dialog.getByRole("button", { name: SELECTORS.event.send }).filter({ visible: true }).last();
  if (await send.isDisabled()) throw new Error("The event invite button stayed disabled after picking the person");
  await humanClick(page, send);
  await humanPause(page, 1500, 3000);
  await ctx.assertHealthy();
  if (await dialog.isVisible().catch(() => false)) throw new Error("The event invite wasn't confirmed (dialog still open)");
  return { outcome: "DONE", data: { invited: true } };
}

