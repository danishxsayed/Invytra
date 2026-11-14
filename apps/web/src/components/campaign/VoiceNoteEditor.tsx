"use client";

import {
  VOICE_SCRIPT_MAX,
  VOICE_STARTER,
  type VoiceNote,
} from "@invytra/shared";
import { Mic, Play } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { myVoicesAction, tryVoiceAction } from "@/app/workspace/voices/actions";
import { sampleCardText } from "./CardEditor";
import { cx } from "../ui";

/** "Add a voice note": a short script read in your own voice for each person (10 AI credits). LinkedIn only. */
export function VoiceNoteEditor({
  voice,
  onChange,
  disabled,
  fixed,
}: {
  voice?: VoiceNote;
  onChange: (v: VoiceNote | undefined) => void;
  disabled?: boolean;
  /** A voice message step: always on, no checkbox. */ fixed?: boolean;
}) {
  const on = !!voice;
  const [voices, setVoices] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [manage, setManage] = useState("/voices");
  const [audio, setAudio] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!on || voices) return;
    myVoicesAction().then((r) => {
      setVoices(r.voices);
      setManage(r.manage);
      if (voice && !voice.voiceId && r.voices[0])
        onChange({ ...voice, voiceId: r.voices[0].id });
    });
  }, [on, voices, voice, onChange]);

  const v = voice ?? { voiceId: "", script: "" };
  const secs = Math.round(
    v.script.trim().split(/\s+/).filter(Boolean).length / 2.5,
  );
  return (
    <div
      className={cx(
        fixed ? "" : "mt-2 rounded-xl border px-3.5 py-2.5",
        !fixed &&
          (on
            ? "border-violet-200 bg-violet-50/40"
            : "border-stone-200 bg-white"),
      )}
    >
      {fixed ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-stone-600">
          Your own voice reads this to each person, with their name, as a
          LinkedIn voice message.
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[12px] font-medium text-violet-800 ring-1 ring-violet-200">
            10 AI credits each
          </span>
        </p>
      ) : (
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-violet-700"
            checked={on}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { voiceId: "", script: VOICE_STARTER }
                  : undefined,
              )
            }
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 text-[14.5px] font-medium text-stone-900">
              <Mic className="h-4 w-4 text-violet-700" aria-hidden /> Add a
              voice note
              <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-violet-800 ring-1 ring-violet-200">
                10 AI credits each
              </span>
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
              Your own voice reads a short script with each person's name, sent
              as a LinkedIn voice message. Out of credits, it goes without it.
            </span>
          </span>
        </label>
      )}
      {on && (
        <div className="mt-3 space-y-2">
          {voices && !voices.length ? (
            <p className="rounded-lg bg-white px-3 py-2 text-[14px] text-stone-700 ring-1 ring-stone-200">
              First record your voice (about a minute).{" "}
              <a
                href={manage}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-violet-800 underline underline-offset-2"
              >
                Add your voice
              </a>
              , then come back here.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-stone-700">
              <span>Voice:</span>
              {(voices ?? []).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...v, voiceId: x.id })}
                  className={chip(v.voiceId === x.id)}
                >
                  {x.name}
                </button>
              ))}
              <a
                href={manage}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-stone-500 underline underline-offset-2 hover:text-stone-800"
              >
                Manage voices
              </a>
            </div>
          )}
          <textarea
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] leading-relaxed focus:border-stone-500 focus:outline-none"
            rows={4}
            value={v.script}
            disabled={disabled}
            maxLength={VOICE_SCRIPT_MAX}
            onChange={(e) => onChange({ ...v, script: e.target.value })}
            aria-label="What the voice note says"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-stone-500">
            <span>
              Write it the way you talk. Use {"{firstName}"} for their name. No
              links (put them in the message).
            </span>
            <span className="shrink-0">
              about {secs}s · {v.script.length}/{VOICE_SCRIPT_MAX}
            </span>
          </div>
          {voices && voices.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending || !v.voiceId || !v.script.trim()}
                onClick={() =>
                  start(async () => {
                    setError("");
                    const r = await tryVoiceAction(
                      v.voiceId,
                      sampleCardText(v.script),
                    );
                    if (!r.ok) return setError(r.error);
                    setAudio(r.value.audio);
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:border-stone-400"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />{" "}
                {pending
                  ? "Making…"
                  : `Hear it for "Alex" · ${v.script.length > 150 ? 5 : 1} credit${v.script.length > 150 ? "s" : ""}`}
              </button>
              {audio && (
                <audio
                  src={audio}
                  controls
                  autoPlay
                  className="h-9 max-w-full"
                />
              )}
            </div>
          )}
          {error && <p className="text-[13px] text-rose-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) =>
  cx(
    "rounded-full border px-3 py-1 text-[13px] transition-colors",
    on
      ? "border-stone-900 bg-stone-900 text-white"
      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400",
  );
