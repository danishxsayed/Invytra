"use client";

import { COMMENT_MAX, MESSAGE_MAX, NOTE_FREE_MAX, NOTE_MAX, eventUrl, type CampaignSettings, type CampaignStep } from "@invytra/shared";
import { ArrowDown, ArrowUp, CalendarPlus, Eye, MessageCircle, Hourglass, Lock, MessageSquare, Plus, ThumbsUp, Trash2, UserPlus } from "lucide-react";
import { cx } from "../ui";
import { TextTemplate } from "./TextTemplate";
import { AiWriteToggle } from "./AiWriteToggle";
import { CardEditor } from "./CardEditor";
import { VoiceNoteEditor } from "./VoiceNoteEditor";

const ICON = { VISIT: Eye, INVITE: UserPlus, MESSAGE: MessageSquare, LIKE_POST: ThumbsUp, FOLLOW: Plus, COMMENT: MessageCircle, EVENT: CalendarPlus } as const;
const TONE = {
  VISIT: "bg-teal-50 text-teal-700",
  INVITE: "bg-brand-100 text-brand-800",
  MESSAGE: "bg-sky-50 text-sky-700",
  LIKE_POST: "bg-rose-50 text-rose-600",
  FOLLOW: "bg-orange-50 text-orange-600",
  COMMENT: "bg-amber-50 text-amber-700",
  EVENT: "bg-indigo-50 text-indigo-700",
} as const;

const iconBtn = "rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent";

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
  noteBlocked = null,
  noteHint = null,
}: {
  steps: CampaignStep[];
  settings: CampaignSettings;
  onSteps: (s: CampaignStep[]) => void;
  onSettings: (s: CampaignSettings) => void;
  locked?: number;
  /** Why the invite note can't be edited (every sending account is a free LinkedIn account), or null. */
  noteBlocked?: string | null;
  /** Extra hint under the note (e.g. some senders are free accounts). */
  noteHint?: string | null;
}) {
  const set = (i: number, patch: Partial<CampaignStep>) => onSteps(steps.map((s, j) => (j === i ? ({ ...s, ...patch } as CampaignStep) : s)));
  const remove = (i: number) => onSteps(steps.filter((_, j) => j !== i));
  // Steps of a launched campaign keep their place; new ones can move among themselves.
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (i < locked || j < locked || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onSteps(next);
  };
  let messageNo = 0;

  if (steps.length === 0) return null;
  return (
    <div>

      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-stone-200">
        {steps.map((s, i) => {
          const Icon = ICON[s.type];
          const prev = steps[i - 1];
          const n = s.type === "MESSAGE" ? ++messageNo : 0;
          const title =
            s.type === "VISIT"
              ? "View profile"
              : s.type === "INVITE"
                ? "Send connection request"
                : s.type === "LIKE_POST"
                  ? "Like their latest post"
                  : s.type === "FOLLOW"
                    ? "Follow profile"
                    : s.type === "COMMENT"
                      ? "Like and comment on their latest post"
                      : s.type === "EVENT"
                        ? "Invite to event"
                    : n === 1
                      ? "Message"
                      : `Follow-up ${n - 1}`;
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
                    {i >= locked && (
                      <div className="flex shrink-0 items-center">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === locked || i === 0} className={iconBtn} aria-label={`Move ${title} up`}>
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className={iconBtn} aria-label={`Move ${title} down`}>
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => remove(i)} className={cx(iconBtn, "hover:text-rose-600")} aria-label={`Remove ${title}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {s.type === "INVITE" && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[14px] font-medium text-stone-700">
                        Note <span className="font-normal text-stone-400">(optional)</span>
                      </p>
                      {noteBlocked ? (
                        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[14px] text-amber-900">
                          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                          <span>{noteBlocked}</span>
                        </p>
                      ) : (
                        <>
                          <AiWriteToggle kind="note" on={!!s.aiWrite} onChange={(v) => set(i, { aiWrite: v || undefined })} />
                          <TextTemplate
                            label={s.aiWrite ? "Guide for the AI" : "Invite note"}
                            value={s.note}
                            onChange={(v) => set(i, { note: v })}
                            max={NOTE_MAX}
                            softMax={NOTE_FREE_MAX}
                            softMaxHint="free accounts may be cut off at 200"
                            rows={3}
                            placeholder={s.aiWrite ? "e.g. Mention their recent post or hiring, say we help clinics get more bookings, ask to connect" : "Hi {firstName}, …"}
                          />
                          <p className="mt-1.5 text-[13px] text-stone-500">
                            {noteHint ?? "Free LinkedIn accounts get a few notes a month. When they run out, invites go without a note."}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {s.type === "COMMENT" && (
                    <div className="mt-3">
                      <TextTemplate label={`Comment, step ${i + 1}`} value={s.text} onChange={(v) => set(i, { text: v })} max={COMMENT_MAX} rows={3} placeholder="Great point, {firstName}! …" />
                      <p className="mt-1.5 text-[13px] text-stone-500">
                        Likes their newest post, then posts this comment under it. Comments are public, so keep it short and general enough to fit any post. Skipped if they
                        haven&apos;t posted. At most 15 comments a day per account.
                      </p>
                    </div>
                  )}
                  {s.type === "EVENT" && (
                    <div className="mt-3">
                      <label className="block text-[14px] font-medium text-stone-700" htmlFor={`event-${i}`}>
                        Your LinkedIn event link
                      </label>
                      <input
                        id={`event-${i}`}
                        type="url"
                        value={s.eventUrl}
                        onChange={(e) => set(i, { eventUrl: e.target.value })}
                        placeholder="https://www.linkedin.com/events/…"
                        className="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-200"
                      />
                      <p className={cx("mt-1.5 text-[13px]", s.eventUrl.trim() && !eventUrl(s.eventUrl) ? "text-rose-700" : "text-stone-500")}>
                        {s.eventUrl.trim() && !eventUrl(s.eventUrl)
                          ? "That isn't a LinkedIn event link. Open your event on LinkedIn and copy the address (linkedin.com/events/…)."
                          : "An event you organise. Only your connections can be invited, so this goes after they accept. Skipped if they're already invited."}
                      </p>
                    </div>
                  )}
                  {s.type === "FOLLOW" && (
                    <p className="mt-2 text-[14px] text-stone-500">
                      Follows their profile. They get a notification, and their posts show in your feed. Skipped if you already follow them.
                    </p>
                  )}
                  {s.type === "VISIT" && (
                    <p className="mt-2 text-[14px] text-stone-500">Opens their profile like a person would. They may see that you viewed it.</p>
                  )}
                  {s.type === "LIKE_POST" && (
                    <p className="mt-2 text-[14px] text-stone-500">
                      Likes the newest post on their profile. It&apos;s a light touch that makes your name familiar. If they haven&apos;t posted, this step is
                      skipped and the sequence carries on.
                    </p>
                  )}
                  {s.type === "MESSAGE" && (
                    <div className="mt-3">
                      <AiWriteToggle kind="message" on={!!s.aiWrite} onChange={(v) => set(i, { aiWrite: v || undefined })} />
                      <TextTemplate
                        label={s.aiWrite ? `${title}: guide for the AI` : `${title} text`}
                        value={s.text}
                        onChange={(v) => set(i, { text: v })}
                        max={MESSAGE_MAX}
                        rows={4}
                        placeholder={s.aiWrite ? "e.g. Thank them for connecting, refer to their work, offer a free 15-minute audit, link: https://…" : "Write your message…"}
                      />
                      <CardEditor card={s.card} onChange={(card) => set(i, { card })} />
                      <VoiceNoteEditor voice={s.voice} onChange={(voice) => set(i, { voice })} />
                    </div>
                  )}
                </div>
              </div>
              {s.type === "INVITE" && (
                <div className="ml-[52px] mt-3 flex items-start gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-4 py-3 text-[15px] text-stone-600">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                  <span>
                    Wait for them to accept, up to
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

    </div>
  );
}
