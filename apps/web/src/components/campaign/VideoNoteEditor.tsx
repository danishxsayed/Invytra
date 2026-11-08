"use client";

import { AI_COSTS, VIDEO_INTRO_MAX, type VideoNote } from "@invytra/shared";
import { useEffect, useState } from "react";
import { myVideosAction } from "@/app/workspace/videos/actions";
import { cx } from "../ui";

/** A "Send video message" step: which recording, and the greeting said with each person's name. */
export function VideoNoteEditor({ video, onChange, disabled }: { video: VideoNote; onChange: (v: VideoNote) => void; disabled?: boolean }) {
  const [videos, setVideos] = useState<{ id: string; name: string; hasVoice: boolean }[] | null>(null);
  const [manage, setManage] = useState("/videos");
  useEffect(() => {
    if (videos) return;
    myVideosAction().then((r) => {
      setVideos(r.videos);
      setManage(r.manage);
      if (!video.videoId && r.videos[0]) onChange({ ...video, videoId: r.videos[0].id });
    });
  }, [videos, video, onChange]);
  const chosen = videos?.find((x) => x.id === video.videoId);

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-stone-600">
        Your recorded video, with the greeting at the start said with each person&apos;s name, in your voice. Plays inside their LinkedIn chat.
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] font-medium text-rose-800 ring-1 ring-rose-200">{AI_COSTS.VIDEO} AI credits each</span>
      </p>
      {videos && !videos.length ? (
        <p className="rounded-lg bg-white px-3 py-2 text-[14px] text-stone-700 ring-1 ring-stone-200">
          First record your video (a couple of minutes).{" "}
          <a href={manage} target="_blank" rel="noreferrer" className="font-medium text-rose-800 underline underline-offset-2">
            Record a video
          </a>
          , then come back here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[14px] text-stone-700">
          <span>Video:</span>
          {(videos ?? []).map((x) => (
            <button key={x.id} type="button" disabled={disabled} onClick={() => onChange({ ...video, videoId: x.id })} className={chip(video.videoId === x.id)}>
              {x.name}
            </button>
          ))}
          <a href={manage} target="_blank" rel="noreferrer" className="text-[13px] text-stone-500 underline underline-offset-2 hover:text-stone-800">
            Manage videos
          </a>
        </div>
      )}
      {chosen && !chosen.hasVoice && <p className="text-[13px] text-amber-700">This video has no voice for names yet. Pick one in Manage videos.</p>}
      <label className="block text-[14px] font-medium text-stone-800">
        Greeting at the start
        <input
          value={video.intro}
          disabled={disabled}
          maxLength={VIDEO_INTRO_MAX}
          onChange={(e) => onChange({ ...video, intro: e.target.value })}
          className="mt-1 block w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] font-normal focus:border-stone-500 focus:outline-none"
        />
      </label>
      <p className="text-[12px] text-stone-500">Replaces “Hi there,” in your recording. Keep it short, and use {"{firstName}"} for their name. Try it with a name in Manage videos.</p>
    </div>
  );
}

const chip = (on: boolean) =>
  cx("rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400");
