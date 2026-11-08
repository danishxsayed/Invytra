import { prisma } from "@invytra/db";
import { Mail, Phone, Search, Users } from "lucide-react";
import { ChannelLogo } from "@/components/ChannelLogo";
import { PersonPhoto } from "@/components/PersonPhoto";
import { btn } from "@/components/AccountControls";
import { Card, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CONTACTS_PAGE, CONTACT_FILTERS, listPeople, type ContactFilter } from "@/lib/contacts";
import { hubHref } from "@/lib/domains";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

const LABEL: Record<ContactFilter, string> = { all: "All", linkedin: "On LinkedIn", email: "With email", both: "Both channels", replied: "Replied" };

/** Everyone across channels: one row per person, whatever channel they came from. */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const filter = (CONTACT_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as ContactFilter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = await listPeople(prisma, me.workspace.id, { q: sp.q, filter, page });
  const pages = Math.max(1, Math.ceil(total / CONTACTS_PAGE));
  const href = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, f: filter === "all" ? undefined : filter, ...p })) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString();
    return hubHref(`/contacts${s ? `?${s}` : ""}`);
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Contacts</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-stone-500">
          Everyone you reach, once: their LinkedIn profile, email and phone together, with everything that happened on every channel. Someone who replies on one channel isn't contacted on another.
        </p>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-3.5">
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter">
            {CONTACT_FILTERS.map((f) => (
              <a key={f} href={href({ f: f === "all" ? undefined : f, page: undefined })} className={cx("rounded-full border px-3 py-1 text-[13px] transition", filter === f ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300")}>
                {LABEL[f]}
              </a>
            ))}
          </nav>
          <form action={hubHref("/contacts")} className="ml-auto">
            {filter !== "all" && <input type="hidden" name="f" value={filter} />}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, company, email…" aria-label="Search contacts" className="w-60 rounded-lg border border-stone-300 py-1.5 pl-8 pr-3 text-[14px] focus:border-stone-500 focus:outline-none" />
            </label>
          </form>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[14.5px]">
              <thead className="border-b border-stone-100 text-[12.5px] uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-5 py-3 font-medium">Reach them on</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3">
                      <a href={hubHref(`/contacts/${r.id}`)} className="flex items-center gap-3">
                        <PersonPhoto name={r.name} src={r.photo} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-stone-900">{r.name}</span>
                          <span className="block truncate text-[13px] text-stone-500">{[r.title, r.company].filter(Boolean).join(" at ") || "—"}</span>
                        </span>
                      </a>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 text-[13px] text-stone-600">
                        {r.linkedin && <ChannelLogo id="linkedin" size="xs" />}
                        {r.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Mail className="h-3.5 w-3.5 text-amber-600" aria-hidden /> <span className="max-w-[220px] truncate">{r.email}</span>
                          </span>
                        )}
                        {r.phone && <Phone className="h-3.5 w-3.5 text-stone-500" aria-label={r.phone} />}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {r.replied ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12.5px] font-medium text-emerald-800 ring-1 ring-emerald-600/20">Replied</span>
                      ) : r.inCampaign ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[12.5px] font-medium text-sky-800 ring-1 ring-sky-600/20">In a campaign</span>
                      ) : (
                        <span className="text-[13px] text-stone-400">Not contacted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-[15px] text-stone-500">
            <Users className="h-7 w-7 text-stone-300" aria-hidden />
            {sp.q || filter !== "all" ? "Nobody matches." : "Contacts appear here as you import LinkedIn leads and email contacts."}
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[14px] text-stone-600">
            <span>
              Page {page} of {pages} · {total.toLocaleString("en-US")} contacts
            </span>
            <span className="flex gap-2">
              {page > 1 && <a className={btn.secondary} href={href({ page: page - 1 })}>Previous</a>}
              {page < pages && <a className={btn.secondary} href={href({ page: page + 1 })}>Next</a>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
