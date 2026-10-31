"use client";

import {
  AI_TONES,
  DEGREES,
  DEGREE_LABEL,
  FETCH_ALL_SEARCH_PAGES_PER_DAY,
  SEARCH_PAGES_PER_DAY,
  type CampaignSettings,
  type Degree,
} from "@invytra/shared";
import { Check, Lock, Sparkles } from "lucide-react";
import { Toggle, inputCls } from "../fields";
import { cx } from "../ui";

const DEGREE_HINT: Record<Degree, string> = {
  1: "Already connected: the invite is skipped, they get your messages",
  2: "Friends of your connections",
  3: "Everyone else, including out of network",
};

function Setting({
  title,
  hint,
  children,
  wide,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-stone-200/80 bg-white p-5",
        wide && "md:col-span-2",
      )}
    >
      <h3 className="text-[16px] font-semibold text-stone-900">{title}</h3>
      <p className="mb-3.5 text-[14px] text-stone-500">{hint}</p>
      {children}
    </div>
  );
}

/** Always on: shown so people know these protections exist. */
function Fixed({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[14px] font-medium text-stone-600">
      <Lock className="h-4 w-4 text-stone-400" aria-hidden /> {label}
    </p>
  );
}

/** "Configure": who to include, and how prospects are collected. Days and hours live in each account's settings. */
export function ConfigureStep({
  settings,
  onSettings,
}: {
  settings: CampaignSettings;
  onSettings: (s: CampaignSettings) => void;
}) {
  const set = (patch: Partial<CampaignSettings>) =>
    onSettings({ ...settings, ...patch });
  const toggleDegree = (d: Degree) =>
    set({
      degrees: settings.degrees.includes(d)
        ? settings.degrees.filter((x) => x !== d)
        : ([...settings.degrees, d].sort() as Degree[]),
    });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid content-start gap-4">
        <Setting
          title="Connection levels"
          hint="Who to include. Anyone else in the list is skipped before they're contacted."
        >
          <div
            className="space-y-2"
            role="group"
            aria-label="Connection levels"
          >
            {DEGREES.map((d) => {
              const on = settings.degrees.includes(d);
              return (
                <label
                  key={d}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition",
                    on
                      ? "border-stone-900 ring-1 ring-stone-900"
                      : "border-stone-200 bg-stone-50/60 hover:border-stone-300",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggleDegree(d)}
                  />
                  <span
                    aria-hidden
                    className={cx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      on
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 bg-white",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-stone-900">
                      {DEGREE_LABEL[d]}
                    </span>
                    <span className="block text-[13px] text-stone-500">
                      {DEGREE_HINT[d]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {settings.degrees.length === 0 && (
            <p className="mt-2 text-[14px] text-rose-700">
              Pick at least one connection level.
            </p>
          )}
        </Setting>
        <Setting
          title="Fetch all prospects at once"
          hint={`For lists collected from a LinkedIn or Sales Navigator search: read the whole search in one go (up to ${FETCH_ALL_SEARCH_PAGES_PER_DAY} pages, about an hour, in working hours) instead of ${SEARCH_PAGES_PER_DAY} pages a day. Faster to start, but more searching in one day.`}
        >
          <Toggle
            checked={settings.fetchAllAtOnce}
            onChange={(v) => set({ fetchAllAtOnce: v })}
            label={
              settings.fetchAllAtOnce
                ? "On: collect everyone now"
                : "Off: collect gradually"
            }
          />
        </Setting>
      </div>

      <div className="grid content-start gap-4">
        <Setting
          title="Premium only"
          hint="Only people with the LinkedIn Premium badge. Often a sign of an active, paying LinkedIn user."
        >
          <Toggle
            checked={settings.premiumOnly}
            onChange={(v) => set({ premiumOnly: v })}
            label={
              settings.premiumOnly
                ? "On: only Premium members"
                : "Off: everyone"
            }
          />
        </Setting>
        <Setting
          title="Skip people in other campaigns"
          hint="Leave on so nobody hears from two of your campaigns at once."
        >
          <Toggle
            checked={settings.skipOtherCampaigns}
            onChange={(v) => set({ skipOtherCampaigns: v })}
            label={
              settings.skipOtherCampaigns
                ? "On: skip them"
                : "Off: include them anyway"
            }
          />
        </Setting>
        <Setting
          title="Always on"
          hint="Built-in protections for your accounts and your leads."
        >
          <div className="space-y-1.5">
            <Fixed label="Skip anyone your accounts already invited or messaged" />
            <Fixed label="Stop all follow-ups as soon as someone replies" />
          </div>
        </Setting>
      </div>

      <Setting
        wide
        title="AI personalisation"
        hint="Put ✦ AI line ({aiLine}) in a note or message, and AI writes one line for each person from their LinkedIn profile: a hiring post, a recent post, their role, headline or About."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-stone-800">
              <Sparkles className="h-4 w-4 text-violet-600" aria-hidden /> What you offer
            </span>
            <textarea
              className={cx(inputCls, "mt-1.5 resize-y")}
              rows={2}
              maxLength={400}
              value={settings.ai.offer}
              onChange={(e) => set({ ai: { ...settings.ai, offer: e.target.value } })}
              placeholder="e.g. We build custom mobile apps for clinics and hospitals in India."
            />
            <span className="mt-1 block text-[13px] text-stone-500">So the line can lead naturally into your message. It's never pasted in as is.</span>
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-stone-800">Tone</span>
            <select
              className={cx(inputCls, "mt-1.5 capitalize")}
              value={settings.ai.tone}
              onChange={(e) => set({ ai: { ...settings.ai, tone: e.target.value as (typeof AI_TONES)[number] } })}
            >
              {AI_TONES.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-stone-800">Fallback line (optional)</span>
            <input
              className={cx(inputCls, "mt-1.5")}
              maxLength={200}
              value={settings.ai.fallback}
              onChange={(e) => set({ ai: { ...settings.ai, fallback: e.target.value } })}
              placeholder="e.g. Always good to connect with people in healthcare."
            />
            <span className="mt-1 block text-[13px] text-stone-500">Used when a profile has nothing specific. Leave empty to skip those people.</span>
          </label>
        </div>
        <p className="mt-3 text-[13px] text-stone-500">Written with accounts connected through Unipile. Accounts on Invytra&apos;s own browser use the fallback line.</p>
      </Setting>

      <p className="text-[14px] text-stone-500 md:col-span-2">
        Sending days, hours and the start date are set per LinkedIn account, in
        Accounts → Settings.
      </p>
    </div>
  );
}
