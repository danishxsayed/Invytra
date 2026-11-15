import { prisma } from "@invytra/db";
import { formatPhone, readMetaComponents, waLanguageLabel } from "@invytra/shared";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { Card, cx } from "@/components/ui";
import { CampaignControls } from "@/components/whatsapp/campaigns/CampaignControls";
import { CampaignStatus, Funnel } from "@/components/whatsapp/campaigns/bits";
import { WaBubble, WaChatBackground } from "@/components/whatsapp/WaBubble";
import { requireChannel } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { RECIPIENT_FILTERS, getWaCampaign, listRecipients, type RecipientFilter } from "@/lib/whatsapp-campaigns";

export const metadata = { title: "WhatsApp campaign" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: "Waiting", cls: "bg-stone-100 text-stone-600" },
  SENT: { label: "Sent", cls: "bg-sky-50 text-sky-700" },
  DELIVERED: { label: "Delivered", cls: "bg-sky-50 text-sky-700" },
  READ: { label: "Read", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", cls: "bg-rose-50 text-rose-700" },
  SKIPPED: { label: "Skipped", cls: "bg-stone-100 text-stone-500" },
};

export default async function WaCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; p?: string }> }) {
  const me = await requireChannel("whatsapp");
  const { id } = await params;
  const sp = await searchParams;
  const c = await getWaCampaign(prisma, me.workspace.id, id);
  if (!c) notFound();
  const filter = (sp.f && sp.f in RECIPIENT_FILTERS ? sp.f : "all") as RecipientFilter;
  const page = Math.max(1, Number(sp.p) || 1);
  const r = await listRecipients(prisma, me.workspace.id, c.id, filter, page);
  const view = readMetaComponents(c.components);
  const now = new Date();
  const href = (f: RecipientFilter, p?: number) => `/whatsapp/campaigns/${c.id}${f === "all" && !p ? "" : `?${new URLSearchParams({ ...(f !== "all" && { f }), ...(p && p > 1 && { p: String(p) }) })}`}`;
  const progress = c.stats.total ? Math.round(((c.stats.total - c.stats.queued) / c.stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <Link href="/whatsapp/campaigns" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Campaigns
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-stone-900">
            {c.name} <CampaignStatus status={c.status} />
          </h1>
          <p className="mt-1 text-[15px] text-stone-500">
            <span className="font-mono">{c.templateName}</span> ({waLanguageLabel(c.language)}) · {c.tags.length ? c.tags.map((t) => `#${t}`).join(" ") : "everyone subscribed"} ·{" "}
            {c.status === "SCHEDULED" && c.scheduledAt && c.scheduledAt > now ? (
              <>
                starts <LocalTime iso={c.scheduledAt.toISOString()} />
              </>
            ) : c.startedAt ? (
              `started ${timeAgo(c.startedAt, now)}`
            ) : (
              "starting within a minute"
            )}
            {c.createdBy && ` · by ${c.createdBy}`}
          </p>
        </div>
        <CampaignControls id={c.id} status={c.status} />
      </div>
      {c.note && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {c.note}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <Funnel s={c.stats} big />
            {c.status === "SENDING" && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1.5 text-[13px] text-stone-500">{progress}% handed to WhatsApp · sent in batches every minute, within your number&apos;s daily limit</p>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <nav className="mb-3 flex flex-wrap gap-1" aria-label="Recipients by status">
              {(Object.keys(RECIPIENT_FILTERS) as RecipientFilter[]).map((f) => (
                <Link key={f} href={href(f)} className={cx("rounded-lg px-3 py-1.5 text-[14px] font-medium", f === filter ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}>
                  {RECIPIENT_FILTERS[f]}
                </Link>
              ))}
            </nav>
            {r.rows.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-stone-500">{c.status === "SCHEDULED" ? "Recipients are added when it starts." : "Nobody here."}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-stone-50 text-[12.5px] text-stone-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {r.rows.map((m) => {
                      const st = STATUS[m.status] ?? { label: m.status, cls: "bg-stone-100 text-stone-600" };
                      const name = [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ") || m.contact?.profileName || "No name";
                      const last = m.repliedAt ?? m.readAt ?? m.deliveredAt ?? m.failedAt ?? m.sentAt;
                      return (
                        <tr key={m.id}>
                          <td className="px-3 py-2.5">
                            <span className="block font-medium text-stone-900">{name}</span>
                            <span className="block font-mono text-[12.5px] text-stone-500">{formatPhone(m.phone)}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-semibold", st.cls)}>{st.label}</span>
                              {m.repliedAt && <span className="rounded-full bg-lime-200 px-2 py-0.5 text-[12px] font-semibold text-stone-900">Replied</span>}
                            </span>
                            {m.error && <span className="mt-1 block text-[12.5px] text-rose-700">{m.error}</span>}
                          </td>
                          <td className="hidden px-3 py-2.5 text-[13px] text-stone-500 sm:table-cell">{last ? timeAgo(last, now) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {r.pages > 1 && (
              <p className="mt-3 flex items-center justify-end gap-3 text-[13px] text-stone-500">
                {page > 1 && <Link href={href(filter, page - 1)}>← Previous</Link>}
                Page {page} of {r.pages}
                {page < r.pages && <Link href={href(filter, page + 1)}>Next →</Link>}
              </p>
            )}
          </Card>
        </div>
        <aside>
          <WaChatBackground className="rounded-2xl p-4 ring-1 ring-stone-200">
            <p className="mb-3 text-[12px] font-medium text-stone-500">The template</p>
            <WaBubble t={view} />
          </WaChatBackground>
        </aside>
      </div>
    </div>
  );
}
