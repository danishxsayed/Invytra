/**
 * Team tool for email verification credits (until card payment is live).
 *   pnpm credits:add                         lists orders waiting for payment
 *   pnpm credits:add you@company.com 5000    adds 5,000 extra credits to that user's workspace
 *                                           (completes their pending 5,000 order if they placed one)
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../.env") });
const { prisma } = await import("@invytra/db");
const { addVerifyCredits } = await import("../src/lib/verify-credits");

const [email, amount, ref] = process.argv.slice(2);
if (!email) {
  const open = await prisma.verifyCreditPurchase.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { workspace: { select: { name: true } } } });
  if (!open.length) console.log("No orders waiting for payment.");
  for (const o of open) {
    const who = o.requestedBy ? await prisma.user.findUnique({ where: { id: o.requestedBy }, select: { email: true } }) : null;
    console.log(`${o.createdAt.toISOString().slice(0, 10)}  ${o.workspace.name}  ${who?.email ?? "?"}  ${o.credits.toLocaleString("en-US")} credits  $${(o.priceCents / 100).toFixed(2)}`);
  }
  console.log("\nTo add credits: pnpm credits:add <user email> <credits> [payment reference]");
  await prisma.$disconnect();
  process.exit(0);
}
const credits = Number.parseInt(amount ?? "", 10);
if (!Number.isFinite(credits) || credits <= 0 || credits > 10_000_000) {
  console.log("Usage: pnpm credits:add <user email> <credits> [payment reference]");
  process.exit(1);
}
const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { memberships: { include: { workspace: true } } } });
const ws = user?.memberships[0]?.workspace;
if (!ws) {
  console.log(`No workspace found for ${email}.`);
  await prisma.$disconnect();
  process.exit(1);
}
const added = await addVerifyCredits(prisma, ws.id, credits, ref ?? null);
const now = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id }, select: { verifyExtra: true } });
console.log(`Added ${added.toLocaleString("en-US")} credits to "${ws.name}". Extra credits now: ${now.verifyExtra.toLocaleString("en-US")}.`);
await prisma.$disconnect();
