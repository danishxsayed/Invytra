"use client";

import {
  DEFAULT_CAMPAIGN_SETTINGS,
  DEGREE_LABEL,
  SEQUENCE_PRESETS,
  audienceProblems,
  daysText,
  hasInvite,
  sequenceProblems,
  waitingToStart,
  type CampaignSettings,
  type CampaignStep,
  type SequencePreset,
} from "@invytra/shared";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveCampaignAction } from "@/app/app/campaigns/actions";
import type { BuilderOptions } from "@/lib/campaigns";
import { startText, stepLabel } from "@/lib/campaign-text";
import { btn } from "../AccountControls";
import { ImportLeads } from "../ImportLeads";
import { Card, cx } from "../ui";
import { DetailsStep, LaunchModal, LeadsStep, inviteLimit } from "./BuilderSteps";
import { ConfigureStep } from "./ConfigureStep";
import { Preview } from "./Preview";
import { SequenceEditor } from "./SequenceEditor";
import { Stepper, type WizardStep } from "./Stepper";

export interface BuilderInitial {
  id: string;
  name: string;
  accountIds: string[];
  listId: string | null;
  steps: CampaignStep[];
  settings: CampaignSettings;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
}

const STEPS: WizardStep[] = [
  { key: "details", label: "Details", hint: "Name and sending accounts" },
  { key: "leads", label: "Add people", hint: "The lead list to work through" },
  { key: "configure", label: "Configure", hint: "Who to include, and when" },
  { key: "sequence", label: "Sequence", hint: "Visits, invites and messages" },
  { key: "review", label: "Review & launch", hint: "Preview what people receive" },
];
const TITLES = ["Campaign details", "Add people", "Configure settings", "Build the sequence", "Review and launch"];

/** New campaigns: invite 2nd and 3rd+ connections (1st-degree people are already connected). */
const NEW_SETTINGS: CampaignSettings = { ...DEFAULT_CAMPAIGN_SETTINGS, degrees: [2, 3] };

export function CampaignBuilder({ options, initial, presetListId }: { options: BuilderOptions; initial?: BuilderInitial; presetListId?: string }) {
  const router = useRouter();
  const launched = !!initial && initial.status !== "DRAFT";
  const [name, setName] = useState(initial?.name ?? "");
  const [accountIds, setAccountIds] = useState<string[]>(initial?.accountIds ?? (options.accounts.length === 1 ? [options.accounts[0]!.id] : []));
  const [listId, setListId] = useState(initial?.listId ?? presetListId ?? "");
  const [preset, setPreset] = useState<SequencePreset | null>(initial ? null : "invite_followups");
  const [steps, setSteps] = useState<CampaignStep[]>(initial?.steps ?? (SEQUENCE_PRESETS.invite_followups.steps as CampaignStep[]));
  const [settings, setSettings] = useState<CampaignSettings>(initial?.settings ?? NEW_SETTINGS);
  const [current, setCurrent] = useState(0);
  const [reached, setReached] = useState(initial ? STEPS.length - 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [importing, setImporting] = useState(false);

  const senders = options.accounts.filter((a) => accountIds.includes(a.id));
  const list = options.lists.find((l) => l.id === listId);

  // What's missing on each step, in plain words. A step is complete when its list is empty.
  const problems = useMemo(() => {
    const details: string[] = [];
    if (!name.trim()) details.push("Give the campaign a name.");
    if (senders.length === 0) details.push("Choose at least one LinkedIn account to send from.");
    else if (senders.every((a) => a.status === "DISCONNECTED")) {
      details.push(senders.length === 1 ? `Connect “${senders[0]!.label}” to LinkedIn first.` : "Connect at least one of the chosen accounts to LinkedIn first.");
    }
    const leads: string[] = [];
    if (!listId) leads.push("Choose a lead list.");
    else if (list && list.count === 0 && list.coming === 0) leads.push("The lead list is empty.");
    const configure: string[] = [];
    if (settings.days.length === 0) configure.push("Pick at least one day to send on.");
    if (settings.degrees.length === 0) configure.push("Pick at least one connection level.");
    const sequence = [...sequenceProblems(steps), ...audienceProblems(steps, settings)];
    return [details, leads, configure, sequence, []];
  }, [name, senders, listId, list, steps, settings]);
  const allProblems = problems.flat();
  const complete = problems.map((p) => p.length === 0);
  // Drafts go in order: a step opens once every step before it is complete.
  const canOpen = (i: number) => launched || i <= reached || complete.slice(0, i).every(Boolean);
  const done = complete.map((c, i) => c && (i < reached || i < current || launched));

  const canChangeStart = !launched || waitingToStart(initial!.settings, new Date());
  const perWeek = settings.days.length || 5;
  const toggleSender = (id: string) => setAccountIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const invitesPerDay = senders.filter((a) => a.status !== "DISCONNECTED").reduce((n, a) => n + inviteLimit(a), 0);
  const usesInvites = hasInvite(steps);
  const listSize = list ? list.count + list.coming : 0;
  const days = list && invitesPerDay ? Math.max(1, Math.ceil(listSize / (usesInvites ? invitesPerDay : 40 * senders.length))) : 0;
  const estimate =
    list && usesInvites && invitesPerDay > 0
      ? `At up to ${invitesPerDay} invites a day${senders.length > 1 ? ` across ${senders.length} accounts` : ""}, inviting ${list.coming ? "up to " : "all "}${listSize.toLocaleString()} leads takes about ${days} sending ${days === 1 ? "day" : "days"}${days > perWeek ? ` (about ${Math.ceil(days / perWeek)} weeks at ${daysText(settings.days)})` : ""}. New leads added to this list later join the campaign automatically.`
      : null;

  const go = (i: number) => {
    setError(null);
    setCurrent(i);
    setReached((r) => Math.max(r, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
    const next = structuredClone(SEQUENCE_PRESETS[p].steps) as CampaignStep[];
    setSteps(next);
    // Messaging without an invite only reaches 1st-degree connections.
    if (!hasInvite(next) && !settings.degrees.includes(1)) {
      setSettings({ ...settings, degrees: [1] });
      setNotice("Connection levels changed to 1st only: without an invite you can only message your connections.");
    } else setNotice(null);
  };

  const here = problems[current]!;
  const last = current === STEPS.length - 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <Stepper steps={STEPS} current={current} done={done} canOpen={canOpen} onOpen={go} />
      </div>

      <div className="min-w-0 space-y-5">
        <Card className="p-5 sm:p-7">
          <div className="mb-5">
            <p className="text-[13px] font-medium uppercase tracking-wide text-stone-400">
              Step {current + 1} of {STEPS.length}
            </p>
            <h2 className="text-[24px] font-semibold tracking-tight text-stone-900">{TITLES[current]}</h2>
          </div>

          {current === 0 && (
            <DetailsStep name={name} onName={setName} accounts={options.accounts} accountIds={accountIds} onToggle={toggleSender} launched={launched} />
          )}
          {current === 1 && (
            <LeadsStep lists={options.lists} listId={listId} onList={setListId} locked={launched && !!initial?.listId} onImport={() => setImporting(true)} estimate={estimate} />
          )}
          {current === 2 && <ConfigureStep settings={settings} onSettings={setSettings} canChangeStart={canChangeStart} />}
          {current === 3 && (
            <div>
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
              {notice && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-[15px] text-sky-900">{notice}</p>}
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
            </div>
          )}
          {current === 4 && (
            <div className="space-y-6">
              <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
                <Summary label="Campaign" value={name || "Not set"} onEdit={() => go(0)} />
                <Summary label="Send from" value={senders.map((a) => a.label).join(", ") || "None chosen"} onEdit={() => go(0)} />
                <Summary label="Lead list" value={list ? `${list.name} · ${listSize.toLocaleString()} leads` : "None chosen"} onEdit={() => go(1)} />
                <Summary
                  label="Who"
                  value={`${settings.degrees.map((d) => DEGREE_LABEL[d]).join(", ")} connections${settings.premiumOnly ? ", Premium only" : ""}${settings.skipOtherCampaigns ? "" : ", including people in other campaigns"}`}
                  onEdit={() => go(2)}
                />
                <Summary
                  label="When"
                  value={`${daysText(settings.days)}${settings.startAt ? `, from ${startText(settings.startAt)}` : ", starting right away"}`}
                  onEdit={() => go(2)}
                />
                <Summary label="Sequence" value={steps.map(stepLabel).join(" → ") || "No steps"} onEdit={() => go(3)} />
              </dl>
              {estimate && <p className="text-[15px] text-stone-500">{estimate}</p>}
              <div>
                <h3 className="mb-1 text-[17px] font-semibold text-stone-900">Preview</h3>
                <p className="mb-3 text-[15px] text-stone-500">Exactly what a few people from your list would receive.</p>
                <Preview steps={steps} sample={list?.sample ?? []} />
              </div>
            </div>
          )}
        </Card>

        <div className="sticky bottom-3 z-20 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-pop backdrop-blur">
          {(error || here.length > 0 || (last && allProblems.length > 0)) && (
            <div className="mb-3 flex items-start gap-2 text-[15px]">
              <AlertCircle className={cx("mt-0.5 h-4 w-4 shrink-0", error ? "text-rose-600" : "text-amber-600")} aria-hidden />
              <p className={error ? "text-rose-700" : "text-stone-600"}>
                {error ?? (here.length > 0 ? `To continue: ${here[0]}` : `Before launching: ${allProblems[0]}`)}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {current > 0 && (
                <button className={btn.ghost} onClick={() => go(current - 1)} disabled={pending}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </button>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {launched ? (
                <button className={btn.primary} disabled={pending || allProblems.length > 0} onClick={() => save(false)} title={allProblems[0]}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save changes
                </button>
              ) : (
                <button className={btn.secondary} disabled={pending || !name.trim()} onClick={() => save(false)}>
                  Save draft
                </button>
              )}
              {!last && (
                <button className={launched ? btn.secondary : btn.primary} disabled={here.length > 0} onClick={() => go(current + 1)}>
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              )}
              {last && !launched && (
                <button className={btn.primary} disabled={pending || allProblems.length > 0} onClick={() => setConfirm(true)}>
                  <Rocket className="h-4 w-4" aria-hidden /> Launch campaign
                </button>
              )}
            </div>
          </div>
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
        <LaunchModal
          senders={senders}
          list={list}
          settings={settings}
          usesInvites={usesInvites}
          invitesPerDay={invitesPerDay}
          days={days}
          error={error}
          pending={pending}
          onCancel={() => setConfirm(false)}
          onLaunch={() => save(true)}
        />
      )}
    </div>
  );
}

function Summary({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3">
      <dt className="flex items-center justify-between text-[13px] font-medium uppercase tracking-wide text-stone-400">
        {label}
        <button type="button" onClick={onEdit} className="normal-case tracking-normal text-brand-800 hover:underline">
          Edit
        </button>
      </dt>
      <dd className="mt-0.5 break-words text-stone-800">{value}</dd>
    </div>
  );
}
