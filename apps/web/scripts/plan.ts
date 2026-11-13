/**
 * Team tool for plans that aren't bought on the pricing page.
 *   pnpm plan:set you@company.com                         shows the workspace's plan
 *   pnpm plan:set you@company.com vip --channels linkedin,email,whatsapp --senders linkedin=10,email=25 --credits 3000
 *                                                         a custom VIP plan (until ended by hand)
 *   pnpm plan:set you@company.com extend-trial 7          gives a trial 7 more days (and sending back)
 *   pnpm plan:set you@company.com end                     ends the plan now (sending stops; nothing is deleted)
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../.env") });
const { prisma, writePlan, expireSubscription, recordSubscriptionEvent, TRIAL_VERIFY_MONTHLY } = await import("@invytra/db");
const { PLAN_CHANNELS, TRIAL, isPlanChannel } = await import("@invytra/shared");

const args = process.argv.slice(2);
const [email, action, ...rest] = args;
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const done = async (msg: string, code = 0) => {
  console.log(msg);
  await prisma.$disconnect();
  process.exit(code);
};

if (!email) await done("Usage: pnpm plan:set <user email> [vip|extend-trial <days>|end] …", 1);
const user = await prisma.user.findUnique({ where: { email: email!.toLowerCase() }, include: { memberships: { include: { workspace: { include: { subscription: true } } } } } });
const ws = user?.memberships[0]?.workspace;
if (!ws) await done(`No workspace found for ${email}.`, 1);
const s = ws!.subscription;

if (!action) {
  await done(
    s
      ? `${ws!.name}: ${s.plan} (${s.status}), channels ${s.channels.join(", ")}, ${s.monthlyCredits} credits/month, extra senders ${JSON.stringify(s.extraSenders)}${s.customSenders ? `, VIP senders ${JSON.stringify(s.customSenders)}` : ""}${s.trialEndsAt ? `, trial ends ${s.trialEndsAt.toISOString().slice(0, 10)}` : ""}${s.currentPeriodEnd ? `, period ends ${s.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}`
      : `${ws!.name}: no plan row (an old workspace without limits).`,
  );
}

if (action === "vip") {
  const channels = (flag("channels") ?? "linkedin,email").split(",").map((c) => c.trim()).filter(isPlanChannel);
  if (!channels.length) await done(`--channels: some of ${PLAN_CHANNELS.join(", ")}`, 1);
  const senders: Record<string, number> = {};
  for (const pair of (flag("senders") ?? "").split(",").filter(Boolean)) {
    const [c, n] = pair.split("=");
    if (c && isPlanChannel(c) && Number(n) > 0) senders[c] = Math.floor(Number(n));
  }
  const credits = Math.floor(Number(flag("credits") ?? 1000));
  if (!Number.isFinite(credits) || credits < 0) await done("--credits: a number of credits a month", 1);
  await prisma.$transaction(async (tx) => {
    await writePlan(tx, ws!.id, { plan: "vip", status: "ACTIVE", billingCycle: null, channels, extraSenders: {}, customSenders: senders, monthlyCredits: credits, priceCents: 0, currentPeriodStart: new Date(), currentPeriodEnd: null, paymentStatus: null });
    await recordSubscriptionEvent(tx, ws!.id, "vip_set", { channels, senders, credits });
  });
  await done(`${ws!.name} is on a custom VIP plan: ${channels.join(", ")}; senders ${JSON.stringify(senders)} (1 per channel where not set); ${credits} credits a month.`);
}

if (action === "extend-trial") {
  const days = Math.floor(Number(rest[0] ?? 0));
  if (!(days > 0 && days <= 90)) await done("Usage: pnpm plan:set <email> extend-trial <days 1-90>", 1);
  if (s && s.plan !== "trial") await done(`${ws!.name} isn't on the trial (it's ${s.plan}).`, 1);
  const from = s?.trialEndsAt && s.trialEndsAt > new Date() ? s.trialEndsAt : new Date();
  const until = new Date(from.getTime() + days * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { workspaceId: ws!.id }, data: { status: "TRIALING", trialEndsAt: until } });
    await tx.workspace.update({ where: { id: ws!.id }, data: { aiMonthly: s?.monthlyCredits ?? TRIAL.credits, verifyMonthly: TRIAL_VERIFY_MONTHLY } });
    await recordSubscriptionEvent(tx, ws!.id, "trial_extended", { until: until.toISOString(), days });
  });
  await done(`${ws!.name}'s trial now ends ${until.toISOString().slice(0, 10)}. Paused campaigns stay paused until they're resumed.`);
}

if (action === "end") {
  await expireSubscription(prisma, ws!.id, "ended by the team");
  await done(`${ws!.name}'s plan has ended: campaigns are paused and sending is off.`);
}

await done(`Unknown action "${action}". Use vip, extend-trial or end.`, 1);
