import { prisma } from "@invytra/db";
import { WA_CONSENT, WA_OPT_OUT_WORDS, formatPhone, type WaConsentSource } from "@invytra/shared";
import { Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { inputCls } from "@/components/fields";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { AddWaContact } from "@/components/whatsapp/contacts/AddWaContact";
import { ImportWaContacts } from "@/components/whatsapp/contacts/ImportWaContacts";
import { WaContactTable } from "@/components/whatsapp/contacts/WaContactTable";
import { requireChannel } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { WA_CONTACT_FILTERS, listWaContacts, waContactSummary, type WaContactFilter } from "@/lib/whatsapp-contacts";

export const metadata = { title: "WhatsApp contacts" };
export const dynamic = "force-dynamic";

const LABEL: Record<WaContactFilter, string> = { all: "All", subscribed: "Subscribed", opted_out: "Opted out" };
type Q = { f?: string; tag?: string; q?: string; p?: string };

export default async function WhatsappContactsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireChannel("whatsapp");
  const ws = me.workspace.id;
  const sp = await searchParams;
  const filter = (WA_CONTACT_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as WaContactFilter) : "all";
  const summary = await waContactSummary(prisma, ws);
  const tag = summary.tags.some((t) => t.tag === sp.tag) ? sp.tag : undefined;
  const q = sp.q?.trim() || undefined;
  const data = await listWaContacts(prisma, ws, { filter, tag, q, page: Number(sp.p) || 1 });
  const href = (o: Partial<Q>) => {
    const p = new URLSearchParams(Object.entries({ f: filter === "all" ? undefined : filter, tag, q, ...o }).filter((e): e is [string, string] => !!e[1]));
    return `/whatsapp/contacts${p.size ? `?${p}` : ""}`;
  };
  const now = new Date();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contacts"
        description="People your campaigns can message on WhatsApp, with where their consent came from. Tags decide who a campaign goes to."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AddWaContact />
            <ImportWaContacts />
          </div>
        }
      />

      {summary.counts.all === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No contacts yet"
            body="Import a CSV with a phone number column, or add someone by hand. People who message your number are added by themselves."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-5">
            <nav className="space-y-1" aria-label="Contacts by status">
              {WA_CONTACT_FILTERS.map((f) => (
                <Link key={f} href={href({ f: f === "all" ? undefined : f, p: undefined })} className={cx("flex justify-between rounded-lg px-3 py-2 text-[14.5px]", f === filter ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100")}>
                  {LABEL[f]} <span className="opacity-60">{summary.counts[f].toLocaleString("en-US")}</span>
                </Link>
              ))}
            </nav>
            {summary.tags.length > 0 && (
              <div>
                <p className="px-3 text-[12px] font-semibold uppercase tracking-wider text-stone-400">Tags</p>
                <nav className="mt-1 space-y-0.5" aria-label="Contacts by tag">
                  {summary.tags.map((t) => (
                    <Link key={t.tag} href={href({ tag: t.tag === tag ? undefined : t.tag, p: undefined })} className={cx("flex justify-between truncate rounded-lg px-3 py-1.5 text-[14px]", t.tag === tag ? "bg-lime-200/70 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100")}>
                      <span className="truncate"># {t.tag}</span> <span className="opacity-60">{t.count}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            )}
            <div className="rounded-xl bg-white p-3 text-[13px] text-stone-500 ring-1 ring-stone-200">
              <p className="flex items-center gap-1.5 font-medium text-stone-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Opt-outs are automatic
              </p>
              <p className="mt-1">
                A reply like <span className="font-medium text-stone-700">{WA_OPT_OUT_WORDS.slice(0, 3).map((w) => w.toUpperCase()).join(", ")}</span> or <span dir="rtl">إلغاء</span> opts them out at once, and their number goes on your do-not-contact list.
              </p>
            </div>
          </aside>

          <Card className="min-w-0 p-4">
            <form action="/whatsapp/contacts" className="relative mb-3 w-full max-w-sm">
              {filter !== "all" && <input type="hidden" name="f" value={filter} />}
              {tag && <input type="hidden" name="tag" value={tag} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input name="q" defaultValue={q} placeholder="Search name, number, company" className={cx(inputCls, "mt-0 py-2 pl-9 text-[14px]")} />
            </form>
            {data.rows.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-stone-500">No contacts match.</p>
            ) : (
              <WaContactTable
                key={`${filter}-${tag}-${q}-${data.page}`}
                rows={data.rows.map((c) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || "No name";
                  const src = c.consentSource as WaConsentSource | null;
                  return {
                    id: c.id,
                    phone: formatPhone(c.phone),
                    name,
                    sub: [c.company, c.email].filter(Boolean).join(" · "),
                    tags: c.tags,
                    consent: src ? WA_CONSENT[src] ?? src : "Not recorded",
                    consentTitle: c.consentAt ? `${c.consentAt.toISOString().slice(0, 10)}${c.consentBy ? ` · ${c.consentBy}` : ""}` : "",
                    optedOut: c.optedOutAt ? `${c.optOutReason ?? "Opted out"} · ${timeAgo(c.optedOutAt, now)}` : null,
                    added: timeAgo(c.createdAt, now),
                  };
                })}
              />
            )}
            <div className="mt-3 flex items-center justify-between text-[13px] text-stone-500">
              <span>
                {data.total.toLocaleString("en-US")} contact{data.total === 1 ? "" : "s"}
              </span>
              {data.pages > 1 && (
                <span className="flex items-center gap-3">
                  {data.page > 1 && (
                    <Link className="hover:text-stone-900" href={href({ p: String(data.page - 1) })}>
                      ← Previous
                    </Link>
                  )}
                  Page {data.page} of {data.pages}
                  {data.page < data.pages && (
                    <Link className="hover:text-stone-900" href={href({ p: String(data.page + 1) })}>
                      Next →
                    </Link>
                  )}
                </span>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
