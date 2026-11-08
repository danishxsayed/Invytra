"use client";

import { VOICE_READING, VOICE_SAMPLE } from "@invytra/shared";
import { Mic, Square, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addVoiceAction } from "@/app/workspace/voices/actions";
import { cx } from "../ui";

/** Record (or upload) a minute of your voice, confirm it's yours, and make the copy. */
export function AddVoice({ first }: { first: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);
  useEffect(() => {
    if (!sample) return setUrl("");
    const u = URL.createObjectURL(sample);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [sample]);

  async function record() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || "audio/webm";
        setSample(new File(parts, `my-voice.${type.includes("mp4") ? "m4a" : "webm"}`, { type }));
      };
      r.start(1000);
      rec.current = r;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Your browser didn't allow the microphone. Allow it, or upload a recording instead.");
    }
  }
  function stop() {
    rec.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }
  const tooShort = !!sample && sample.name.startsWith("my-voice") && seconds < VOICE_SAMPLE.minSeconds;

  function submit() {
    if (!sample) return;
    setError("");
    const f = new FormData();
    f.set("name", name);
    f.set("consent", consent ? "yes" : "no");
    f.set("sample", sample);
    start(async () => {
      const r = await addVoiceAction(f);
      if (!r.ok) return setError(r.error);
      setSample(null);
      setName("");
      setConsent(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-[17px] font-semibold text-stone-900">{first ? "Add your voice" : "Add another voice"}</h2>
      <p className="mt-1 text-[14px] text-stone-500">Find a quiet room. Read the text below out loud at your normal pace, for about a minute.</p>
      <blockquote className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[15px] leading-relaxed text-stone-700">{VOICE_READING}</blockquote>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-rose-700">
            <Square className="h-4 w-4" aria-hidden /> Stop ({fmt(seconds)})
          </button>
        ) : (
          <button type="button" onClick={record} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white hover:bg-stone-800">
            <Mic className="h-4 w-4" aria-hidden /> {sample?.name.startsWith("my-voice") ? "Record again" : "Start recording"}
          </button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-[14px] font-medium text-stone-700 hover:border-stone-400">
          <Upload className="h-4 w-4" aria-hidden /> Upload a recording
          <input
            type="file"
            accept="audio/*,video/mp4"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSample(f), setSeconds(0);
            }}
          />
        </label>
        {recording && <span className="inline-flex items-center gap-1.5 text-[13px] text-rose-700"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" /> Recording… read the text above</span>}
      </div>

      {url && (
        <div className="mt-4 space-y-3">
          <audio src={url} controls className="w-full" />
          {tooShort && <p className="text-[13px] text-amber-700">That's under {VOICE_SAMPLE.minSeconds} seconds. A longer recording (about a minute) makes the copy sound much more like you.</p>}
          <label className="block text-[14px] font-medium text-stone-800">
            Name this voice
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Tahur" className="mt-1 block w-full max-w-xs rounded-lg border border-stone-300 px-3 py-2 text-[15px] font-normal focus:border-stone-500 focus:outline-none" />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-[14px] leading-snug text-stone-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-stone-900" />
            <span>
              This is <b>my own voice</b>. I agree that Invytra may make an AI copy of it, used only to send voice notes from my account, and I can delete it at any time.
            </span>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !consent || !name.trim() || tooShort}
            className={cx("rounded-lg px-4 py-2 text-[14px] font-medium text-white", pending || !consent || !name.trim() || tooShort ? "bg-stone-300" : "bg-stone-900 hover:bg-stone-800")}
          >
            {pending ? "Making your voice… (about 30 seconds)" : "Make my voice"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-[14px] text-rose-700">{error}</p>}
    </section>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
