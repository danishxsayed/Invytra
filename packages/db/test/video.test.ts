import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SyncSoLipSync, VideoError, lipSyncFromEnv, type LipSync } from "../src/lipsync";
import { greetingEndMs, personalVideo, prepareRecording, probeVideo, videoDir, videoPath } from "../src/video";

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
        sent = { video: (await probeVideo(p("fv.mp4"))).durationMs, audio: (await probeVideo(p("fa.wav")).catch(() => ({ durationMs: -1 }))).durationMs };
        ff("-stream_loop", "-1", "-i", p("fv.mp4"), "-i", p("fa.wav"), "-shortest", "-c:v", "libx264", "-c:a", "aac", p("fs.mp4"));
        return readFileSync(p("fs.mp4"));
      },
    };
    const out = await personalVideo(p("rec.mp4"), 2000, readFileSync(p("greet.mp3")), fake);
    writeFileSync(p("out.mp4"), out);
    const info = await probeVideo(p("out.mp4"));
    expect(sent!.video).toBeGreaterThan(1900);
    expect(sent!.video).toBeLessThan(2200);
    // Silence trimmed, a short breath added: ~1.7 s.
    expect(info).toMatchObject({ width: 1280, height: 720, hasAudio: true });
    // ~1.7 s greeting + the 8 s after the intro.
    expect(info.durationMs).toBeGreaterThan(9300);
    expect(info.durationMs).toBeLessThan(10200);
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

  it("is off without SYNC_API_KEY", () => {
    expect(lipSyncFromEnv({})).toBeNull();
    expect(lipSyncFromEnv({ SYNC_API_KEY: "x" })).toBeInstanceOf(SyncSoLipSync);
  });
});
