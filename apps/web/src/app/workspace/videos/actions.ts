"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { listVideos, removeVideo, tryVideo, updateVideo } from "@/lib/videos";
import { listVoices } from "@/lib/voices";

const id = z.string().min(1).max(40);

export async function updateVideoAction(videoId: unknown, change: unknown): Promise<Result> {
  const me = await requireUser();
  const c = z.object({ name: z.string().max(80).optional(), voiceId: z.string().max(40).optional(), introMs: z.number().int().optional() }).parse(change);
  const r = await updateVideo(prisma, me.workspace.id, id.parse(videoId), c);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function removeVideoAction(videoId: unknown): Promise<Result> {
  const me = await requireUser();
  const r = await removeVideo(prisma, me.workspace.id, id.parse(videoId));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Makes the video with a sample greeting (15 AI credits); the player loads it from /api/videos/<id>?f=try. */
export async function tryVideoAction(videoId: unknown, greeting: unknown): Promise<Result<{ src: string }>> {
  const me = await requireUser();
  const vid = id.parse(videoId);
  const r = await tryVideo(prisma, me.workspace.id, vid, z.string().max(200).parse(greeting));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, value: { src: `/api/videos/${vid}?f=try&t=${Date.now()}` } };
}

/** The workspace's videos (and voices), for the video picker in sequence steps. */
export async function myVideosAction(): Promise<{ videos: { id: string; name: string; hasVoice: boolean }[]; voices: number; manage: string }> {
  const me = await requireUser();
  const [videos, voices] = await Promise.all([listVideos(prisma, me.workspace.id), listVoices(prisma, me.workspace.id)]);
  return { videos: videos.map((v) => ({ id: v.id, name: v.name, hasVoice: !!v.voice })), voices: voices.length, manage: hubHref("/videos") };
}
