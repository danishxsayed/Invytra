/**
 * Shows every account: status, usage against limits, what's queued, and the
 * latest results.
 *
 *   pnpm queue:status [label]
 */
import { DEFAULT_LIMITS, limitsSchema } from "@invytra/shared";
import { usageFor } from "../actions/run-action.js";
import { createRuntime } from "../runtime.js";

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const short = (u: string | null) => (u ? u.replace(/^https?:\/\/(www\.)?linkedin\.com/, "") : "");

async function main() {
  const only = process.argv[2];
  const rt = await createRuntime();
  try {
    const accounts = await rt.prisma.linkedinAccount.findMany({
      where: only ? { label: only } : {},
      orderBy: { label: "asc" },
    });
    for (const a of accounts) {
      const usage = await usageFor(rt.prisma, a.id);
      const limits = limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS;
      console.log(`\n■ ${a.label} — ${a.status}${a.statusReason ? ` (${a.statusReason})` : ""}`);
      console.log(
        `  24h: visits ${usage.today.PROFILE_VISIT}/${limits.profileVisitsPerDay} · invites ${usage.today.CONNECTION_REQUEST}/${limits.connectionRequestsPerDay} · messages ${usage.today.MESSAGE}/${limits.messagesPerDay} · invites 7d ${usage.connectionRequestsThisWeek}/${limits.connectionRequestsPerWeek}`,
      );

      const queued = await rt.prisma.action.findMany({
        where: { accountId: a.id, status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { scheduledAt: "asc" },
      });
      console.log(`  Queued: ${queued.length}`);
      for (const q of queued.slice(0, 8)) {
        const note = q.error && !/WAITING_TURN|PACING/.test(q.error) ? q.error : "";
        console.log(`    ${q.status === "RUNNING" ? "▶" : "·"} ${fmt(q.scheduledAt)}  ${q.type.padEnd(18)} ${short(q.targetUrl)}  ${note}`);
      }
      if (queued.length > 8) console.log(`    … and ${queued.length - 8} more`);

      const recent = await rt.prisma.action.findMany({
        where: { accountId: a.id, status: { in: ["SUCCEEDED", "SKIPPED", "FAILED"] } },
        orderBy: { executedAt: "desc" },
        take: 8,
      });
      console.log(`  Recent:`);
      for (const r of recent) {
        const icon = r.status === "SUCCEEDED" ? "✔" : r.status === "SKIPPED" ? "–" : "✖";
        console.log(`    ${icon} ${fmt(r.executedAt)}  ${r.type.padEnd(18)} ${short(r.targetUrl)}  ${(r.error ?? "").split("\n")[0]!.slice(0, 60)}`);
      }
      const replies = await rt.prisma.inboxMessage.findMany({ where: { accountId: a.id }, orderBy: { fetchedAt: "desc" }, take: 5 });
      if (replies.length) {
        console.log(`  Latest replies:`);
        for (const m of replies) console.log(`    ✉ ${m.fromName}: ${m.text.slice(0, 70)}`);
      }
    }
    if (accounts.length === 0) console.log(only ? `No account "${only}"` : "No accounts in .env");
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
