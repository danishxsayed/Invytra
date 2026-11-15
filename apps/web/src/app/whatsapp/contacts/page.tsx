import { prisma } from "@invytra/db";
import { SEGMENT_COLORS, WA_CONSENT, prettyPhone, type SegmentColor, type WaConsentSource } from "@invytra/shared";
import { Activity, BellOff, Contact, Download, PhoneOff, ShieldCheck, UserX, Users } from "lucide-react";
import Link from "next/link";
import { btn } from "@/components/btn";
import { Card, EmptyState, cx } from "@/components/ui";
import { ContactFilters, SegmentButtons } from "@/components/whatsapp/contacts/ContactControls";
import { CreateContacts } from "@/components/whatsapp/contacts/CreateContacts";
import { WaContactTable, type WaContactView } from "@/components/whatsapp/contacts/WaContactTable";
import { requireChannel } from "@/lib/auth";
import { WA_CONTACT_FILTERS, listWaContacts, waContactSummary, type WaContactFilter } from "@/lib/whatsapp-contacts";
import { listSegments } from "@/lib/whatsapp-segments";

export const metadata = { title: "WhatsApp contacts" };
export const dynamic = "force-dynamic";

const VIEWS: { id: WaContactFilter; label: string; icon: typeof Users }[] = [
  { id: "all", label: "All contacts", icon: Contact },
  { id: "active", label: "Active last 30 days", icon: Activity },
  { id: "not_on_whatsapp", label: "Not on WhatsApp", icon: PhoneOff },
  { id: "not_opted_in", label: "Not opted in", icon: UserX },
  { id: "opted_out", label: "Opted out", icon: BellOff },
];
type Q = { f?: string; seg?: string; tag?: string; loc?: string; q?: string; p?: string };
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function WhatsappContactsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireChannel("whatsapp");
  const ws = me.workspace.id;
  const sp = await searchParams;
  const [summary, segments] = await Promise.all([waContactSummary(prisma, ws), listSegments(prisma, ws)]);
  const segment = segments.find((s) => s.id === sp.seg) ?? null;
  const filter = !segment && (WA_CONTACT_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as WaContactFilter) : "all";
  const tag = summary.tags.some((t) => t.tag === sp.tag) ? sp.tag : undefined;
  const city = summary.cities.some((c) => c.city === sp.loc) ? sp.loc : undefined;
  const q = sp.q?.trim() || undefined;
  const data = await listWaContacts(prisma, ws, { filter, segment, tag, city, q, page: Number(sp.p) || 1 });
  const href = (o: Partial<Q>) => {
    const p = new URLSearchParams(Object.entries({ f: filter === "all" ? undefined : filter, seg: segment?.id, tag, loc: city, q, ...o }).filter((e): e is [string, string] => !!e[1]));
    return `/whatsapp/contacts${p.size ? `?${p}` : ""}`;
  };
  const exportHref = `/whatsapp/contacts/export?${new URLSearchParams(Object.entries({ view: filter, seg: segment?.id, tag, loc: city, q }).filter((e): e is [string, string] => !!e[1]))}`;
  const suggested = summary.tags.slice(0, 6).map((t) => t.tag);
  const segRows = segments.map((s) => ({ ...s, color: (s.color in SEGMENT_COLORS ? s.color : "green") as SegmentColor }));

  const rows: WaContactView[] = data.rows.map((c) => {
    const src = c.consentSource as WaConsentSource | null;
    const [cityName, ...rest] = (c.location ?? "").split(",").map((x) => x.trim());
    return {
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || "No name",
      email: c.email,
      userId: c.externalId,
      phone: prettyPhone(c.phone),
      city: cityName || null,
      state: rest.join(", ") || null,
      tags: c.tags,
      wa: c.waStatus,
      status: c.optedOutAt ? "opted_out" : src ? "subscribed" : "not_opted_in",
      consent: c.optedOutAt
        ? { kind: "OPTED_OUT", label: "Opted out", date: c.optOutReason?.replace(/^Replied “(.+)”$/, "via $1") ?? fmtDate(c.optedOutAt) }
        : src
          ? { kind: src, label: src === "IMPORT" ? "Import" : src === "MANUAL" ? "Added by hand" : src === "INBOUND" ? "Messaged first" : src === "LINK" ? "Chat link" : (WA_CONSENT[src] ?? src), date: c.consentAt ? fmtDate(c.consentAt) : "" }
          : { kind: "NONE", label: "No consent", date: "Not messaged" },
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-stone-900">Contacts</h1>
          <p className="mt-1 text-[15.5px] text-stone-500">{summary.counts.all.toLocaleString("en-US")} contacts · group them into segments to target campaigns.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.counts.all > 0 && (
            <a href={exportHref} className={btn.secondary}>
              <Download className="h-4 w-4" aria-hidden /> Export
            </a>
          )}
          <CreateContacts suggestedTags={suggested} mode="bulk" />
          <CreateContacts suggestedTags={suggested} mode="one" />
        </div>
      </div>

      {summary.counts.all === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No contacts yet" body="Import a CSV or Excel file with a phone number column, or add someone by hand. People who message your number are added by themselves." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-6">
            <div>
              <p className="px-3 text-[12px] font-semibold uppercase tracking-wider text-stone-400">Views</p>
              <nav className="mt-2 space-y-0.5" aria-label="Views">
                {VIEWS.map((v) => {
                  const on = !segment && filter === v.id;
                  return (
                    <Link key={v.id} href={href({ f: v.id === "all" ? undefined : v.id, seg: undefined, p: undefined })} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px]", on ? "bg-emerald-100/70 font-semibold text-emerald-800" : "text-stone-700 hover:bg-stone-100")}>
                      <v.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{v.label}</span>
                      <span className={cx("text-[13.5px] tabular-nums", on ? "text-emerald-700" : "text-stone-400")}>{summary.counts[v.id].toLocaleString("en-US")}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div>
              <div className="flex items-center justify-between px-3">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Segments</p>
                <SegmentButtons variant="header" tags={summary.tags} segments={segRows} />
              </div>
              <nav className="mt-2 space-y-0.5" aria-label="Segments">
                {segRows.map((s) => (
                  <Link key={s.id} href={href({ seg: s.id === segment?.id ? undefined : s.id, f: undefined, p: undefined })} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px]", s.id === segment?.id ? "bg-emerald-100/70 font-semibold text-emerald-800" : "text-stone-700 hover:bg-stone-100")}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEGMENT_COLORS[s.color] }} />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-[13.5px] tabular-nums text-stone-400">{s.count.toLocaleString("en-US")}</span>
                  </Link>
                ))}
              </nav>
              <div className="mt-2">
                <SegmentButtons variant="new" tags={summary.tags} segments={segRows} />
              </div>
            </div>
            <SegmentButtons variant="manage" tags={summary.tags} segments={segRows} />
            <div className="rounded-xl bg-white p-3 text-[13px] text-stone-500 ring-1 ring-stone-200">
              <p className="flex items-center gap-1.5 font-medium text-stone-700">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Opt-outs are automatic
              </p>
              <p className="mt-1">A reply like STOP or UNSUBSCRIBE opts them out at once, and their number goes on your do-not-contact list.</p>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <ContactFilters tags={summary.tags} cities={summary.cities} />
            {segment && (
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-stone-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEGMENT_COLORS[segment.color as SegmentColor] ?? SEGMENT_COLORS.green }} />
                Segment <strong className="text-stone-900">{segment.name}</strong>
                <Link href={`/whatsapp/campaigns/new?segment=${segment.id}`} className="ml-2 font-medium text-emerald-700 hover:underline">
                  Send a campaign to it →
                </Link>
              </p>
            )}
            {rows.length === 0 ? (
              <Card>
                <p className="py-12 text-center text-[14.5px] text-stone-500">No contacts match.</p>
              </Card>
            ) : (
              <WaContactTable
                key={`${filter}-${segment?.id}-${tag}-${city}-${q}-${data.page}`}
                rows={rows}
                total={data.total}
                page={data.page}
                pages={data.pages}
                prevHref={data.page > 1 ? href({ p: String(data.page - 1) }) : null}
                nextHref={data.page < data.pages ? href({ p: String(data.page + 1) }) : null}
                knownTags={summary.tags.map((t) => t.tag)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
