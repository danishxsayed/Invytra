import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VideoError, type LipSync } from "./lipsync.js";

/*
 * Video notes: recordings are compressed once when they're added, then for each person the
 * greeting at the start is replaced (new audio + lip-synced face) and joined to the rest.
 * Files live under VIDEO_DIR (default: <repo>/.data/videos), shared by the dashboard and worker.
 */

/** LinkedIn takes up to 20 MB per message; a little room is kept. */
export const VIDEO_MESSAGE_MAX_BYTES = 19 * 1024 * 1024;

/** Where recordings are kept. */
export function videoDir(env: NodeJS.ProcessEnv = process.env): string {
  const set = env.VIDEO_DIR?.trim();
  if (set) return path.resolve(set);
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(".data/videos");
    dir = up;
  }
  return path.join(dir, ".data/videos");
}

/** A recording's file path from its stored name (never outside the video folder). */
export function videoPath(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const root = videoDir(env);
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) throw new VideoError("Bad video path.");
  return full;
}

function run(bin: string, args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (b: Buffer) => (out += b.toString()));
    p.stderr.on("data", (b: Buffer) => (err += b.toString()).length > 4000 && (err = err.slice(-4000)));
    p.on("error", (e) => (clearTimeout(timer), reject(e)));
    p.on("close", (code) => (clearTimeout(timer), code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} failed: ${err.trim().slice(-300)}`))));
  });
}

const ffmpegBin = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const ffprobeBin = () => process.env.FFPROBE_PATH?.trim() || "ffprobe";
const ffmpeg = (args: string[]) => run(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export interface VideoInfo {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** ffmpeg's atempo takes 0.5–2 per step: chained for bigger changes. */
function atempo(rate: number): string {
  const steps: string[] = [];
  let r = rate;
  while (r < 0.5) (steps.push("atempo=0.5"), (r /= 0.5));
  while (r > 2) (steps.push("atempo=2"), (r /= 2));
  steps.push(`atempo=${r.toFixed(4)}`);
  return steps.join(",");
}

/** How long an audio or video file is, in ms. */
export async function mediaMs(file: string): Promise<number> {
  const raw = await run(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], 30_000);
  return Math.round(Number(raw.trim()) * 1000);
}

export async function probeVideo(file: string): Promise<VideoInfo> {
  const raw = await run(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file], 30_000);
  const j = JSON.parse(raw) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
  const v = j.streams?.find((s) => s.codec_type === "video");
  if (!v) throw new VideoError("That file has no video in it.");
  return {
    durationMs: Math.round(Number(j.format?.duration ?? 0) * 1000),
    width: v.width ?? 0,
    height: v.height ?? 0,
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
  };
}

/** Same size, frame rate and sound for every piece, so pieces join cleanly. Fits in a 1280 px box. */
const VIDEO_OUT = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", "2000k", "-bufsize", "4000k", "-pix_fmt", "yuv420p"];
const AUDIO_OUT = ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "1"];
const FIT = "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=30";

/**
 * Compresses a new recording (any common format, e.g. a browser's webm) to mp4 and takes a
 * still for the dashboard. Keeps at most maxSeconds.
 */
export async function prepareRecording(input: string, out: { video: string; poster: string }, maxSeconds: number): Promise<VideoInfo> {
  const before = await probeVideo(input).catch((e) => {
    throw e instanceof VideoError ? e : new VideoError("That file isn't a video we can read. Try an mp4, mov or webm.");
  });
  if (!before.hasAudio) throw new VideoError("That video has no sound. Record it with your microphone on.");
  await ffmpeg(["-i", input, "-t", String(maxSeconds), "-vf", FIT, ...VIDEO_OUT, ...AUDIO_OUT, "-movflags", "+faststart", out.video]);
  await ffmpeg(["-ss", "1", "-i", out.video, "-frames:v", "1", "-q:v", "4", out.poster]).catch(() => ffmpeg(["-i", out.video, "-frames:v", "1", "-q:v", "4", out.poster]));
  return probeVideo(out.video);
}

/**
 * Where the greeting ("Hi there,") ends: the first pause after speech starts, within the
 * first few seconds. Falls back to `fallbackMs` when there's no clear pause.
 */
export async function greetingEndMs(file: string, limits: { minMs: number; maxMs: number; fallbackMs: number }): Promise<number> {
  const log = await new Promise<string>((resolve) => {
    const p = spawn(ffmpegBin(), ["-hide_banner", "-nostats", "-t", String(limits.maxMs / 1000 + 1), "-i", file, "-vn", "-af", "silencedetect=noise=-32dB:d=0.25", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 30_000);
    p.stderr.on("data", (b: Buffer) => (err += b.toString()));
    p.on("error", () => (clearTimeout(timer), resolve("")));
    p.on("close", () => (clearTimeout(timer), resolve(err)));
  });
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  // Speech starts at 0, or where a leading silence ends.
  const speechAt = starts[0] !== undefined && starts[0] < 50 ? (ends[0] ?? 0) : 0;
  const pause = starts.find((t) => t > speechAt + 400);
  if (pause === undefined || pause > limits.maxMs) return limits.fallbackMs;
  return Math.round(Math.min(limits.maxMs, Math.max(limits.minMs, pause + 150)) / 50) * 50;
}

/**
 * The video for one person: the first introMs of the recording re-spoken with `greeting`
 * (mp3, in their copied voice) and lip-synced, then the rest of the recording as it is.
 */
export async function personalVideo(recording: string, introMs: number, greeting: Buffer, lipsync: LipSync): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "invytra-video-"));
  const f = (n: string) => path.join(dir, n);
  try {
    const info = await probeVideo(recording);
    const intro = Math.min(introMs, Math.max(0, info.durationMs - 1000)) / 1000;
    // The face for the greeting (no sound: the new greeting replaces it).
    // Keeps its own sound ("Hi there,"): some services need the original speech to read the face.
    await ffmpeg(["-i", recording, "-t", String(intro), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...AUDIO_OUT, f("intro.mp4")]);
    // The greeting without the silence around it, and a short breath after.
    await writeFile(f("greeting.mp3"), greeting);
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.2";
    await ffmpeg(["-i", f("greeting.mp3"), "-af", trim, "-ar", "44100", "-ac", "1", f("said.wav")]);
    // Face and greeting the same length (some lip-sync services refuse clips that differ by
    // more than ~15%): a shorter greeting ends in a natural pause; a longer one gets the face
    // clip slowed to fit, so it still flows into the rest of the recording.
    const said = await mediaMs(f("said.wav"));
    const faceMs = intro * 1000;
    if (said < faceMs) {
      await ffmpeg(["-i", f("said.wav"), "-af", `apad=whole_dur=${(faceMs / 1000).toFixed(3)}`, "-ar", "44100", "-ac", "1", f("greeting.wav")]);
    } else {
      await writeFile(f("greeting.wav"), await readFile(f("said.wav")));
      const slow = (said / faceMs).toFixed(4);
      await ffmpeg(["-i", f("intro.mp4"), "-filter_complex", `[0:v]setpts=${slow}*PTS[v];[0:a]${atempo(1 / Number(slow))}[a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...AUDIO_OUT, f("intro-slow.mp4")]);
      await rename(f("intro-slow.mp4"), f("intro.mp4"));
    }

    // The greeting's exact length (the face clip and the audio now match).
    const greetMs = await mediaMs(f("intro.mp4"));
    await ffmpeg(["-i", f("greeting.wav"), "-af", `apad,atrim=0:${(greetMs / 1000).toFixed(3)}`, "-ar", "44100", "-ac", "1", f("greeting-fit.wav")]);
    await rename(f("greeting-fit.wav"), f("greeting.wav"));

    // Some services need more of the person talking to find them: send the next few seconds
    // of the real recording too (its own sound) and have only the greeting changed.
    const contextMs = Math.min(lipsync.contextMs ?? 0, Math.max(0, info.durationMs - intro * 1000 - 200));
    let clip = f("intro.mp4");
    let clipAudio = f("greeting.wav");
    if (contextMs >= 1000) {
      await ffmpeg(["-ss", String(intro), "-i", recording, "-t", (contextMs / 1000).toFixed(3), "-vf", `scale=${info.width}:${info.height},setsar=1,fps=30`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...AUDIO_OUT, f("tail.mp4")]);
      const join = (a0: string) => `[0:v]fps=30,setsar=1,format=yuv420p[v0];${a0};[1:v]fps=30,setsar=1,format=yuv420p[v1];[1:a]aresample=44100,aformat=channel_layouts=mono[a1];[v0][a0o][v1][a1]concat=n=2:v=1:a=1[v][a]`;
      // The face: greeting part (its own "Hi there,") + the next seconds.
      await ffmpeg(["-i", f("intro.mp4"), "-i", f("tail.mp4"), "-filter_complex", join("[0:a]aresample=44100,aformat=channel_layouts=mono[a0o]"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...AUDIO_OUT, f("clip.mp4")]);
      // The audio: the new greeting + the same next seconds as recorded.
      await ffmpeg(["-i", f("greeting.wav"), "-i", f("tail.mp4"), "-filter_complex", "[0:a]aresample=44100,aformat=channel_layouts=mono[g];[1:a]aresample=44100,aformat=channel_layouts=mono[t];[g][t]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-ar", "44100", "-ac", "1", f("clip.wav")]);
      clip = f("clip.mp4");
      clipAudio = f("clip.wav");
    }

    const done = await lipsync.sync(await readFile(clip), await readFile(clipAudio), contextMs >= 1000 ? { onlyUntilMs: greetMs } : {});
    await writeFile(f("synced.mp4"), done);
    const synced = await probeVideo(f("synced.mp4")).catch(() => {
      throw new VideoError("The lip-sync service returned a clip we can't read.");
    });
    // Only the greeting part is used; the rest comes from the original recording.
    const len = (Math.min(synced.durationMs, greetMs) / 1000).toFixed(3);
    // Their greeting (our own audio, cut to the clip's length) + the rest of the recording.
    const graph = [
      `[0:v]trim=0:${len},setpts=PTS-STARTPTS,scale=${info.width}:${info.height},setsar=1,fps=30,format=yuv420p[v0]`,
      `[1:a]aresample=44100,aformat=channel_layouts=mono,apad,atrim=0:${len}[a0]`,
      `[2:v]scale=${info.width}:${info.height},setsar=1,fps=30,format=yuv420p[v1]`,
      `[2:a]aresample=44100,aformat=channel_layouts=mono[a1]`,
      `[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
    ].join(";");
    await ffmpeg(["-i", f("synced.mp4"), "-i", f("greeting.wav"), "-ss", String(intro), "-i", recording, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", ...VIDEO_OUT, ...AUDIO_OUT, "-movflags", "+faststart", f("out.mp4")]);
    if ((await stat(f("out.mp4"))).size > VIDEO_MESSAGE_MAX_BYTES) throw new VideoError("The video is too big for a LinkedIn message (20 MB). Use a shorter recording.");
    return await readFile(f("out.mp4"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/*
 * One video per greeting: everyone called Priya gets the same "Hi Priya," video, made once.
 * Kept in <workspace>/cache/<recording>-<hash>.mp4; unused ones go after 30 days.
 */
const CACHE_DAYS = 30;

export function videoCacheName(workspaceId: string, recordingId: string, key: { introMs: number; voice: string; greeting: string }): string {
  const greeting = key.greeting.trim().replace(/\s+/g, " ");
  const hash = createHash("sha256").update(JSON.stringify([key.introMs, key.voice, greeting])).digest("hex").slice(0, 20);
  return `${workspaceId}/cache/${recordingId}-${hash}.mp4`;
}

/** The cached video for this greeting, or `make()`'s (then kept). */
export async function cachedVideo(name: string, make: () => Promise<Buffer>): Promise<{ data: Buffer; reused: boolean }> {
  const file = videoPath(name);
  try {
    const data = await readFile(file);
    const now = new Date();
    await utimes(file, now, now).catch(() => undefined);
    return { data, reused: true };
  } catch {
    // not made yet
  }
  const data = await make();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
  await pruneVideoCache(path.dirname(file)).catch(() => undefined);
  return { data, reused: false };
}

async function pruneVideoCache(dir: string, now = Date.now()): Promise<void> {
  for (const f of await readdir(dir)) {
    const full = path.join(dir, f);
    if ((await stat(full)).mtimeMs < now - CACHE_DAYS * 86_400_000) await rm(full, { force: true });
  }
}

/** Removes a recording's cached videos (when it's deleted). */
export async function dropVideoCache(workspaceId: string, recordingId: string): Promise<void> {
  const dir = videoPath(`${workspaceId}/cache/x`).replace(/\/x$/, "");
  const files = await readdir(dir).catch(() => [] as string[]);
  for (const f of files) if (f.startsWith(`${recordingId}-`)) await rm(path.join(dir, f), { force: true });
}
