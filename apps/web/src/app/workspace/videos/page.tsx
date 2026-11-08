import { prisma } from "@invytra/db";
import { AI_COSTS, VIDEOS_MAX } from "@invytra/shared";
import { AddVideo } from "@/components/videos/AddVideo";
import { VideoList } from "@/components/videos/VideoList";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { listVideos } from "@/lib/videos";
import { listVoices } from "@/lib/voices";

export const metadata = { title: "Your videos" };
export const dynamic = "force-dynamic";

/** Recordings for video notes: record once, then each person gets it with their own name. */
export default async function VideosPage() {
  const me = await requireUser();
  const [videos, voices] = await Promise.all([listVideos(prisma, me.workspace.id), listVoices(prisma, me.workspace.id)]);
  const voiceList = voices.map((v) => ({ id: v.id, name: v.name }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Your videos</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-stone-500">
          Record a short video once. Invytra sends it from LinkedIn message steps with each person's name spoken at the start, in your voice, with your lips matched. It plays
          right inside their LinkedIn chat. Each video note uses {AI_COSTS.VIDEO} AI credits.
        </p>
      </div>
      <VideoList
        videos={videos.map((v) => ({ id: v.id, name: v.name, seconds: Math.round(v.durationMs / 1000), introMs: v.introMs, voiceId: v.voice?.id ?? null, added: timeAgo(v.createdAt) }))}
        voices={voiceList}
      />
      {videos.length < VIDEOS_MAX ? (
        <AddVideo first={!videos.length} voices={voiceList} voicesHref={hubHref("/voices")} />
      ) : (
        <p className="text-[14px] text-stone-500">You have {VIDEOS_MAX} videos, the most you can keep. Delete one to add another.</p>
      )}
    </div>
  );
}
