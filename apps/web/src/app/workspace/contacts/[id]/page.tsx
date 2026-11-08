import { prisma } from "@invytra/db";
import { ArrowLeft, CalendarCheck, Check, Eye, Mail, MessageSquare, Phone, Reply, Send, TriangleAlert, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { ChannelLogo } from "@/components/ChannelLogo";
import { PersonPhoto } from "@/components/PersonPhoto";
import { BlockPerson, PersonForm } from "@/components/contacts/PersonForm";
import { Card, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPerson, type EventKind } from "@/lib/contacts";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

const ICON: Record<EventKind, { icon: typeof Eye; cls: string }> = {
  visit: { icon: Eye, cls: "bg-stone-100 text-stone-500" },
  invite: { icon: UserPlus, cls: "bg-sky-50 text-sky-600" },
  accepted: { icon: Check, cls: "bg-emerald-50 text-emerald-600" },
  message: { icon: Send, cls: "bg-sky-50 text-sky-600" },
  reply: { icon: Reply, cls: "bg-emerald-50 text-emerald-700" },
  email: { icon: Mail, cls: "bg-amber-50 text-amber-600" },
  email_reply: { icon: Reply, cls: "bg-emerald-50 text-emerald-700" },
  auto_reply: { icon: MessageSquare, cls: "bg-stone-100 text-stone-500" },
  bounce: { icon: TriangleAlert, cls: "bg-rose-50 text-rose-600" },
  meeting: { icon: CalendarCheck, cls: "bg-emerald-100 text-emerald-800" },
  other: { icon: Eye, cls: "bg-stone-100 text-stone-500" },
};
const STATUS_LABEL: Record<string, string> = { REPLIED: "Replied", DONE: "Finished", SKIPPED: "Skipped", QUEUED: "Waiting to start", IN_PROGRESS: "In progress", WAITING_ACCEPT: "Waiting to accept", NOT_ACCEPTED: "Didn't accept", ACTIVE: "In progress", COMPLETED: "Finished", BOUNCED: "Bounced", UNSUBSCRIBED: "Unsubscribed", PAUSED: "Paused", FAILED: "Failed" };

/** One person: how to reach them, their campaigns, and everything that happened on every channel. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const v = await getPerson(prisma, me.workspace.id, (await params).id);
  if (!v) notFound();
  const p = v.person;
  return (
    <div className="space-y-6">
      <a href={hubHref("/contacts")} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Contacts
      </a>
      <div className="flex flex-wrap items-center gap-4">
        <PersonPhoto name={p.name} src={p.photo} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-stone-900">{p.name}</h1>
          <p className="text-[15px] text-stone-500">{[p.title, p.company].filter(Boolean).join(" at ") || "No company yet"}</p>
        </div>
        <BlockPerson id={p.id} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-[17px] font-semibold text-stone-900">Activity on every channel</h2>
            {v.events.length ? (
              <ol className="mt-4 space-y-4">
                {v.events.map((e, i) => {
                  const t = ICON[e.kind];
                  return (
                    <li key={i} className="flex gap-3">
                      <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", t.cls)}>
                        <t.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-stone-900">
                          <ChannelLogo id={e.channel} size="xs" /> <span className="font-medium">{e.title}</span>
                          <span className="text-[12.5px] text-stone-400">{timeAgo(e.at)}</span>
                        </p>
                        {e.text && <p className="mt-1 line-clamp-4 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-[13.5px] leading-relaxed text-stone-600">{e.text.replace(/\n\s*\n+/g, "\n").trim()}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-2 text-[14.5px] text-stone-500">Nothing yet. Add them to a LinkedIn or email campaign.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-3 p-5 text-[14.5px]">
            <h2 className="text-[17px] font-semibold text-stone-900">Reach them on</h2>
            {p.linkedin ? (
              <a href={p.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-stone-800 hover:underline">
                <ChannelLogo id="linkedin" size="xs" /> <span className="truncate">{p.linkedin.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </a>
            ) : (
              <p className="flex items-center gap-2 text-stone-400"><ChannelLogo id="linkedin" size="xs" muted /> No LinkedIn profile</p>
            )}
            {p.email ? (
              <p className="flex items-center gap-2 text-stone-800">
                <ChannelLogo id="email" size="xs" /> <span className="truncate">{p.email}</span>
                {v.emailStatus && !v.emailStatus.subscribed && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[12px] text-stone-600">Unsubscribed</span>}
                {v.emailStatus?.bounceStatus === "HARD" && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] text-rose-700">Bounced</span>}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-stone-400"><ChannelLogo id="email" size="xs" muted /> No email yet</p>
            )}
            <p className={cx("flex items-center gap-2", p.phone ? "text-stone-800" : "text-stone-400")}>
              <Phone className="h-[18px] w-[18px]" aria-hidden /> {p.phone ?? "No phone"}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[17px] font-semibold text-stone-900">Campaigns</h2>
            {v.campaigns.length ? (
              <ul className="mt-3 space-y-2 text-[14px]">
                {v.campaigns.map((c) => (
                  <li key={`${c.channel}-${c.id}`} className="flex items-center gap-2">
                    <ChannelLogo id={c.channel} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-stone-800">{c.name}</span>
                    <span className="shrink-0 text-[12.5px] text-stone-500">{STATUS_LABEL[c.status] ?? c.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-stone-500">Not in any campaign.</p>
            )}
            {v.lists.length > 0 && <p className="mt-3 text-[13px] text-stone-500">Lead lists: {v.lists.join(", ")}</p>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-[17px] font-semibold text-stone-900">Details</h2>
            <PersonForm id={p.id} value={{ firstName: p.firstName ?? "", lastName: p.lastName ?? "", company: p.company ?? "", title: p.title ?? "", phone: p.phone ?? "", notes: p.notes ?? "" }} />
          </Card>
        </div>
      </div>
    </div>
  );
}
