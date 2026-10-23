"use client";

import {
  DEFAULT_CAMPAIGN_SETTINGS,
  DEFAULT_LIMITS,
  SEQUENCE_PRESETS,
  limitsSchema,
  sequenceProblems,
  type CampaignSettings,
  type CampaignStep,
  type SequencePreset,
} from "@invytra/shared";
import { AlertCircle, Loader2, Rocket } from "lucide-react";
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
import { SequenceEditor } from "./SequenceEditor";

export interface BuilderInitial {
  id: string;
  name: string;
  accountId: string | null;
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
  const [accountId, setAccountId] = useState(initial?.accountId ?? (options.accounts.length === 1 ? options.accounts[0]!.id : ""));
  const [listId, setListId] = useState(initial?.listId ?? presetListId ?? "");
  const [preset, setPreset] = useState<SequencePreset | null>(initial ? null : "invite_followups");
  const [steps, setSteps] = useState<CampaignStep[]>(initial?.steps ?? (SEQUENCE_PRESETS.invite_followups.steps as CampaignStep[]));
  const [settings, setSettings] = useState<CampaignSettings>(initial?.settings ?? DEFAULT_CAMPAIGN_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const account = options.accounts.find((a) => a.id === accountId);
  const list = options.lists.find((l) => l.id === listId);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!name.trim()) p.push("Give the campaign a name.");
    if (!accountId) p.push("Choose the LinkedIn account that sends.");
    else if (account?.status === "DISCONNECTED") p.push(`Connect “${account.label}” to LinkedIn first.`);
    if (!listId) p.push("Choose a lead list.");
    else if (list && list.count === 0) p.push("The lead list is empty.");
    return [...p, ...sequenceProblems(steps)];
  }, [name, accountId, account, listId, list, steps]);

  const invitesPerDay = (limitsSchema.safeParse(account?.limits).data ?? DEFAULT_LIMITS).connectionRequestsPerDay;
  const usesInvites = steps.some((s) => s.type === "INVITE");
  const days = list ? Math.max(1, Math.ceil(list.count / (usesInvites ? invitesPerDay : 40))) : 0;

  const save = (launch: boolean) =>
    start(async () => {
      setError(null);
      const r = await saveCampaignAction(initial?.id ?? null, { name, accountId: accountId || null, listId: listId || null, steps, settings }, launch);
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
      <Section n={1} title="Who sends, and to whom">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Campaign name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Pune founders – Q4" />
          </Field>
          <Field label="LinkedIn account">
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={launched && !!initial?.accountId}>
              <option value="">Choose…</option>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.profileName ? ` (${a.profileName})` : ""} — {STATUS_TEXT[a.status] ?? a.status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead list">
            <select className={inputCls} value={listId} onChange={(e) => setListId(e.target.value)} disabled={launched && !!initial?.listId}>
              <option value="">Choose…</option>
              {options.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {l.count.toLocaleString()} {l.count === 1 ? "lead" : "leads"}
                </option>
              ))}
            </select>
          </Field>
        </div>
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
        {list && usesInvites && (
          <p className="mt-3 text-[15px] text-stone-500">
            At up to {invitesPerDay} invites a day, inviting all {list.count.toLocaleString()} leads takes about {days} working {days === 1 ? "day" : "days"}. New leads added
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

      {confirm && account && list && (
        <Modal title="Launch this campaign?" onClose={() => setConfirm(false)} busy={pending}>
          <ul className="space-y-2 text-[15px] text-stone-700">
            <li>
              <b>{account.label}</b> starts working through <b>{list.count.toLocaleString()}</b> leads in “{list.name}”.
            </li>
            {usesInvites && <li>Up to {invitesPerDay} invites a day, only in working hours — about {days} working {days === 1 ? "day" : "days"} to invite everyone.</li>}
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
