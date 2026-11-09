"use client";

import { AI_COSTS, VIDEO_INTRO_MAX, VIDEO_RECORDING } from "@invytra/shared";
import { Minus, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeVideoAction, tryVideoAction, updateVideoAction } from "@/app/workspace/videos/actions";

export type VideoRow = { id: string; name: string; seconds: number; introMs: number; voiceId: string | null; added: string };

/** Your recordings: set how long the greeting is, which voice says names, try it with a name, or delete. */
export function VideoList({ videos, voices }: { videos: VideoRow[]; voices: { id: string; name: string }[] }) {
  if (!videos.length) return null;
  return (
    <section className="space-y-4">
      {videos.map((v) => (
        <VideoCard key={v.id} v={v} voices={voices} />
      ))}
    </section>
  );
}

function VideoCard({ v, voices }: { v: VideoRow; voices: { id: string; name: string }[] }) {
  const router = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [introMs, setIntroMs] = useState(v.introMs);
  const [greeting, setGreeting] = useState("Hi Alex,");
  const [sample, setSample] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [making, startMaking] = useTransition();

  const save = (change: { introMs?: number; voiceId?: string }) =>
    start(async () => {
      setError("");
      const r = await updateVideoAction(v.id, change);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });

  const nudge = (d: number) => {
    const ms = Math.min(VIDEO_RECORDING.introMaxMs, Math.max(VIDEO_RECORDING.introMinMs, introMs + d));
    setIntroMs(ms);
    save({ introMs: ms });
  };

  /** Plays just the greeting part, to check where it ends. */
  const playGreeting = () => {
    const p = player.current;
    if (!p) return;
    p.currentTime = 0;
    void p.play();
    const stopAt = () => {
      if (p.currentTime * 1000 >= introMs) {
        p.pause();
        p.removeEventListener("timeupdate", stopAt);
      }
    };
    p.addEventListener("timeupdate", stopAt);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-0 md:grid-cols-[minmax(0,320px)_1fr]">
        <video ref={player} src={`/api/videos/${v.id}`} poster={`/api/videos/${v.id}?f=poster`} controls playsInline preload="none" className="aspect-video w-full bg-black object-contain" />
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-stone-900">{v.name}</p>
              <p className="text-[13px] text-stone-500">
                {v.seconds} seconds · added {v.added}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete the video "${v.name}"? Message steps using it will send without the video.`)) return;
                start(async () => {
                  const r = await removeVideoAction(v.id);
                  if (!r.ok) setError(r.error);
                  else router.refresh();
                });
              }}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-stone-500 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-stone-700">
            <div className="flex items-center gap-2">
              <span>Greeting</span>
              <div className="inline-flex items-center rounded-lg border border-stone-300">
                <button type="button" aria-label="Shorter" disabled={pending} onClick={() => nudge(-250)} className="px-2 py-1.5 text-stone-500 hover:text-stone-900">
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="w-14 text-center tabular-nums">{(introMs / 1000).toFixed(2)} s</span>
                <button type="button" aria-label="Longer" disabled={pending} onClick={() => nudge(250)} className="px-2 py-1.5 text-stone-500 hover:text-stone-900">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <button type="button" onClick={playGreeting} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-stone-600 hover:bg-stone-100">
                <Play className="h-3.5 w-3.5" aria-hidden /> Play it
              </button>
            </div>
            <label className="flex items-center gap-2">
              Voice for names
              <select value={v.voiceId ?? ""} disabled={pending} onChange={(e) => save({ voiceId: e.target.value })} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[14px] focus:border-stone-500 focus:outline-none">
                {!v.voiceId && <option value="">Pick a voice</option>}
                {voices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[13px] text-stone-500">The greeting should end right after “Hi there,”. Play it to check, and nudge it if it cuts off a word.</p>

          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <input value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={VIDEO_INTRO_MAX} aria-label="Greeting to try" placeholder="Just the greeting, e.g. Hi Alex," className="min-w-[160px] flex-1 rounded-lg border border-stone-300 px-3 py-2 text-[14px] focus:border-stone-500 focus:outline-none" />
            <button
              type="button"
              disabled={making || !greeting.trim() || !v.voiceId}
              onClick={() =>
                startMaking(async () => {
                  setError("");
                  const r = await tryVideoAction(v.id, greeting);
                  if (!r.ok) return setError(r.error);
                  setSample(r.value.src);
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] font-medium text-stone-700 hover:border-stone-400 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> {making ? "Making… (about a minute)" : `Try it · ${AI_COSTS.VIDEO} credits`}
            </button>
          </div>
          <p className="text-[12px] text-stone-500">Type only the few words that replace “Hi there,” (like “Hi Alex,” or “Hey Priya,”). The rest of your video stays as you recorded it.</p>
          {sample && <video src={sample} controls autoPlay playsInline className="aspect-video w-full rounded-xl bg-black object-contain" />}
          {error && <p className="text-[13px] text-rose-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}
