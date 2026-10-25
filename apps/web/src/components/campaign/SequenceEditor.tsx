"use client";

import { MESSAGE_MAX, NOTE_FREE_MAX, NOTE_MAX, type CampaignSettings, type CampaignStep } from "@invytra/shared";
import { Eye, Hourglass, MessageSquare, Plus, ThumbsUp, Trash2, UserPlus } from "lucide-react";
import { cx } from "../ui";
import { TextTemplate } from "./TextTemplate";

const ICON = { VISIT: Eye, INVITE: UserPlus, MESSAGE: MessageSquare, LIKE_POST: ThumbsUp } as const;
const TONE = {
  VISIT: "bg-teal-50 text-teal-700",
  INVITE: "bg-brand-100 text-brand-800",
  MESSAGE: "bg-sky-50 text-sky-700",
  LIKE_POST: "bg-rose-50 text-rose-600",
} as const;

const addCls =
  "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-[15px] font-medium text-stone-600 transition hover:border-stone-400 hover:bg-white hover:text-stone-900";

function Days({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="number"
      min={0}
      max={60}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))))}
      className="mx-1 inline-block w-16 rounded-md border border-stone-200 bg-white px-2 py-1 text-center text-[15px] font-semibold text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-200"
    />
  );
}

/**
 * The sequence as a vertical timeline. After an invite, a "wait for them to
 * accept" stage is shown — messages only go to people who accepted.
 * `locked` = number of leading steps that can't be removed (campaign already launched).
 */
export function SequenceEditor({
  steps,
  settings,
  onSteps,
  onSettings,
  locked = 0,
}: {
  steps: CampaignStep[];
  settings: CampaignSettings;
  onSteps: (s: CampaignStep[]) => void;
  onSettings: (s: CampaignSettings) => void;
  locked?: number;
}) {
  const set = (i: number, patch: Partial<CampaignStep>) => onSteps(steps.map((s, j) => (j === i ? ({ ...s, ...patch } as CampaignStep) : s)));
  const remove = (i: number) => onSteps(steps.filter((_, j) => j !== i));
  const hasVisit = steps[0]?.type === "VISIT";
  const inviteAt = steps.findIndex((s) => s.type === "INVITE");
  let messageNo = 0;
  // A like fits best just before the invite (they see your name, then your invite). Once a campaign
  // has started, existing steps can't move, so it goes at the end.
  const addLike = () => {
    const at = inviteAt >= locked && inviteAt !== -1 ? inviteAt : steps.length;
    const like: CampaignStep = { type: "LIKE_POST", delayDays: at === 0 ? 0 : 1 };
    onSteps([...steps.slice(0, at), like, ...steps.slice(at)]);
  };

  return (
    <div>
      {inviteAt !== -1 && (
        <label className="mb-4 flex items-center gap-2 text-[15px] text-stone-700">
          <input
            type="checkbox"
            checked={hasVisit}
            disabled={locked > 0}
            onChange={(e) =>
              onSteps(e.target.checked ? [{ type: "VISIT", delayDays: 0 }, ...steps.map((s, i) => (i === 0 ? { ...s, delayDays: 1 } : s))] : steps.slice(1))
            }
            className="h-4 w-4 accent-stone-900"
          />
          Visit their profile before inviting <span className="text-stone-400">(looks more natural)</span>
        </label>
      )}

      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-stone-200">
        {steps.map((s, i) => {
          const Icon = ICON[s.type];
          const prev = steps[i - 1];
          const n = s.type === "MESSAGE" ? ++messageNo : 0;
          const title =
            s.type === "VISIT" ? "Visit profile" : s.type === "INVITE" ? "Send invite" : s.type === "LIKE_POST" ? "Like their latest post" : n === 1 ? "Message" : `Follow-up ${n - 1}`;
          const when =
            i === 0 ? (
              <span>Starts as soon as the campaign runs</span>
            ) : prev?.type === "INVITE" ? (
              <span>
                Send
                <Days label={`Days after they accept, step ${i + 1}`} value={s.delayDays} onChange={(d) => set(i, { delayDays: d })} />
                {s.delayDays === 1 ? "day" : "days"} after they accept
              </span>
            ) : (
              <span>
                Wait
                <Days label={`Days to wait, step ${i + 1}`} value={s.delayDays} onChange={(d) => set(i, { delayDays: d })} />
                {s.delayDays === 1 ? "day" : "days"}
                {s.type === "MESSAGE" && n > 1 ? ", only if they haven't replied" : ""}
              </span>
            );
          return (
            <li key={i} className="relative">
              <div className="flex gap-3">
                <span className={cx("relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white", TONE[s.type])}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[16px] font-semibold text-stone-900">{title}</p>
                      <p className="mt-0.5 text-[14px] text-stone-500">{when}</p>
                    </div>
                    {(s.type === "MESSAGE" || s.type === "LIKE_POST") && i >= locked && (
                      <button type="button" onClick={() => remove(i)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" aria-label={`Remove ${title}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {s.type === "INVITE" && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[14px] font-medium text-stone-700">
                        Note <span className="font-normal text-stone-400">(optional)</span>
                      </p>
                      <TextTemplate
                        label="Invite note"
                        value={s.note}
                        onChange={(v) => set(i, { note: v })}
                        max={NOTE_MAX}
                        softMax={NOTE_FREE_MAX}
                        softMaxHint="free accounts may be cut off at 200"
                        rows={3}
                        placeholder="Hi {firstName}, …"
                      />
                      <p className="mt-1.5 text-[13px] text-stone-500">
                        Free LinkedIn accounts get a few notes a month. When they run out, invites go without a note.
                      </p>
                    </div>
                  )}
                  {s.type === "LIKE_POST" && (
                    <p className="mt-2 text-[14px] text-stone-500">
                      Likes the newest post on their profile — a light touch that makes your name familiar. If they haven&apos;t posted, this step is
                      skipped and the sequence carries on.
                    </p>
                  )}
                  {s.type === "MESSAGE" && (
                    <div className="mt-3">
                      <TextTemplate label={`${title} text`} value={s.text} onChange={(v) => set(i, { text: v })} max={MESSAGE_MAX} rows={4} placeholder="Write your message…" />
                    </div>
                  )}
                </div>
              </div>
              {s.type === "INVITE" && (
                <div className="ml-[52px] mt-3 flex items-start gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-4 py-3 text-[15px] text-stone-600">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                  <span>
                    Wait for them to accept — up to
                    <Days
                      label="Days to wait for acceptance"
                      value={settings.acceptWithinDays}
                      onChange={(d) => onSettings({ ...settings, acceptWithinDays: Math.max(3, d) })}
                    />
                    days. Invytra checks about once a day; messages only go to people who accept.
                    <label className="mt-2 flex items-start gap-2 text-[14px] text-stone-600">
                      <input
                        type="checkbox"
                        checked={settings.withdrawExpired}
                        onChange={(e) => onSettings({ ...settings, withdrawExpired: e.target.checked })}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
                      />
                      <span>
                        Then withdraw invites that weren&apos;t accepted. Pending invites count against LinkedIn&apos;s limits, so this keeps room
                        for new ones. (LinkedIn won&apos;t let you invite that person again for about 3 weeks.)
                      </span>
                    </label>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {steps.length < 10 && (
        <div className="ml-[52px] mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSteps([...steps, { type: "MESSAGE", delayDays: steps.some((s) => s.type === "MESSAGE") ? 3 : 1, text: "" }])}
            className={addCls}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add {steps.some((s) => s.type === "MESSAGE") ? "follow-up" : "message"}
          </button>
          {steps.filter((s) => s.type === "LIKE_POST").length < 2 && (
            <button type="button" onClick={addLike} className={addCls}>
              <ThumbsUp className="h-4 w-4" aria-hidden /> Like their latest post
            </button>
          )}
        </div>
      )}
    </div>
  );
}
