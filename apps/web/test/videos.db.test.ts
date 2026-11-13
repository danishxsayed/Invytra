/**
 * Video recordings against a real database (only with TEST_DATABASE_URL — it is wiped). Needs ffmpeg.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, VideoError, videoPath, type LipSync, type VoiceMaker } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../src/lib/campaigns";
import { addVideo, checkNewVideo, listVideos, removeVideo, tryVideo, updateVideo } from "../src/lib/videos";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);

d("videos", () => {
  let prisma: PrismaClient;
  const A = "ws-video-a";
  const B = "ws-video-b";
  const dir = mkdtempSync(path.join(tmpdir(), "web-videos-"));
  const src = (n: string) => path.join(dir, n);
  const consent = { name: "Hello founders", voiceId: "vc-video-a", consent: true };
  let fail = false;
  let syncs = 0;
  const voice: VoiceMaker = { clone: async () => "x", speak: async () => readGreeting(), remove: async () => undefined };
  const lipsync: LipSync = {
    sync: async (video) => {
      if (fail) throw new VideoError("The lip-sync service account is out of credit.");
      syncs++;
      return video;
    },
  };
  const readGreeting = async () => (await import("node:fs")).readFileSync(src("greet.mp3"));
  const used = () => prisma.aiCreditUse.aggregate({ where: { workspaceId: A, action: "VIDEO" }, _sum: { credits: true } }).then((r) => r._sum.credits ?? 0);

  beforeAll(async () => {
    process.env.VIDEO_DIR = path.join(dir, "store");
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A", plan: "growth", aiMonthly: 500 }, { id: B, name: "B" }] });
    await prisma.voiceClone.createMany({
      data: [
        { id: "vc-video-a", workspaceId: A, name: "Me", providerVoiceId: "el-a", consentAt: new Date(), consentByUserId: "u" },
        { id: "vc-video-b", workspaceId: B, name: "Them", providerVoiceId: "el-b", consentAt: new Date(), consentByUserId: "u" },
      ],
    });
    await prisma.linkedinAccount.create({ data: { id: "acc-video-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-video-a", workspaceId: A, name: "L" } });
    // "Hi there," (1 s), a pause, then 9 s of talking.
    ff("-f", "lavfi", "-i", "sine=frequency=400:duration=1", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.5", "-f", "lavfi", "-i", "sine=frequency=300:duration=9", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=10.5", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1[a]", "-map", "3:v", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", "-shortest", src("talk.mp4"));
    ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=4", "-f", "lavfi", "-i", "sine=duration=4", "-c:v", "libx264", "-c:a", "aac", "-shortest", src("short.mp4"));
    ff("-f", "lavfi", "-i", "sine=frequency=500:duration=1.1", "-c:a", "libmp3lame", src("greet.mp3"));
  }, 60_000);
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  let id = "";

  it("needs consent, a name and your own voice, before reading the upload", async () => {
    expect(await checkNewVideo(prisma, A, { ...consent, consent: false })).toMatchObject({ ok: false, error: expect.stringContaining("confirm") });
    expect(await checkNewVideo(prisma, A, { ...consent, name: " " })).toMatchObject({ ok: false });
    expect(await checkNewVideo(prisma, A, { ...consent, voiceId: "vc-video-b" })).toMatchObject({ ok: false, error: expect.stringContaining("voice") });
    expect(await checkNewVideo(prisma, A, consent)).toEqual({ ok: true, value: { name: "Hello founders" } });
  });

  it("saves a recording, compressed, with the greeting found; refuses one that's too short", async () => {
    expect(await addVideo(prisma, A, "u1", consent, src("short.mp4"))).toEqual({ ok: false, error: "Record at least 8 seconds." });
    expect(await prisma.videoRecording.count({ where: { workspaceId: A } })).toBe(0);
    const r = await addVideo(prisma, A, "u1", consent, src("talk.mp4"));
    expect(r.ok).toBe(true);
    id = r.ok ? r.value.id : "";
    const [v] = await listVideos(prisma, A);
    expect(v).toMatchObject({ id, name: "Hello founders", width: 640, height: 360, voice: { id: "vc-video-a" } });
    expect(v!.introMs).toBeGreaterThanOrEqual(1000);
    expect(v!.introMs).toBeLessThanOrEqual(1300);
    const row = await prisma.videoRecording.findUniqueOrThrow({ where: { id } });
    expect(row.file).toBe(`${A}/${id}.mp4`);
    expect(existsSync(videoPath(row.file)) && existsSync(videoPath(row.poster))).toBe(true);
    expect(await listVideos(prisma, B)).toEqual([]);
  }, 60_000);

  it("changes the greeting length (1–5 s), the voice and name; never another workspace's", async () => {
    expect(await updateVideo(prisma, A, id, { introMs: 1730 })).toEqual({ ok: true, value: undefined });
    expect((await prisma.videoRecording.findUniqueOrThrow({ where: { id } })).introMs).toBe(1750);
    expect(await updateVideo(prisma, A, id, { introMs: 6000 })).toMatchObject({ ok: false });
    expect(await updateVideo(prisma, A, id, { voiceId: "vc-video-b" })).toMatchObject({ ok: false });
    expect(await updateVideo(prisma, B, id, { name: "x" })).toEqual({ ok: false, error: "That video is gone." });
  });

  it("makes a try-out for 15 credits, and gives them back when it fails", async () => {
    const before = await used();
    const r = await tryVideo(prisma, A, id, "Hi Alex,", { voice, lipsync });
    expect(r).toEqual({ ok: true, value: { file: `${A}/try-${id}.mp4` } });
    expect(existsSync(videoPath(`${A}/try-${id}.mp4`))).toBe(true);
    expect(await used()).toBe(before + 15);
    // The same greeting again: made once, reused.
    expect((await tryVideo(prisma, A, id, "Hi Alex,", { voice, lipsync })).ok).toBe(true);
    expect(syncs).toBe(1);
    expect(await used()).toBe(before + 30);
    fail = true;
    expect(await tryVideo(prisma, A, id, "Hi Sam,", { voice, lipsync })).toEqual({ ok: false, error: "The lip-sync service account is out of credit." });
    fail = false;
    expect(await used()).toBe(before + 30);
    expect(await tryVideo(prisma, A, id, "Hi", { voice, lipsync: null })).toMatchObject({ ok: false, error: expect.stringContaining("aren't available") });
    expect(await tryVideo(prisma, B, id, "Hi", { voice, lipsync })).toEqual({ ok: false, error: "That video is gone." });
  }, 60_000);

  it("campaigns can only use the workspace's own videos; deleting removes the files", async () => {
    const step = (videoId: string) => ({ type: "MESSAGE" as const, delayDays: 0, text: "", video: { videoId, intro: "Hi {firstName}," }, videoOnly: true });
    const input = (videoId: string) => ({ name: "V", accountIds: ["acc-video-a"], listId: "list-video-a", steps: [step(videoId)], settings: {} });
    expect(await createCampaign(prisma, A, input("someone-elses"))).toEqual({ ok: false, error: "A video step uses a video that's been deleted. Pick one of your videos." });
    expect((await createCampaign(prisma, A, input(id))).ok).toBe(true);
    const row = await prisma.videoRecording.findUniqueOrThrow({ where: { id } });
    expect(await removeVideo(prisma, B, id)).toMatchObject({ ok: false });
    expect(await removeVideo(prisma, A, id)).toEqual({ ok: true, value: undefined });
    expect(existsSync(videoPath(row.file)) || existsSync(videoPath(row.poster)) || existsSync(videoPath(`${A}/try-${id}.mp4`))).toBe(false);
  });
});
