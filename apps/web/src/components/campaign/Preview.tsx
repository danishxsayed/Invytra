"use client";

import { AI_SIGNAL_LABEL, NOTE_MAX, MESSAGE_MAX, fillTemplate, usesAiLine, type AiSettings, type AiSignal, type CampaignStep } from "@invytra/shared";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { previewAiLinesAction } from "@/app/app/campaigns/actions";
import type { AiPreviewLine } from "@/lib/ai-preview";
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
export function Preview({
  steps,
  sample,
  ai,
}: {
  steps: CampaignStep[];
  sample: SampleLead[];
  /** For writing real {aiLine}s for these people (needs a sender through Unipile). */
  ai?: { listId: string; accountIds: string[]; settings: AiSettings } | null;
}) {
  const [i, setI] = useState(0);
  const [lines, setLines] = useState<Record<string, AiPreviewLine>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [writing, start] = useTransition();
  const withAi = usesAiLine(steps);
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
  const aiFor = lead ? lines[lead.id] : undefined;
  const vars = { firstName: lead.firstName, lastName: lead.lastName, company: lead.company, title: lead.title, aiLine: aiFor ? aiFor.line : "✦ AI line" };
  // The longest text using {aiLine} sets the room the AI has.
  const aiTemplate = steps.map((s) => (s.type === "INVITE" ? s.note : s.type === "MESSAGE" || s.type === "COMMENT" ? s.text : "")).find((t) => t.includes("{aiLine}")) ?? "";
  const aiLimit = steps.some((s) => s.type === "INVITE" && s.note.includes("{aiLine}")) ? NOTE_MAX : MESSAGE_MAX;
  const writeLines = () =>
    ai &&
    start(async () => {
      setAiError(null);
      const r = await previewAiLinesAction({ listId: ai.listId, accountIds: ai.accountIds, ai: ai.settings, template: aiTemplate, limit: aiLimit });
      if (!r.ok) return setAiError(r.error);
      setLines(Object.fromEntries(r.value.map((x) => [x.leadId, x])));
    });

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
      {withAi && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-violet-900">
              {aiFor?.line
                ? <>AI line from: <span className="font-semibold">{aiFor.signal === "fallback" ? "your fallback line" : AI_SIGNAL_LABEL[aiFor.signal as AiSignal] ?? "their profile"}</span></>
                : aiFor?.note ?? "✦ AI line is written from each person's profile when it's sent."}
            </p>
            {ai && (
              <button
                type="button"
                onClick={writeLines}
                disabled={writing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {writing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {writing ? "Reading their profiles…" : Object.keys(lines).length ? "Write again" : `Write AI lines for ${sample.length} ${sample.length === 1 ? "person" : "people"}`}
              </button>
            )}
          </div>
          {aiError && <p role="alert" className="mt-1.5 text-[14px] text-rose-700">{aiError}</p>}
        </div>
      )}
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
