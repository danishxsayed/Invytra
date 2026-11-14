import { cachedVideo, lipSyncFromEnv, personalVideo, videoCacheName, videoPath, voiceFromEnv, type VoiceSample } from "@invytra/db";
import { leadOf, paid, type Made } from "./card.js";
import type { UnipileCtx } from "./work.js";

/*
 * Video notes (50 AI credits): the customer's recording, its opening greeting re-spoken in
 * their copied voice with this person's name and lip-synced. Paid back if it can't be made or sent.
 */

/** The video note asked for in an action's payload, or null. */
export function videoOf(p: Record<string, unknown>): { videoId: string; intro: string } | null {
  const v = p.video as { videoId?: unknown; intro?: unknown } | undefined;
  return v && typeof v.videoId === "string" && typeof v.intro === "string" && v.intro.trim() ? { videoId: v.videoId, intro: v.intro } : null;
}

/**
 * The video for one person, or: "NO_VIDEO" when the recording (or its voice) was deleted or
 * video notes aren't set up on this server (no SYNC_API_KEY / ELEVENLABS_API_KEY); "NO_CREDITS".
 * A VideoError / VoiceError (credits given back) when a service refuses.
 */
export async function videoNoteFor(ctx: UnipileCtx, campaignLeadId: string | null | undefined, videoId: string, intro: string): Promise<Made<VoiceSample> | "NO_CREDITS" | "NO_VIDEO"> {
  const voice = ctx.voice !== undefined ? ctx.voice : voiceFromEnv();
  const lipsync = ctx.lipsync !== undefined ? ctx.lipsync : lipSyncFromEnv();
  const lead = await leadOf(ctx, campaignLeadId);
  if (!voice || !lipsync || !lead) return "NO_VIDEO";
  const rec = await ctx.prisma.videoRecording.findFirst({
    where: { id: videoId, workspaceId: lead.workspaceId },
    select: { id: true, file: true, introMs: true, voice: { select: { providerVoiceId: true } } },
  });
  if (!rec?.voice) return "NO_VIDEO";
  const providerVoiceId = rec.voice.providerVoiceId;
  // Everyone with the same greeting ("Hi Priya,") gets the same video, made once.
  const cacheName = videoCacheName(lead.workspaceId, rec.id, { introMs: rec.introMs, voice: providerVoiceId, greeting: intro });
  return paid(ctx, lead, "VIDEO", async () => ({
    data: (await cachedVideo(cacheName, async () => personalVideo(videoPath(rec.file), rec.introMs, await voice.speak(providerVoiceId, intro), lipsync))).data,
    name: "video.mp4",
    type: "video/mp4",
  }));
}
