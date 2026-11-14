import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  VideoError,
  VoiceError,
  cachedVideo,
  dropVideoCache,
  greetingEndMs,
  lipSyncFromEnv,
  personalVideo,
  prepareRecording,
  videoCacheName,
  videoPath,
  voiceFromEnv,
  type LipSync,
  type PrismaClient,
  type VoiceMaker,
} from "@invytra/db";
import { VIDEOS_MAX, VIDEO_INTRO_MAX, VIDEO_RECORDING } from "@invytra/shared";
import type { Result } from "./accounts";
import { chargeAi, refundAi } from "./ai-credits";

/*
 * Recordings for video notes. Compressed and kept under VIDEO_DIR (<workspace>/<id>.mp4 +
 * .jpg). Added only after the user confirms it's them and they agree (saved with who and when).
 */

const reason = (e: unknown) => (e instanceof VideoError || e instanceof VoiceError ? e.message : "Something went wrong making the video. Please try again in a minute.");
const NOT_READY = "Video notes aren't available yet. Please try again later.";

export const listVideos = (prisma: PrismaClient, workspaceId: string) =>
  prisma.videoRecording.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, durationMs: true, introMs: true, width: true, height: true, createdAt: true, voice: { select: { id: true, name: true } } },
  });

export type NewVideo = { name: string; consent: boolean; voiceId: string };

/** Checks before the upload is read (cheap): consent, name, voice, room for another. */
export async function checkNewVideo(prisma: PrismaClient, workspaceId: string, input: NewVideo): Promise<Result<{ name: string }>> {
  if (!input.consent) return { ok: false, error: "Please confirm this is you and that you agree to the video being personalized." };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the video a name (e.g. “Intro for founders”)." };
  if (!(await prisma.voiceClone.findFirst({ where: { id: input.voiceId, workspaceId }, select: { id: true } }))) return { ok: false, error: "Pick your voice (it says each person's name)." };
  if ((await prisma.videoRecording.count({ where: { workspaceId } })) >= VIDEOS_MAX) return { ok: false, error: `You can keep up to ${VIDEOS_MAX} videos. Delete one first.` };
  return { ok: true, value: { name } };
}

/** Compresses the uploaded file (`upload`, a temp file), finds the greeting, and saves it. */
export async function addVideo(prisma: PrismaClient, workspaceId: string, userId: string, input: NewVideo, upload: string): Promise<Result<{ id: string }>> {
  const ok = await checkNewVideo(prisma, workspaceId, input);
  if (!ok.ok) return ok;
  const row = await prisma.videoRecording.create({
    data: { workspaceId, name: ok.value.name, voiceId: input.voiceId, file: "", poster: "", durationMs: 0, introMs: VIDEO_RECORDING.introDefaultMs, width: 0, height: 0, consentAt: new Date(), consentByUserId: userId },
    select: { id: true },
  });
  const file = `${workspaceId}/${row.id}.mp4`;
  const poster = `${workspaceId}/${row.id}.jpg`;
  try {
    await mkdir(path.dirname(videoPath(file)), { recursive: true });
    const info = await prepareRecording(upload, { video: videoPath(file), poster: videoPath(poster) }, VIDEO_RECORDING.maxSeconds);
    if (info.durationMs < VIDEO_RECORDING.minSeconds * 1000) throw new VideoError(`Record at least ${VIDEO_RECORDING.minSeconds} seconds.`);
    const introMs = await greetingEndMs(videoPath(file), { minMs: VIDEO_RECORDING.introMinMs, maxMs: VIDEO_RECORDING.introMaxMs, fallbackMs: VIDEO_RECORDING.introDefaultMs });
    await prisma.videoRecording.update({ where: { id: row.id }, data: { file, poster, durationMs: info.durationMs, width: info.width, height: info.height, introMs } });
    return { ok: true, value: { id: row.id } };
  } catch (e) {
    await prisma.videoRecording.delete({ where: { id: row.id } });
    await rm(videoPath(file), { force: true }).catch(() => undefined);
    await rm(videoPath(poster), { force: true }).catch(() => undefined);
    return { ok: false, error: e instanceof VideoError ? e.message : "We couldn't read that video. Try recording again, or upload an mp4, mov or webm." };
  }
}

/** Renames it, or changes its voice or how long the greeting at the start is. */
export async function updateVideo(prisma: PrismaClient, workspaceId: string, id: string, change: { name?: string; voiceId?: string; introMs?: number }): Promise<Result> {
  const v = await prisma.videoRecording.findFirst({ where: { id, workspaceId }, select: { id: true, durationMs: true } });
  if (!v) return { ok: false, error: "That video is gone." };
  const data: { name?: string; voiceId?: string; introMs?: number } = {};
  if (change.name !== undefined) {
    data.name = change.name.trim().slice(0, 60);
    if (!data.name) return { ok: false, error: "Give the video a name." };
  }
  if (change.voiceId !== undefined) {
    if (!(await prisma.voiceClone.findFirst({ where: { id: change.voiceId, workspaceId }, select: { id: true } }))) return { ok: false, error: "Pick one of your voices." };
    data.voiceId = change.voiceId;
  }
  if (change.introMs !== undefined) {
    const ms = Math.round(change.introMs / 50) * 50;
    if (!(ms >= VIDEO_RECORDING.introMinMs && ms <= VIDEO_RECORDING.introMaxMs && ms < v.durationMs - 1000)) return { ok: false, error: "The greeting must be 1 to 5 seconds long." };
    data.introMs = ms;
  }
  await prisma.videoRecording.update({ where: { id: v.id }, data });
  return { ok: true, value: undefined };
}

/** Deletes it and its files. Steps using it then send without the video. */
export async function removeVideo(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const v = await prisma.videoRecording.findFirst({ where: { id, workspaceId } });
  if (!v) return { ok: false, error: "That video is already gone." };
  await prisma.videoRecording.delete({ where: { id: v.id } });
  for (const f of [v.file, v.poster, `${workspaceId}/try-${v.id}.mp4`]) if (f) await rm(videoPath(f), { force: true }).catch(() => undefined);
  await dropVideoCache(workspaceId, v.id).catch(() => undefined);
  return { ok: true, value: undefined };
}

/**
 * The video as one person would get it, with `greeting` (e.g. "Hi Alex,"): 50 AI credits,
 * paid back if it can't be made. Saved as <workspace>/try-<id>.mp4 (one per recording).
 */
export async function tryVideo(
  prisma: PrismaClient,
  workspaceId: string,
  id: string,
  greeting: string,
  tools: { voice?: VoiceMaker | null; lipsync?: LipSync | null } = {},
): Promise<Result<{ file: string }>> {
  const line = greeting.trim().slice(0, VIDEO_INTRO_MAX);
  if (!line) return { ok: false, error: "Type the greeting to hear, e.g. “Hi Alex,”." };
  const v = await prisma.videoRecording.findFirst({ where: { id, workspaceId }, select: { id: true, file: true, introMs: true, voice: { select: { providerVoiceId: true } } } });
  if (!v) return { ok: false, error: "That video is gone." };
  if (!v.voice) return { ok: false, error: "Pick the voice that says each person's name first." };
  const voice = tools.voice !== undefined ? tools.voice : voiceFromEnv();
  const lipsync = tools.lipsync !== undefined ? tools.lipsync : lipSyncFromEnv();
  if (!voice || !lipsync) return { ok: false, error: NOT_READY };
  const paid = await chargeAi(prisma, workspaceId, "VIDEO", "video-try");
  if (!paid.ok) return paid;
  try {
    const providerVoiceId = v.voice.providerVoiceId;
    // Same cache as campaigns: trying "Hi Alex," twice makes it once.
    const name = videoCacheName(workspaceId, v.id, { introMs: v.introMs, voice: providerVoiceId, greeting: line });
    const { data: mp4 } = await cachedVideo(name, async () => personalVideo(videoPath(v.file), v.introMs, await voice.speak(providerVoiceId, line), lipsync));
    const file = `${workspaceId}/try-${v.id}.mp4`;
    await writeFile(videoPath(file), mp4);
    return { ok: true, value: { file } };
  } catch (e) {
    await refundAi(prisma, workspaceId, paid.value);
    return { ok: false, error: reason(e) };
  }
}
