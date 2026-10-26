"use client";

import {
  DEFAULT_CAMPAIGN_SETTINGS,
  DEFAULT_LIMITS,
  daysText,
  waitingToStart,
  SEQUENCE_PRESETS,
  limitsSchema,
  sequenceProblems,
  type CampaignSettings,
  type CampaignStep,
  type SequencePreset,
} from "@invytra/shared";
import { AlertCircle, Check, Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveCampaignAction } from "@/app/app/campaigns/actions";
import type { BuilderOptions } from "@/lib/campaigns";
import { btn } from "../AccountControls";
import { Field, inputCls } from "../fields";
import { Modal } from "../Modal";
import { Card, cx } from "../ui";
import { Preview } from "./Preview";
import { startText } from "@/lib/campaign-text";
import { SendSchedule } from "./SendSchedule";
import { SequenceEditor } from "./SequenceEditor";
import { ImportLeads } from "../ImportLeads";

export interface BuilderInitial {
  id: string;
  name: string;
  accountIds: string[];
  listId: string | null;
  steps: CampaignStep[];
  settings: CampaignSettings;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
}

const STATUS_TEXT: Record<string, string> = { ACTIVE: "Connected", DISCONNECTED: "Not connected", PAUSED: "Paused", NEEDS_ATTENTION: "Needs attention" };

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[14px] font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-[18px] font-semibold text-stone-900">{title}</h2>
          {hint && <p className="text-[15px] text-stone-500">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export function CampaignBuilder({ options, initial, presetListId }: { options: BuilderOptions; initial?: BuilderInitial; presetListId?: string }) {
  const router = useRouter();
  const launched = !!initial && initial.status !== "DRAFT";
  const [name, setName] = useState(initial?.name ?? "");
  const [accountIds, setAccountIds] = useState<string[]>(initial?.accountIds ?? (options.accounts.length === 1 ? [options.accounts[0]!.id] : []));
  const [listId, setListId] = useState(initial?.listId ?? presetListId ?? "");
  const [preset, setPreset] = useState<SequencePreset | null>(initial ? null : "invite_followups");
  const [steps, setSteps] = useState<CampaignStep[]>(initial?.steps ?? (SEQUENCE_PRESETS.invite_followups.steps as CampaignStep[]));
  const [settings, setSettings] = useState<CampaignSettings>(initial?.settings ?? DEFAULT_CAMPAIGN_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [importing, setImporting] = useState(false);

  const senders = options.accounts.filter((a) => accountIds.includes(a.id));
  const list = options.lists.find((l) => l.id === listId);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!name.trim()) p.push("Give the campaign a name.");
    if (senders.length === 0) p.push("Choose at least one LinkedIn account to send from.");
    else if (senders.every((a) => a.status === "DISCONNECTED")) {
      p.push(senders.length === 1 ? `Connect “${senders[0]!.label}” to LinkedIn first.` : "Connect at least one of the chosen accounts to LinkedIn first.");
    }
    if (settings.days.length === 0) p.push("Pick at least one day to send on.");
    if (!listId) p.push("Choose a lead list.");
    else if (list && list.count === 0 && list.coming === 0) p.push("The lead list is empty.");
    return [...p, ...sequenceProblems(steps)];
  }, [name, senders, listId, list, steps, settings.days]);
  // The start date can change until the campaign has actually started.
  const canChangeStart = !launched || waitingToStart(initial!.settings, new Date());
  // Working days a week, to turn "working days" into a rough count.
  const perWeek = settings.days.length || 5;

  const toggleSender = (id: string) => setAccountIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  // Each sender keeps its own daily limit, so together they invite the sum.
  const invitesPerDay = senders
    .filter((a) => a.status !== "DISCONNECTED")
    .reduce((n, a) => n + (limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS).connectionRequestsPerDay, 0);
  const usesInvites = steps.some((s) => s.type === "INVITE");
  // A list still being collected from a search counts what's coming too.
  const listSize = list ? list.count + list.coming : 0;
  const days = list && invitesPerDay ? Math.max(1, Math.ceil(listSize / (usesInvites ? invitesPerDay : 40 * senders.length))) : 0;

  const save = (launch: boolean) =>
    start(async () => {
      setError(null);
      const r = await saveCampaignAction(initial?.id ?? null, { name, accountIds, listId: listId || null, steps, settings }, launch);
      if (!r.ok) return setError(r.error);
      setConfirm(false);
      if (r.value.launchError) setError(`Saved as a draft. ${r.value.launchError}`);
      router.push(`/app/campaigns/${r.value.id}`);
      router.refresh();
    });

  const choosePreset = (p: SequencePreset) => {
    setPreset(p);
    setSteps(structuredClone(SEQUENCE_PRESETS[p].steps) as CampaignStep[]);
  };

  return (
    <div className="space-y-5">
      <Section n={1} title="Who sends, to whom, and when">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campaign name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Pune founders – Q4" />
          </Field>
          <Field label="Lead list">
            <select className={inputCls} value={listId} onChange={(e) => setListId(e.target.value)} disabled={launched && !!initial?.listId}>
              <option value="">Choose…</option>
              {options.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.count.toLocaleString()} {l.count === 1 ? "lead" : "leads"}
                  {l.coming ? " (collecting…)" : ""}
                </option>
              ))}
            </select>
            {!(launched && initial?.listId) && (
              <button type="button" onClick={() => setImporting(true)} className="mt-1.5 text-[14px] font-medium text-brand-800 hover:underline">
                + New list from a LinkedIn or Sales Navigator search
              </button>
            )}
          </Field>
        </div>
        {options.accounts.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-[15px] font-medium text-stone-700">
              Send from {senders.length > 1 && <span className="font-normal text-stone-500">· {senders.length} accounts share the leads</span>}
            </legend>
            <p className="mb-2.5 text-[14px] text-stone-500">
              Pick one account, or several to go faster. Each lead is given to one of them and stays with it; every account keeps its own limits and hours.
              {launched && " Accounts can be added or removed while the campaign runs."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {options.accounts.map((a) => {
                const on = accountIds.includes(a.id);
                const limit = (limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS).connectionRequestsPerDay;
                return (
                  <label
                    key={a.id}
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition",
                      on ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-200 bg-stone-50/60 hover:border-stone-300",
                    )}
                  >
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleSender(a.id)} />
                    <span
                      aria-hidden
                      className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white")}
                    >
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-stone-900">{a.label}</span>
                      <span className="block truncate text-[13px] text-stone-500">
                        {a.profileName ? `${a.profileName} · ` : ""}
                        <span className={a.status === "ACTIVE" ? "" : "text-amber-700"}>{STATUS_TEXT[a.status] ?? a.status}</span> · {limit} invites/day
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <SendSchedule settings={settings} onSettings={setSettings} canChangeStart={canChangeStart} />
        {(options.accounts.length === 0 || options.lists.length === 0) && (
          <p className="mt-3 text-[15px] text-stone-500">
            {options.accounts.length === 0 && (
              <>
                <Link href="/app/accounts?add=1" className="font-semibold text-brand-800 underline">Connect a LinkedIn account</Link>{" "}
              </>
            )}
            {options.lists.length === 0 && (
              <>
                {options.accounts.length === 0 ? "and " : ""}
                <Link href="/app/leads" className="font-semibold text-brand-800 underline">create a lead list</Link>
              </>
            )}{" "}
            first.
          </p>
        )}
        {list && usesInvites && invitesPerDay > 0 && (
          <p className="mt-3 text-[15px] text-stone-500">
            At up to {invitesPerDay} invites a day{senders.length > 1 ? ` across ${senders.length} accounts` : ""}, inviting {list.coming ? "up to " : "all "}{listSize.toLocaleString()} leads takes about {days} sending {days === 1 ? "day" : "days"}
            {days > perWeek && ` (about ${Math.ceil(days / perWeek)} weeks at ${daysText(settings.days)})`}. New leads added
            to this list later join the campaign automatically.
          </p>
        )}
      </Section>

      <Section n={2} title="Sequence" hint="Each person moves through these steps on their own clock, inside the account's working hours and daily limits.">
        {!launched && (
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {(Object.keys(SEQUENCE_PRESETS) as SequencePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePreset(p)}
                className={cx(
                  "rounded-xl border px-4 py-3 text-left transition",
                  preset === p ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-200 bg-stone-50/60 hover:border-stone-300",
                )}
              >
                <p className="text-[15px] font-semibold text-stone-900">{SEQUENCE_PRESETS[p].label}</p>
                <p className="text-[14px] text-stone-500">{SEQUENCE_PRESETS[p].hint}</p>
              </button>
            ))}
          </div>
        )}
        <SequenceEditor
          steps={steps}
          settings={settings}
          onSteps={(s) => {
            setSteps(s);
            setPreset(null);
          }}
          onSettings={setSettings}
          locked={launched ? (initial?.steps.length ?? 0) : 0}
        />
        <p className="mt-4 rounded-xl bg-emerald-50/70 px-4 py-3 text-[15px] text-emerald-900">
          Follow-ups stop as soon as someone replies. People your accounts already invited or messaged, or who are in another campaign, are skipped.
        </p>
      </Section>

      <Section n={3} title="Preview" hint="Exactly what a few people from your list would receive.">
        <Preview steps={steps} sample={list?.sample ?? []} />
      </Section>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-pop backdrop-blur">
        {(error || (problems.length > 0 && !launched)) && (
          <div className="mb-3 flex items-start gap-2 text-[15px]">
            <AlertCircle className={cx("mt-0.5 h-4 w-4 shrink-0", error ? "text-rose-600" : "text-amber-600")} aria-hidden />
            <p className={error ? "text-rose-700" : "text-stone-600"}>
              {error ?? (
                <>
                  To launch: {problems[0]}
                  {problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}
                </>
              )}
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {launched ? (
            <button className={btn.primary} disabled={pending || problems.length > 0} onClick={() => save(false)} title={problems[0]}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save changes
            </button>
          ) : (
            <>
              <button className={btn.secondary} disabled={pending || !name.trim()} onClick={() => save(false)}>
                Save draft
              </button>
              <button className={btn.primary} disabled={pending || problems.length > 0} onClick={() => setConfirm(true)}>
                <Rocket className="h-4 w-4" aria-hidden /> Launch campaign
              </button>
            </>
          )}
        </div>
      </div>

      {importing && (
        <ImportLeads
          target={{ kind: "new" }}
          accounts={options.accounts}
          initialTab="search"
          onClose={() => setImporting(false)}
          onCreated={(id) => {
            setListId(id);
            router.refresh();
          }}
        />
      )}

      {confirm && senders.length > 0 && list && (
        <Modal title="Launch this campaign?" onClose={() => setConfirm(false)} busy={pending}>
          <ul className="space-y-2 text-[15px] text-stone-700">
            <li>
              <b>{senders.length === 1 ? senders[0]!.label : `${senders.length} accounts`}</b> {senders.length === 1 ? "starts" : "start"} working through <b>{list.coming ? `up to ${listSize.toLocaleString()}` : listSize.toLocaleString()}</b> leads in “{list.name}”
              {list.coming ? " as they're collected" : ""}.
            </li>
            {senders.length > 1 && <li>Each lead goes to one account and stays with it, so nobody hears from two of your accounts.</li>}
            <li>
              Sends {daysText(settings.days).replace("Every day", "every day")}, in each account's working hours
              {settings.startAt && waitingToStart(settings, new Date()) ? `, starting ${startText(settings.startAt)}` : ""}.
            </li>
            {usesInvites && invitesPerDay > 0 && <li>Up to {invitesPerDay} invites a day, so about {days} sending {days === 1 ? "day" : "days"} to invite everyone.</li>}
            <li>Anyone already contacted, or in another campaign, is skipped. Follow-ups stop when someone replies.</li>
            <li>You can pause at any time.</li>
          </ul>
          {error && <p className="mt-3 text-[15px] text-rose-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setConfirm(false)} disabled={pending}>
              Not yet
            </button>
            <button className={btn.primary} onClick={() => save(true)} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />} Launch
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
