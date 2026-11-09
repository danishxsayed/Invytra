import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HeyGenLipSync, SyncSoLipSync, VideoError, lipSyncFromEnv, type LipSync } from "../src/lipsync";
import { cachedVideo, dropVideoCache, greetingEndMs, mediaMs, personalVideo, videoCacheName, prepareRecording, probeVideo, videoDir, videoPath } from "../src/video";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const withFfmpeg = hasFfmpeg ? describe : describe.skip;
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);

describe("video files", () => {
  it("live in VIDEO_DIR and can't point outside it", () => {
    expect(videoDir({ VIDEO_DIR: "/srv/v" })).toBe("/srv/v");
    expect(videoPath("ws/a.mp4", { VIDEO_DIR: "/srv/v" })).toBe("/srv/v/ws/a.mp4");
    expect(() => videoPath("../etc/passwd", { VIDEO_DIR: "/srv/v" })).toThrow(VideoError);
    expect(videoDir({})).toMatch(/\.data\/videos$/);
  });
});

withFfmpeg("recordings and personal videos (ffmpeg)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vid-test-"));
  const p = (n: string) => path.join(dir, n);

  it("compresses a recording, keeps at most the limit, and refuses one without sound", async () => {
    ff("-f", "lavfi", "-i", "testsrc=size=1600x900:rate=25:duration=11", "-f", "lavfi", "-i", "sine=frequency=300:duration=11", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "300k", "-c:a", "libvorbis", "-shortest", p("in.webm"));
    const info = await prepareRecording(p("in.webm"), { video: p("rec.mp4"), poster: p("rec.jpg") }, 10);
    expect(info).toMatchObject({ width: 1280, height: 720, hasAudio: true });
    expect(info.durationMs).toBeGreaterThan(9500);
    expect(info.durationMs).toBeLessThan(10500);
    expect(readFileSync(p("rec.jpg")).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    ff("-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=10", "-c:v", "libx264", p("silent.mp4"));
    await expect(prepareRecording(p("silent.mp4"), { video: p("x.mp4"), poster: p("x.jpg") }, 60)).rejects.toThrow("no sound");
    writeFileSync(p("junk.mp4"), "not a video");
    await expect(prepareRecording(p("junk.mp4"), { video: p("y.mp4"), poster: p("y.jpg") }, 60)).rejects.toThrow(VideoError);
  });

  it("finds where the greeting ends (the first pause after speaking)", async () => {
    const limits = { minMs: 1000, maxMs: 5000, fallbackMs: 2000 };
    // 0.3 s quiet, 1.2 s "Hi there,", 0.5 s pause, then talking.
    ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.3", "-f", "lavfi", "-i", "sine=frequency=400:duration=1.2", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.5", "-f", "lavfi", "-i", "sine=frequency=300:duration=4", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6", "-filter_complex", "[0][1][2][3]concat=n=4:v=0:a=1[a]", "-map", "4:v", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", "-shortest", p("greet-test.mp4"));
    const end = await greetingEndMs(p("greet-test.mp4"), limits);
    expect(end).toBeGreaterThanOrEqual(1500);
    expect(end).toBeLessThanOrEqual(1800);
    // No pause at all: the fallback.
    expect(await greetingEndMs(p("rec.mp4"), limits)).toBe(2000);
  });

  it("replaces the greeting with the lip-synced one and keeps the rest", async () => {
    // A 1.5 s greeting (with silence around it) for a 2 s intro.
    ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.3", "-f", "lavfi", "-i", "sine=frequency=500:duration=1.5", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.4", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-c:a", "libmp3lame", p("greet.mp3"));
    let sent: { video: number; audio: number } | null = null;
    // Stands in for the service: the face clip stretched to the audio's length (like "remap").
    const fake: LipSync = {
      async sync(video, audio) {
        writeFileSync(p("fv.mp4"), video);
        writeFileSync(p("fa.wav"), audio);
        sent = { video: await mediaMs(p("fv.mp4")), audio: await mediaMs(p("fa.wav")) };
        // Like HeyGen: the face clip keeps its own speech, and face and audio must be within 15% of each other.
        if (!(await probeVideo(p("fv.mp4"))).hasAudio) throw new VideoError("The video has no audio track.");
        // Like HeyGen: face and audio must be within 15% of each other.
        if (Math.abs(sent.video - sent.audio) > 0.15 * Math.max(sent.video, sent.audio)) throw new VideoError("durations too different");
        ff("-stream_loop", "-1", "-i", p("fv.mp4"), "-i", p("fa.wav"), "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "libx264", "-c:a", "aac", p("fs.mp4"));
        return readFileSync(p("fs.mp4"));
      },
    };
    const out = await personalVideo(p("rec.mp4"), 2000, readFileSync(p("greet.mp3")), fake);
    writeFileSync(p("out.mp4"), out);
    const info = await probeVideo(p("out.mp4"));
    // A 1.7 s greeting for a 2 s face: the greeting is padded to 2 s (a short pause), face as recorded.
    expect(sent!.video).toBeGreaterThan(1900);
    expect(sent!.video).toBeLessThan(2200);
    expect(Math.abs(sent!.audio - sent!.video)).toBeLessThan(150);
    expect(info).toMatchObject({ width: 1280, height: 720, hasAudio: true });
    // 2 s greeting + the 8 s after the intro.
    expect(info.durationMs).toBeGreaterThan(9600);
    expect(info.durationMs).toBeLessThan(10400);

    // A short "Hi Al," (0.5 s, the case that failed) for a 2 s face: padded, accepted.
    ff("-f", "lavfi", "-i", "sine=frequency=500:duration=0.5", "-c:a", "libmp3lame", p("short.mp3"));
    await personalVideo(p("rec.mp4"), 2000, readFileSync(p("short.mp3")), fake);
    expect(Math.abs(sent!.audio - sent!.video)).toBeLessThan(150);
    // A long greeting (3 s) for a 2 s face: the face clip is slowed to 3 s.
    ff("-f", "lavfi", "-i", "sine=frequency=500:duration=3", "-c:a", "libmp3lame", p("long.mp3"));
    const long = await personalVideo(p("rec.mp4"), 2000, readFileSync(p("long.mp3")), fake);
    expect(sent!.video).toBeGreaterThan(3000);
    expect(Math.abs(sent!.audio - sent!.video)).toBeLessThan(250);
    writeFileSync(p("long-out.mp4"), long);
    expect(await mediaMs(p("long-out.mp4"))).toBeGreaterThan(10800);

    // Like HeyGen: needs a few seconds of real speech after the greeting to find the speaker,
    // and changes only the greeting part (onlyUntilMs).
    let seen: { video: number; audio: number; until?: number; sound: boolean } | null = null;
    const heygenLike: LipSync = {
      contextMs: 4000,
      async sync(video, audio, opts) {
        writeFileSync(p("hv.mp4"), video);
        writeFileSync(p("ha.wav"), audio);
        seen = { video: await mediaMs(p("hv.mp4")), audio: await mediaMs(p("ha.wav")), until: opts?.onlyUntilMs, sound: (await probeVideo(p("hv.mp4"))).hasAudio };
        if (seen.video < 4000) throw new VideoError("No speaker is detected in the video.");
        ff("-i", p("hv.mp4"), "-i", p("ha.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", p("hs.mp4"));
        return readFileSync(p("hs.mp4"));
      },
    };
    const ctx = await personalVideo(p("rec.mp4"), 2000, readFileSync(p("greet.mp3")), heygenLike);
    expect(seen!.sound).toBe(true);
    expect(seen!.video).toBeGreaterThan(5800);
    expect(Math.abs(seen!.audio - seen!.video)).toBeLessThan(200);
    expect(seen!.until).toBeGreaterThan(1900);
    expect(seen!.until).toBeLessThan(2200);
    writeFileSync(p("ctx-out.mp4"), ctx);
    // Still: 2 s greeting + the 8 s after it (the context isn't repeated).
    const total = await mediaMs(p("ctx-out.mp4"));
    expect(total).toBeGreaterThan(9600);
    expect(total).toBeLessThan(10400);
  }, 60_000);
});

describe("sync.so lip-sync client", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sends the clip and audio, waits for the result and downloads it", async () => {
    const calls: { url: string; method: string; form?: FormData; key?: string }[] = [];
    let polls = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", form: init?.body as FormData, key: (init?.headers as Record<string, string> | undefined)?.["x-api-key"] });
      if (url.endsWith("/v2/generate")) return ok({ id: "g1", status: "PENDING" }, 201);
      if (url.endsWith("/v2/generate/g1")) return ok(++polls < 2 ? { id: "g1", status: "PROCESSING" } : { id: "g1", status: "COMPLETED", outputUrl: "https://cdn.example/out.mp4" });
      return new Response(Buffer.from("MP4"));
    }) as typeof fetch;
    const s = new SyncSoLipSync("k", "lipsync-2", { fetch: fetchImpl, sleep: async () => undefined });
    expect((await s.sync(Buffer.from("v"), Buffer.from("a"))).toString()).toBe("MP4");
    const create = calls[0]!;
    expect(create).toMatchObject({ method: "POST", key: "k" });
    expect(create.form!.get("model")).toBe("lipsync-2");
    expect(JSON.parse(String(create.form!.get("options")))).toEqual({ sync_mode: "remap" });
    expect(create.form!.get("video")).toBeInstanceOf(Blob);
    expect(calls.map((c) => c.url)).toEqual(["https://api.sync.so/v2/generate", "https://api.sync.so/v2/generate/g1", "https://api.sync.so/v2/generate/g1", "https://cdn.example/out.mp4"]);
    // The output download doesn't carry our key.
    expect(calls[3]!.key).toBeUndefined();
  });

  it("explains refusals and failures in plain words", async () => {
    const say = (r: Response | (() => Response)) => new SyncSoLipSync("k", undefined, { fetch: (async () => (typeof r === "function" ? r() : r)) as typeof fetch, sleep: async () => undefined });
    await expect(say(ok({ message: "bad key" }, 401)).sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("isn't valid");
    await expect(say(ok({ message: "Insufficient credits" }, 400)).sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("out of credit");
    let n = 0;
    await expect(say(() => (n++ === 0 ? ok({ id: "g" }, 201) : ok({ id: "g", status: "FAILED", error: "no face found" }))).sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("no face found");
    const slow = new SyncSoLipSync("k", undefined, { fetch: (async () => ok({ id: "g", status: "PROCESSING" })) as typeof fetch, sleep: async () => undefined, timeoutMs: -1 });
    await expect(slow.sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("too long");
  });

  it("picks HeyGen when its key is set (or the one LIPSYNC_PROVIDER names), and is off without keys", () => {
    expect(lipSyncFromEnv({})).toBeNull();
    expect(lipSyncFromEnv({ SYNC_API_KEY: "x" })).toBeInstanceOf(SyncSoLipSync);
    expect(lipSyncFromEnv({ HEYGEN_API_KEY: "h" })).toBeInstanceOf(HeyGenLipSync);
    expect(lipSyncFromEnv({ HEYGEN_API_KEY: "h", SYNC_API_KEY: "x" })).toBeInstanceOf(HeyGenLipSync);
    expect(lipSyncFromEnv({ HEYGEN_API_KEY: "h", SYNC_API_KEY: "x", LIPSYNC_PROVIDER: "sync" })).toBeInstanceOf(SyncSoLipSync);
  });
});

describe("HeyGen lip-sync client", () => {
  const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });

  it("uploads the clip and audio, starts a precision lip-sync, waits and downloads it", async () => {
    const calls: { url: string; method: string; body?: BodyInit | null; key?: string }[] = [];
    let polls = 0;
    let assets = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body, key: (init?.headers as Record<string, string> | undefined)?.["x-api-key"] });
      if (url.endsWith("/v3/assets")) return ok({ asset_id: `as${++assets}`, url: "u", mime_type: "m", size_bytes: 1 });
      if (url.endsWith("/v3/lipsyncs")) return ok({ lipsync_id: "ls1" });
      if (url.endsWith("/v3/lipsyncs/ls1")) return ok(++polls < 2 ? { id: "ls1", status: "running" } : { id: "ls1", status: "completed", video_url: "https://files.heygen.ai/out.mp4" });
      return new Response(Buffer.from("MP4"));
    }) as typeof fetch;
    const h = new HeyGenLipSync("hk", "precision", { fetch: fetchImpl, sleep: async () => undefined });
    expect((await h.sync(Buffer.from("v"), Buffer.from("a"))).toString()).toBe("MP4");
    const uploads = calls.filter((c) => c.url.endsWith("/v3/assets"));
    expect(uploads).toHaveLength(2);
    expect((uploads[0]!.body as FormData).get("file")).toBeInstanceOf(Blob);
    const create = calls.find((c) => c.url.endsWith("/v3/lipsyncs"))!;
    const body = JSON.parse(String(create.body));
    expect(body).toMatchObject({ mode: "precision", enable_dynamic_duration: true, enable_watermark: false });
    expect([body.video, body.audio].map((x: { type: string }) => x.type)).toEqual(["asset_id", "asset_id"]);
    expect(new Set([body.video.asset_id, body.audio.asset_id])).toEqual(new Set(["as1", "as2"]));
    expect(calls.filter((c) => c.url.includes("api.heygen.com")).every((c) => c.key === "hk")).toBe(true);
    // Only the greeting part changed when asked.
    await h.sync(Buffer.from("v"), Buffer.from("a"), { onlyUntilMs: 2050 });
    const partial = JSON.parse(String(calls.filter((c) => c.url.endsWith("/v3/lipsyncs")).at(-1)!.body));
    expect(partial).toMatchObject({ start_time: 0, end_time: 2.05 });
    expect(body.end_time).toBeUndefined();
    expect(calls.at(-1)!).toMatchObject({ url: "https://files.heygen.ai/out.mp4", key: undefined });
  });

  it("explains refusals and failed jobs in plain words", async () => {
    const say = (r: () => Response) => new HeyGenLipSync("k", "speed", { fetch: (async () => r()) as typeof fetch, sleep: async () => undefined });
    await expect(say(() => new Response('{"error":{"message":"bad"}}', { status: 401 })).sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("HEYGEN_API_KEY");
    await expect(say(() => new Response('{"error":{"code":"insufficient_credit"}}', { status: 400 })).sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("out of credit");
    let n = 0;
    const failing = say(() => (n++ < 2 ? ok({ asset_id: "a" }) : n === 3 ? ok({ lipsync_id: "l" }) : ok({ status: "failed", failure_message: "No face detected" })));
    await expect(failing.sync(Buffer.from(""), Buffer.from(""))).rejects.toThrow("No face detected");
  });
});

describe("one video per greeting", () => {
  it("makes it once, then reuses it; a different greeting, voice or length is a new video", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vid-cache-"));
    process.env.VIDEO_DIR = dir;
    const key = { introMs: 1500, voice: "v1", greeting: "Hi Priya," };
    const name = videoCacheName("ws", "rec1", key);
    expect(name).toMatch(/^ws\/cache\/rec1-[0-9a-f]{20}\.mp4$/);
    expect(videoCacheName("ws", "rec1", { ...key, greeting: "  Hi   Priya, " })).toBe(name);
    expect(new Set([videoCacheName("ws", "rec1", { ...key, greeting: "Hi Raj," }), videoCacheName("ws", "rec1", { ...key, voice: "v2" }), videoCacheName("ws", "rec1", { ...key, introMs: 2000 })]).has(name)).toBe(false);
    let made = 0;
    const make = async () => (made++, Buffer.from("video"));
    expect(await cachedVideo(name, make)).toEqual({ data: Buffer.from("video"), reused: false });
    expect(await cachedVideo(name, make)).toEqual({ data: Buffer.from("video"), reused: true });
    expect(made).toBe(1);
    // A failed make keeps nothing.
    await expect(cachedVideo(videoCacheName("ws", "rec1", { ...key, greeting: "Hi Bad," }), async () => Promise.reject(new VideoError("nope")))).rejects.toThrow("nope");
    await dropVideoCache("ws", "rec1");
    expect(await cachedVideo(name, make)).toMatchObject({ reused: false });
    delete process.env.VIDEO_DIR;
  });
});
