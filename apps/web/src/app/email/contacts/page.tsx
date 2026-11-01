import { prisma } from "@invytra/db";
import { Search, Users } from "lucide-react";
import { ContactActions, DeleteListButton, SampleCsvButton } from "@/components/email/contacts/ContactBits";
import { ImportContactsButton } from "@/components/email/contacts/ImportContacts";
import { SuppressionPanel } from "@/components/email/contacts/SuppressionPanel";
import { VariablesPanel } from "@/components/email/contacts/VariablesPanel";
import { inputCls } from "@/components/fields";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { CONTACT_FILTERS, listContacts, listLists, listSuppressions, listVariables, type ContactFilter, type ContactRowView } from "@/lib/email-contacts";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

const FILTER_LABEL: Record<ContactFilter, string> = {
  all: "All",
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  valid: "Valid",
  invalid: "Invalid",
  risky: "Risky",
  unknown: "Unknown",
  pending: "Pending verification",
  unverified: "Not verified",
};
const VERIFY: Record<string, { text: string; cls: string }> = {
  NOT_CHECKED: { text: "Not verified", cls: "bg-stone-100 text-stone-500" },
  PENDING: { text: "Verifying…", cls: "bg-sky-50 text-sky-700" },
  VALID: { text: "Valid", cls: "bg-emerald-50 text-emerald-700" },
  INVALID: { text: "Invalid", cls: "bg-rose-50 text-rose-700" },
  RISKY: { text: "Risky", cls: "bg-amber-50 text-amber-800" },
  UNKNOWN: { text: "Unknown", cls: "bg-stone-100 text-stone-600" },
};

function Status({ c }: { c: ContactRowView }) {
  const pill = (text: string, cls: string, title?: string) => (
    <span title={title} className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", cls)}>
      {text}
    </span>
  );
  const v = VERIFY[c.verification]!;
  return (
    <span className="flex flex-wrap gap-1">
      {!c.subscribed && pill("Unsubscribed", "bg-stone-800 text-white")}
      {c.bounceStatus === "HARD" && pill("Hard bounce", "bg-rose-50 text-rose-700", c.bounceReason ?? undefined)}
      {c.bounceStatus === "SOFT" && pill(`Soft bounce ×${c.softBounces}`, "bg-amber-50 text-amber-800", c.bounceReason ?? undefined)}
      {pill(v.text, v.cls, c.verifyDetail ?? undefined)}
    </span>
  );
}

type Q = { tab?: string; list?: string; f?: string; q?: string; p?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireChannel("email");
  const q = await searchParams;
  const ws = me.workspace.id;
  const tab = q.tab === "variables" || q.tab === "suppression" ? q.tab : "contacts";
  const filter = (CONTACT_FILTERS as readonly string[]).includes(q.f ?? "") ? (q.f as ContactFilter) : "all";
  const [lists, variables] = await Promise.all([listLists(prisma, ws), listVariables(prisma, ws)]);
  const list = lists.find((l) => l.id === q.list);
  const href = (o: Partial<Q>) => `/email/contacts?${new URLSearchParams(Object.entries({ tab, list: list?.id, f: filter === "all" ? undefined : filter, q: q.q, ...o }).filter((e): e is [string, string] => !!e[1]))}`;
  const total = await prisma.emailContact.count({ where: { workspaceId: ws } });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contacts"
        description="Everyone your campaigns can email, in lists. Import a CSV; its columns become variables for your emails. Unsubscribed and bounced contacts are never emailed again."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SampleCsvButton />
            <ImportContactsButton lists={lists} variables={variables} />
          </div>
        }
      />
      <nav className="flex flex-wrap gap-1 border-b border-stone-200" aria-label="Contacts sections">
        {(
          [
            ["contacts", `Contacts (${total})`],
            ["variables", `Variables (${variables.length})`],
            ["suppression", "Suppression list"],
          ] as const
        ).map(([t, label]) => (
          <a key={t} href={`/email/contacts?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2 text-[15px] font-medium", t === tab ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800")}>
            {label}
          </a>
        ))}
      </nav>

      {tab === "variables" && (
        <Card className="p-5">
          <VariablesPanel variables={variables} />
        </Card>
      )}
      {tab === "suppression" && (
        <Card className="p-5">
          <SuppressionPanel rows={await listSuppressions(prisma, ws)} />
        </Card>
      )}
      {tab === "contacts" &&
        (total === 0 ? (
          <Card>
            <EmptyState icon={Users} title="No contacts yet" body="Import a CSV with an email column. Download the sample CSV to see the format; any extra columns become variables like {{city}}." />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <aside className="space-y-1">
              <a href={href({ list: undefined, p: undefined })} className={cx("block rounded-lg px-3 py-2 text-[14.5px]", !list ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100")}>
                All contacts <span className="opacity-60">({total})</span>
              </a>
              {lists.map((l) => (
                <a key={l.id} href={href({ list: l.id, p: undefined })} className={cx("block truncate rounded-lg px-3 py-2 text-[14.5px]", list?.id === l.id ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100")}>
                  {l.name} <span className="opacity-60">({l.count})</span>
                </a>
              ))}
            </aside>
            <ContactsTable ws={ws} q={q} filter={filter} listId={list?.id} href={href} listHeader={list ? <DeleteListButton id={list.id} name={list.name} /> : null} />
          </div>
        ))}
    </div>
  );
}

async function ContactsTable({ ws, q, filter, listId, href, listHeader }: { ws: string; q: Q; filter: ContactFilter; listId?: string; href: (o: Partial<Q>) => string; listHeader: React.ReactNode }) {
  const page = Math.max(1, Number(q.p) || 1);
  const data = await listContacts(prisma, ws, { listId, filter, q: q.q?.trim() || undefined, page });
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form action="/email/contacts" className="relative w-full max-w-xs">
          {listId && <input type="hidden" name="list" value={listId} />}
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input name="q" defaultValue={q.q} placeholder="Search email, name, company" className={cx(inputCls, "mt-0 py-2 pl-9 text-[14px]")} />
        </form>
        <span className="ml-auto">{listHeader}</span>
      </div>
      <nav className="mb-3 flex flex-wrap gap-1" aria-label="Filter">
        {CONTACT_FILTERS.map((f) => (
          <a key={f} href={href({ f: f === "all" ? undefined : f, p: undefined })} className={cx("rounded-lg px-2.5 py-1 text-[13px] font-medium", f === filter ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}>
            {FILTER_LABEL[f]}
          </a>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-stone-50 text-[12.5px] text-stone-500">
            <tr>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Variables</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium text-stone-900">{c.email}</span>
                  <span className="block text-[12.5px] text-stone-500">{[[c.firstName, c.lastName].filter(Boolean).join(" "), c.title, c.company].filter(Boolean).join(" · ") || "—"}</span>
                  {c.listNames.length > 0 && <span className="block text-[12px] text-stone-400">{c.listNames.join(", ")}</span>}
                </td>
                <td className="hidden max-w-[260px] px-3 py-2 text-[12.5px] text-stone-500 md:table-cell">
                  {Object.entries({ ...(c.website ? { website: c.website } : {}), ...c.vars })
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <span key={k} className="block truncate">
                        <span className="font-mono text-stone-400">{k}</span> {v}
                      </span>
                    ))}
                </td>
                <td className="px-3 py-2">
                  <Status c={c} />
                </td>
                <td className="px-3 py-2">
                  <ContactActions id={c.id} subscribed={c.subscribed} />
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[14px] text-stone-500">
                  No contacts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px] text-stone-500">
        <span>
          {data.total} contact{data.total === 1 ? "" : "s"}
        </span>
        {data.pages > 1 && (
          <span className="flex items-center gap-2">
            {data.page > 1 && <a className="hover:text-stone-900" href={href({ p: String(data.page - 1) })}>← Previous</a>}
            Page {data.page} of {data.pages}
            {data.page < data.pages && <a className="hover:text-stone-900" href={href({ p: String(data.page + 1) })}>Next →</a>}
          </span>
        )}
      </div>
    </Card>
  );
}
