"use client";

import { MAX_OF, MAX_STEPS, VOICE_STARTER, canAddMessage, type CampaignSettings, type CampaignStep } from "@invytra/shared";
import { CalendarPlus, ChevronDown, Eye, Mail, MessageCircle, MessageSquare, Mic, Plus, ThumbsUp, UserPlus, Video } from "lucide-react";
import { useState } from "react";
import { cx } from "../ui";

type Kind = "INVITE" | "MESSAGE" | "VISIT" | "FOLLOW" | "LIKE_POST" | "COMMENT" | "INMAIL" | "VOICE" | "VIDEO" | "EVENT";

interface CardDef {
  kind: Kind;
  title: string;
  body: string;
  icon: typeof Eye;
  tone: string;
}

const CARD: Record<Kind, CardDef> = {
  INVITE: { kind: "INVITE", title: "Send connection request", body: "Invite them to connect, with or without a note.", icon: UserPlus, tone: "bg-rose-600 text-white" },
  MESSAGE: { kind: "MESSAGE", title: "Send message", body: "A message or follow-up to people who are connected with you.", icon: MessageSquare, tone: "bg-sky-600 text-white" },
  VISIT: { kind: "VISIT", title: "View profile", body: "Viewing their profile notifies them and keeps you on their mind.", icon: Eye, tone: "bg-stone-900 text-white" },
  FOLLOW: { kind: "FOLLOW", title: "Follow profile", body: "Follow them to show interest and see what they post.", icon: Plus, tone: "bg-orange-500 text-white" },
  LIKE_POST: { kind: "LIKE_POST", title: "Like post", body: "Like their latest post to get noticed before you pitch.", icon: ThumbsUp, tone: "bg-violet-600 text-white" },
  COMMENT: { kind: "COMMENT", title: "Like and comment on post", body: "Like their latest post and leave a short comment to start a conversation.", icon: MessageCircle, tone: "bg-amber-700 text-white" },
  INMAIL: { kind: "INMAIL", title: "Send InMail", body: "Message people you aren't connected with (needs Premium or Sales Navigator).", icon: Mail, tone: "bg-emerald-700 text-white" },
  VOICE: { kind: "VOICE", title: "Send voice message", body: "A voice note in your own voice, with their name (5 AI credits each).", icon: Mic, tone: "bg-violet-700 text-white" },
  VIDEO: { kind: "VIDEO", title: "Send video message", body: "A short video to a connection.", icon: Video, tone: "bg-stone-500 text-white" },
  EVENT: { kind: "EVENT", title: "Invite to event", body: "Invite a connection to one of your LinkedIn events.", icon: CalendarPlus, tone: "bg-indigo-600 text-white" },
};

const SOON = new Set<Kind>(["INMAIL", "VIDEO"]);

const SECTIONS: { key: string; title: string; groups: { title: string; kinds: Kind[] }[] }[] = [
  {
    key: "basic",
    title: "Basic steps",
    groups: [
      { title: "Connect to new LinkedIn profiles, or message your connections", kinds: ["INVITE", "MESSAGE"] },
      { title: "Impress your LinkedIn connections", kinds: ["VOICE", "VIDEO"] },
    ],
  },
  {
    key: "advanced",
    title: "Advanced steps",
    groups: [
      { title: "Warm up LinkedIn profiles for the perfect pitch", kinds: ["VISIT", "FOLLOW", "LIKE_POST", "COMMENT"] },
      { title: "Connect to new LinkedIn profiles", kinds: ["INVITE", "MESSAGE", "INMAIL"] },
      { title: "Build the relationship", kinds: ["MESSAGE", "EVENT"] },
    ],
  },
];

/** The step to add for a card, with a sensible wait before it. */
function newStep(kind: Kind, steps: CampaignStep[]): CampaignStep {
  const first = steps.length === 0;
  const afterInvite = steps.at(-1)?.type === "INVITE";
  const days = first ? 0 : afterInvite ? 1 : kind === "MESSAGE" && steps.some((s) => s.type === "MESSAGE") ? 3 : 1;
  if (kind === "INVITE") return { type: "INVITE", delayDays: days, note: "" };
  if (kind === "MESSAGE") return { type: "MESSAGE", delayDays: days, text: "" };
  // A message step that sends a voice note (the voice is picked in the step; text is optional).
  if (kind === "VOICE") return { type: "MESSAGE", delayDays: days, text: "", voice: { voiceId: "", script: VOICE_STARTER }, voiceOnly: true };
  if (kind === "FOLLOW") return { type: "FOLLOW", delayDays: days };
  if (kind === "LIKE_POST") return { type: "LIKE_POST", delayDays: days };
  if (kind === "COMMENT") return { type: "COMMENT", delayDays: days, text: "" };
  if (kind === "EVENT") return { type: "EVENT", delayDays: days, eventUrl: "" };
  return { type: "VISIT", delayDays: days };
}

/** "Add step to your sequence": cards in a Basic and an Advanced section. */
export function StepPicker({
  steps,
  settings,
  onAdd,
  viaUnipile = false,
}: {
  steps: CampaignStep[];
  settings: CampaignSettings;
  onAdd: (s: CampaignStep) => void;
  /** Every sending account is connected through Unipile, which can't follow or invite to events. */
  viaUnipile?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true, advanced: false });
  const count = (t: CampaignStep["type"]) => steps.filter((s) => s.type === t).length;

  /** Why a card can't be used right now, or null. */
  const blocked = (kind: Kind): string | null => {
    if (SOON.has(kind)) return null;
    if (viaUnipile && (kind === "FOLLOW" || kind === "EVENT")) return "Not available for accounts connected with Secure login.";
    if (steps.length >= MAX_STEPS) return `A sequence can have up to ${MAX_STEPS} steps.`;
    if (kind === "INVITE" && count("INVITE") >= MAX_OF.INVITE) return "Already in your sequence.";
    if ((kind === "MESSAGE" || kind === "VOICE" || kind === "EVENT") && !canAddMessage(steps, settings)) return "Add a connection request first, or include 1st-degree connections in Configure.";
    if (kind === "COMMENT" && count("COMMENT") >= MAX_OF.COMMENT) return `Up to ${MAX_OF.COMMENT} per sequence.`;
    if (kind === "EVENT" && count("EVENT") >= MAX_OF.EVENT) return `Up to ${MAX_OF.EVENT} per sequence.`;
    if (kind === "VISIT" && count("VISIT") >= MAX_OF.VISIT) return `Up to ${MAX_OF.VISIT} per sequence.`;
    if (kind === "LIKE_POST" && count("LIKE_POST") >= MAX_OF.LIKE_POST) return `Up to ${MAX_OF.LIKE_POST} per sequence.`;
    if (kind === "FOLLOW" && count("FOLLOW") >= MAX_OF.FOLLOW) return "Already in your sequence.";
    return null;
  };

  return (
    <section aria-labelledby="add-step" className="rounded-2xl border border-stone-200 bg-white">
      <h3 id="add-step" className="px-5 pt-5 text-[18px] font-semibold text-stone-900">
        {steps.length === 0 ? "Add the first step to your sequence" : "Add step to your sequence"}
      </h3>
      <div className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
        {SECTIONS.map((sec) => (
          <div key={sec.key}>
            <button
              type="button"
              aria-expanded={open[sec.key]}
              onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left text-[16px] font-semibold text-stone-800 hover:bg-stone-50"
            >
              {sec.title}
              <ChevronDown className={cx("h-5 w-5 text-stone-400 transition", open[sec.key] && "rotate-180")} aria-hidden />
            </button>
            {open[sec.key] && (
              <div className="space-y-5 px-5 pb-5">
                {sec.groups.map((g) => (
                  <div key={g.title}>
                    <p className="mb-2.5 text-[15px] font-medium text-stone-600">{g.title}</p>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                      {g.kinds.map((k) => {
                        const c = CARD[k];
                        const soon = SOON.has(k);
                        const why = blocked(k);
                        const disabled = soon || !!why;
                        return (
                          <button
                            key={k}
                            type="button"
                            disabled={disabled}
                            title={why ?? undefined}
                            onClick={() => onAdd(newStep(k, steps))}
                            className={cx(
                              "relative flex min-h-[150px] flex-col rounded-xl border p-4 text-left transition",
                              disabled ? "cursor-not-allowed border-stone-200 bg-stone-100/70" : "border-stone-200 bg-white hover:border-stone-400 hover:shadow-sm",
                            )}
                          >
                            {soon && <span className="absolute right-3 top-3 rounded-full bg-sky-100 px-2 py-0.5 text-[12px] font-semibold text-sky-800">Coming soon</span>}
                            <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg", disabled ? "bg-stone-200 text-stone-400" : c.tone)}>
                              <c.icon className="h-[18px] w-[18px]" aria-hidden />
                            </span>
                            <span className={cx("mt-3 text-[15px] font-semibold", disabled ? "text-stone-500" : "text-stone-900")}>{c.title}</span>
                            <span className="mt-0.5 text-[13px] text-stone-500">{why ?? c.body}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
