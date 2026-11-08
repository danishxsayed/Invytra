"use client";

import { VIDEO_RECORDING, VIDEO_RECORDING_GREETING } from "@invytra/shared";
import { Square, Upload, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "../ui";

const SCRIPT = `${VIDEO_RECORDING_GREETING} … (short pause) … thanks for connecting! I had a look at what you're working on and thought I'd say hello properly. We help teams like yours … [one line about what you do]. If that sounds useful, just reply here and I'll send over a few ideas. Have a great day!`;

/** Record (or upload) a short video that starts with "Hi there,", pick the voice for names, and save it. */
export function AddVideo({ first, voices, voicesHref }: { first: boolean; voices: { id: string; name: string }[]; voicesHref: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const live = useRef<HTMLVideoElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (!file) return setUrl("");
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  // Stop by itself at the longest a video note can be.
  useEffect(() => {
    if (recording && seconds >= VIDEO_RECORDING.maxSeconds) stop();
  }, [recording, seconds]);

  async function record() {
    setError("");
    setFile(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      if (live.current) {
        live.current.srcObject = s;
        await live.current.play().catch(() => undefined);
      }
      const r = new MediaRecorder(s, { videoBitsPerSecond: 2_500_000 });
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const type = (r.mimeType || "video/webm").split(";")[0]!;
        setFile(new File(parts, `my-video.${type.includes("mp4") ? "mp4" : "webm"}`, { type }));
      };
      r.start(1000);
      rec.current = r;
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((x) => x + 1), 1000);
    } catch {
      setError("Your browser didn't allow the camera and microphone. Allow them, or upload a video instead.");
    }
  }
  function stop() {
    rec.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }
  const tooShort = !!file && file.name.startsWith("my-video") && seconds < VIDEO_RECORDING.minSeconds;
  const ready = !!file && !tooShort && consent && !!name.trim() && !!voiceId && progress === null;

  function save() {
    if (!file) return;
    setError("");
    setProgress(0);
    const q = new URLSearchParams({ name, voiceId, consent: consent ? "yes" : "no" });
    // XHR (not fetch) to show upload progress.
    const x = new XMLHttpRequest();
    x.open("POST", `/api/videos?${q}`);
    x.setRequestHeader("content-type", file.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      setProgress(null);
      let r: { ok?: boolean; error?: string } = {};
      try {
        r = JSON.parse(x.responseText);
      } catch {
        // not JSON
      }
      if (!r.ok) return setError(r.error ?? "The upload didn't go through. Please try again.");
      setFile(null);
      setName("");
      setConsent(false);
      router.refresh();
    };
    x.onerror = () => (setProgress(null), setError("The upload didn't go through. Check your connection and try again."));
    x.send(file);
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-[17px] font-semibold text-stone-900">{first ? "Record your video" : "Add another video"}</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-stone-500">
        Look at the camera and start with <b className="text-stone-800">“{VIDEO_RECORDING_GREETING}”</b>, then pause for a breath before carrying on. For each person, Invytra replaces “{VIDEO_RECORDING_GREETING}” with
        their name in your voice, with your lips matched. {VIDEO_RECORDING.minSeconds}–{VIDEO_RECORDING.maxSeconds} seconds.
      </p>
      <blockquote className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-[15px] leading-relaxed text-stone-700">{SCRIPT}</blockquote>

      {!voices.length && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
          Your voice says each person's name, so add your voice first.{" "}
          <a href={voicesHref} className="font-medium underline">
            Record your voice
          </a>{" "}
          (about a minute).
        </p>
      )}

      <div className={cx("mt-4 overflow-hidden rounded-xl bg-stone-900", !recording && !url && "hidden")}>
        <video ref={live} muted playsInline className={cx("aspect-video w-full -scale-x-100 object-cover", !recording && "hidden")} />
        {!recording && url && <video src={url} controls playsInline className="aspect-video w-full bg-black object-contain" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-rose-700">
            <Square className="h-4 w-4" aria-hidden /> Stop ({fmt(seconds)} / {fmt(VIDEO_RECORDING.maxSeconds)})
          </button>
        ) : (
          <button type="button" onClick={record} disabled={progress !== null} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white hover:bg-stone-800">
            <Video className="h-4 w-4" aria-hidden /> {file?.name.startsWith("my-video") ? "Record again" : "Start recording"}
          </button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-[14px] font-medium text-stone-700 hover:border-stone-400">
          <Upload className="h-4 w-4" aria-hidden /> Upload a video
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f), setSeconds(0);
            }}
          />
        </label>
        {recording && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-rose-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" /> Recording… start with “{VIDEO_RECORDING_GREETING}”
          </span>
        )}
      </div>
      {tooShort && <p className="mt-2 text-[13px] text-amber-700">That's {seconds} seconds. Record at least {VIDEO_RECORDING.minSeconds}.</p>}

      {file && !recording && (
        <div className="mt-5 space-y-3 border-t border-stone-100 pt-4">
          <div className="flex flex-wrap gap-3">
            <label className="block text-[14px] font-medium text-stone-800">
              Name this video
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Hello to founders" className="mt-1 block w-64 rounded-lg border border-stone-300 px-3 py-2 text-[15px] font-normal focus:border-stone-500 focus:outline-none" />
            </label>
            <label className="block text-[14px] font-medium text-stone-800">
              Voice for names
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={!voices.length} className="mt-1 block w-52 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] font-normal focus:border-stone-500 focus:outline-none">
                {voices.length ? voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>) : <option value="">No voice yet</option>}
              </select>
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-[14px] leading-snug text-stone-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-stone-900" />
            <span>
              This is <b>me</b> in the video. I agree that Invytra may change the greeting at the start, using an AI copy of my face and voice, only to send video
              notes from my account, and I can delete it at any time.
            </span>
          </label>
          <button type="button" onClick={save} disabled={!ready} className={cx("rounded-lg px-4 py-2 text-[14px] font-medium text-white", ready ? "bg-stone-900 hover:bg-stone-800" : "bg-stone-300")}>
            {progress === null ? "Save video" : progress < 100 ? `Uploading… ${progress}%` : "Preparing your video…"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-[14px] text-rose-700">{error}</p>}
    </section>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
