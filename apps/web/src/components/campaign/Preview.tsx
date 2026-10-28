"use client";

import { fillTemplate, type CampaignStep } from "@invytra/shared";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { slugName } from "@/lib/format";
import { Avatar, cx } from "../ui";

export interface SampleLead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  profileUrl: string;
}

/** Shows the notes and messages exactly as one real lead from the list would get them. */
export function Preview({ steps, sample }: { steps: CampaignStep[]; sample: SampleLead[] }) {
  const [i, setI] = useState(0);
  const lead = sample[Math.min(i, sample.length - 1)];
  const texts = steps.flatMap((s, idx) =>
    s.type === "INVITE" && s.note.trim()
      ? [{ idx, label: "Invite note", text: s.note }]
      : s.type === "MESSAGE" && s.text.trim()
        ? [{ idx, label: "Message", text: s.text }]
        : s.type === "COMMENT" && s.text.trim()
          ? [{ idx, label: "Comment on their post", text: s.text }]
          : [],
  );
  if (!lead) return <p className="text-[15px] text-stone-500">Choose a lead list to preview your messages with a real person's details.</p>;
  if (texts.length === 0) return <p className="text-[15px] text-stone-500">Write a note or message to see a preview.</p>;

  // On LinkedIn the person's own name is known; here it comes from the list or the profile link.
  const profileName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || slugName(lead.profileUrl).replace(/\b\w/g, (c) => c.toUpperCase());
  const vars = { firstName: lead.firstName, lastName: lead.lastName, company: lead.company, title: lead.title };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {sample.map((l, j) => {
          const n = [l.firstName, l.lastName].filter(Boolean).join(" ") || slugName(l.profileUrl) || "Lead";
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setI(j)}
              className={cx(
                "inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[14px] font-medium capitalize transition",
                j === i ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300",
              )}
            >
              <Avatar name={n} size="sm" /> {n}
            </button>
          );
        })}
      </div>
      <div className="space-y-3">
        {texts.map((t) => {
          const filled = fillTemplate(t.text, vars, profileName);
          return (
            <div key={t.idx}>
              <p className="mb-1 text-[13px] font-medium uppercase tracking-wide text-stone-400">
                Step {t.idx + 1} · {t.label}
              </p>
              {filled === null ? (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  This person has no value for a placeholder you used, so they'd be skipped rather than get a broken message.
                </p>
              ) : (
                <p className="max-w-[560px] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-stone-100 px-4 py-3 text-[15px] leading-relaxed text-stone-800">{filled}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
