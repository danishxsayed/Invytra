"use client";

import { DEFAULT_LIMITS, DEGREE_LABEL, limitsSchema, type CampaignSettings } from "@invytra/shared";
import { Check, Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import type { BuilderOptions } from "@/lib/campaigns";
import { btn } from "../AccountControls";
import { Field, inputCls } from "../fields";
import { Modal } from "../Modal";
import { cx } from "../ui";

type Account = BuilderOptions["accounts"][number];
type List = BuilderOptions["lists"][number];

const STATUS_TEXT: Record<string, string> = { ACTIVE: "Connected", DISCONNECTED: "Not connected", PAUSED: "Paused", NEEDS_ATTENTION: "Needs attention" };

export const inviteLimit = (a: Account) => (limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS).connectionRequestsPerDay;

/** Step 1: name and sending accounts. */
export function DetailsStep({
  name,
  onName,
  accounts,
  accountIds,
  onToggle,
  launched,
}: {
  name: string;
  onName: (v: string) => void;
  accounts: Account[];
  accountIds: string[];
  onToggle: (id: string) => void;
  launched: boolean;
}) {
  const chosen = accounts.filter((a) => accountIds.includes(a.id)).length;
  return (
    <div className="space-y-6">
      <Field label="Campaign name" className="max-w-xl">
        <input className={inputCls} value={name} onChange={(e) => onName(e.target.value)} maxLength={80} placeholder="e.g. Pune founders – Q4" autoFocus={!launched} />
      </Field>
      <fieldset>
        <legend className="text-[15px] font-medium text-stone-700">
          Send from {chosen > 1 && <span className="font-normal text-stone-500">· {chosen} accounts share the leads</span>}
        </legend>
        <p className="mb-2.5 text-[14px] text-stone-500">
          Pick one account, or several to go faster. Each lead is given to one of them and stays with it; every account keeps its own limits and hours.
          {launched && " Accounts can be added or removed while the campaign runs."}
        </p>
        {accounts.length === 0 ? (
          <p className="text-[15px] text-stone-600">
            <Link href="/app/accounts?add=1" className="font-semibold text-brand-800 underline">
              Connect a LinkedIn account
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => {
              const on = accountIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition",
                    on ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-200 bg-stone-50/60 hover:border-stone-300",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(a.id)} />
                  <span aria-hidden className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white")}>
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-stone-900">{a.label}</span>
                    <span className="block truncate text-[13px] text-stone-500">
                      {a.profileName ? `${a.profileName} · ` : ""}
                      <span className={a.status === "ACTIVE" ? "" : "text-amber-700"}>{STATUS_TEXT[a.status] ?? a.status}</span> · {inviteLimit(a)} invites/day
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** Step 2: which lead list (or a new one from a search). */
export function LeadsStep({
  lists,
  listId,
  onList,
  locked,
  onImport,
  estimate,
}: {
  lists: List[];
  listId: string;
  onList: (id: string) => void;
  locked: boolean;
  onImport: () => void;
  estimate: string | null;
}) {
  return (
    <div className="space-y-4">
      <Field label="Lead list" className="max-w-xl">
        <select className={inputCls} value={listId} onChange={(e) => onList(e.target.value)} disabled={locked}>
          <option value="">Choose…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.count.toLocaleString()} {l.count === 1 ? "lead" : "leads"}
              {l.coming ? " (collecting…)" : ""}
            </option>
          ))}
        </select>
      </Field>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onImport} className={btn.secondary}>
            + New list from a LinkedIn or Sales Navigator search
          </button>
        </div>
      )}
      {locked && <p className="text-[14px] text-stone-500">The lead list can't change after launch. New people added to it join automatically.</p>}
      {estimate && <p className="max-w-2xl text-[15px] text-stone-500">{estimate}</p>}
    </div>
  );
}

/** Confirmation before launch: what will happen, in plain words. */
export function LaunchModal({
  senders,
  list,
  settings,
  usesInvites,
  invitesPerDay,
  days,
  error,
  pending,
  onCancel,
  onLaunch,
}: {
  senders: Account[];
  list: List;
  settings: CampaignSettings;
  usesInvites: boolean;
  invitesPerDay: number;
  days: number;
  error: string | null;
  pending: boolean;
  onCancel: () => void;
  onLaunch: () => void;
}) {
  const listSize = list.count + list.coming;
  const levels = settings.degrees.map((d) => DEGREE_LABEL[d]).join(", ");
  return (
    <Modal title="Launch this campaign?" onClose={onCancel} busy={pending}>
      <ul className="space-y-2 text-[15px] text-stone-700">
        <li>
          <b>{senders.length === 1 ? senders[0]!.label : `${senders.length} accounts`}</b> {senders.length === 1 ? "starts" : "start"} working through{" "}
          <b>{list.coming ? `up to ${listSize.toLocaleString()}` : listSize.toLocaleString()}</b> leads in “{list.name}”{list.coming ? " as they're collected" : ""}.
        </li>
        {senders.length > 1 && <li>Each lead goes to one account and stays with it, so nobody hears from two of your accounts.</li>}
        <li>
          Only {levels} connections{settings.premiumOnly ? " with LinkedIn Premium" : ""}; anyone else is skipped.
        </li>
        <li>Sends on each account's working days and hours (Accounts → Settings).</li>
        {usesInvites && invitesPerDay > 0 && <li>Up to {invitesPerDay} invites a day, so about {days} sending {days === 1 ? "day" : "days"} to invite everyone.</li>}
        <li>
          Anyone already contacted{settings.skipOtherCampaigns ? ", or in another campaign," : ""} is skipped. Follow-ups stop when someone replies.
        </li>
        <li>You can pause at any time.</li>
      </ul>
      {error && <p className="mt-3 text-[15px] text-rose-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btn.secondary} onClick={onCancel} disabled={pending}>
          Not yet
        </button>
        <button className={btn.primary} onClick={onLaunch} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />} Launch
        </button>
      </div>
    </Modal>
  );
}
