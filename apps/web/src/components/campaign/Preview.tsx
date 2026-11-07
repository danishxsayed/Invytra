"use client";

import { AI_SIGNAL_LABEL, NOTE_MAX, MESSAGE_MAX, fillTemplate, usesAiLine, usesAiWrite, type AiSettings, type AiSignal, type CampaignStep } from "@invytra/shared";
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
  const withLine = usesAiLine(steps);
  const withWrite = usesAiWrite(steps);
  const withAi = withLine || withWrite;
  // The first step AI writes whole: its samples are previewed (the others look alike).
  const writeStep = steps.findIndex((s) => (s.type === "INVITE" || s.type === "MESSAGE") && !!s.aiWrite);
  const [written, setWritten] = useState<Record<string, AiPreviewLine>>({});
  const lead = sample[Math.min(i, sample.length - 1)];
  const texts = steps.flatMap((s, idx) =>
    s.type === "INVITE" && (s.note.trim() || s.aiWrite)
      ? [{ idx, label: "Invite note", text: s.note, aiWrite: !!s.aiWrite }]
      : s.type === "MESSAGE" && (s.text.trim() || s.aiWrite)
        ? [{ idx, label: "Message", text: s.text, aiWrite: !!s.aiWrite }]
        : s.type === "COMMENT" && s.text.trim()
          ? [{ idx, label: "Comment on their post", text: s.text, aiWrite: false }]
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
      if (withLine) {
        const r = await previewAiLinesAction({ listId: ai.listId, accountIds: ai.accountIds, ai: ai.settings, template: aiTemplate, limit: aiLimit });
        if (!r.ok) return setAiError(r.error);
        setLines(Object.fromEntries(r.value.map((x) => [x.leadId, x])));
      }
      const ws = steps[writeStep];
      if (ws && (ws.type === "INVITE" || ws.type === "MESSAGE")) {
        const r = await previewAiLinesAction({ listId: ai.listId, accountIds: ai.accountIds, ai: ai.settings, template: "", limit: 300, write: { kind: ws.type === "INVITE" ? "note" : "message", guide: ws.type === "INVITE" ? ws.note : ws.text } });
        if (!r.ok) return setAiError(r.error);
        setWritten(Object.fromEntries(r.value.map((x) => [x.leadId, x])));
      }
    });
  const samples = Math.min(sample.length, 5) * ((withLine ? 1 : 0) + (withWrite ? 1 : 0));

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
                : aiFor?.note ?? (withLine ? "✦ AI line is written from each person's profile when it's sent." : "✦ AI writes these personally for each person, from their profile, when they're sent.")}
            </p>
            {ai && (
              <button
                type="button"
                onClick={writeLines}
                disabled={writing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {writing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {writing ? "Reading their profiles…" : Object.keys(lines).length || Object.keys(written).length ? `Write again (${samples} AI credits)` : `Write AI samples for ${Math.min(sample.length, 5)} ${sample.length === 1 ? "person" : "people"} (${samples} AI credits)`}
              </button>
            )}
          </div>
          {aiError && <p role="alert" className="mt-1.5 text-[14px] text-rose-700">{aiError}</p>}
        </div>
      )}
      <div className="space-y-3">
        {texts.map((t) => {
          const sampleText = t.aiWrite && t.idx === writeStep && lead ? written[lead.id] : undefined;
          if (t.aiWrite) {
            return (
              <div key={t.idx}>
                <p className="mb-1 flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-violet-500">
                  Step {t.idx + 1} · {t.label} · <Sparkles className="h-3.5 w-3.5" aria-hidden /> written by AI for each person
                </p>
                {sampleText?.line ? (
                  <p className="max-w-[560px] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-violet-50 px-4 py-3 text-[15px] leading-relaxed text-stone-800 ring-1 ring-violet-200">{sampleText.line}</p>
                ) : (
                  <p className="max-w-[560px] rounded-2xl rounded-tl-md border border-dashed border-violet-300 px-4 py-3 text-[14.5px] leading-relaxed text-stone-500">
                    {sampleText?.note ?? (t.idx === writeStep ? "Write AI samples above to see what this person would get." : "Written personally for each person, like the step above.")}
                    {t.text.trim() && <span className="mt-1 block text-[13px] text-stone-400">Guide: {t.text}</span>}
                  </p>
                )}
              </div>
            );
          }
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
