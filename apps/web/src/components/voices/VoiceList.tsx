"use client";

import { VOICE_TRY_MAX } from "@invytra/shared";
import { AudioLines, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeVoiceAction, tryVoiceAction } from "@/app/workspace/voices/actions";

/** Your voices: hear a line in each (1 AI credit) or delete it. */
export function VoiceList({ voices }: { voices: { id: string; name: string; added: string }[] }) {
  if (!voices.length) return null;
  return (
    <section className="space-y-3">
      {voices.map((v) => (
        <VoiceRow key={v.id} v={v} />
      ))}
    </section>
  );
}

function VoiceRow({ v }: { v: { id: string; name: string; added: string } }) {
  const router = useRouter();
  const [line, setLine] = useState(`Hi Alex, it's ${v.name}. Thanks for connecting!`);
  const [audio, setAudio] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-700">
          <AudioLines className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-stone-900">{v.name}</p>
          <p className="text-[13px] text-stone-500">Added {v.added}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete the voice "${v.name}"? Message steps using it will send without the voice note.`)) return;
            start(async () => {
              const r = await removeVoiceAction(v.id);
              if (!r.ok) setError(r.error);
              else router.refresh();
            });
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-stone-500 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={VOICE_TRY_MAX} aria-label="A line to hear" className="min-w-[220px] flex-1 rounded-lg border border-stone-300 px-3 py-2 text-[14px] focus:border-stone-500 focus:outline-none" />
        <button
          type="button"
          disabled={pending || !line.trim()}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await tryVoiceAction(v.id, line);
              if (!r.ok) return setError(r.error);
              setAudio(r.value.audio);
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] font-medium text-stone-700 hover:border-stone-400"
        >
          <Play className="h-4 w-4" aria-hidden /> {pending ? "Making…" : "Hear it · 1 credit"}
        </button>
      </div>
      {audio && <audio src={audio} controls autoPlay className="mt-3 w-full" />}
      {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
    </div>
  );
}
