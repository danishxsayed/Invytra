import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    await ffmpeg(["-i", recording, "-t", String(intro), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", f("intro.mp4")]);
    // The greeting without the silence around it, and a short breath after.
    await writeFile(f("greeting.mp3"), greeting);
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.2";
    await ffmpeg(["-i", f("greeting.mp3"), "-af", trim, "-ar", "44100", "-ac", "1", f("greeting.wav")]);

    await writeFile(f("synced.mp4"), await lipsync.sync(await readFile(f("intro.mp4")), await readFile(f("greeting.wav"))));
    const synced = await probeVideo(f("synced.mp4")).catch(() => {
      throw new VideoError("The lip-sync service returned a clip we can't read.");
    });
    const len = (synced.durationMs / 1000).toFixed(3);
    // Their greeting (our own audio, cut to the clip's length) + the rest of the recording.
    const graph = [
      `[0:v]scale=${info.width}:${info.height},setsar=1,fps=30,format=yuv420p[v0]`,
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
