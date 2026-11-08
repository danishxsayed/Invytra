import { spawn } from "node:child_process";

/*
 * Voice notes: a copy of the customer's own voice (made once from a recording, with their
 * consent) reads a short script for each person. ElevenLabs makes the copy and the audio;
 * LinkedIn takes voice messages as .m4a, so the mp3 is converted with ffmpeg when it's installed.
 * Never log the API key.
 */

export interface VoiceSample {
  data: Buffer;
  name: string;
  type: string;
}

export interface VoiceMaker {
  /** Copies a voice from a recording; returns the provider's voice id. */
  clone(name: string, sample: VoiceSample): Promise<string>;
  /** The script read in that voice, as mp3. */
  speak(voiceId: string, text: string): Promise<Buffer>;
  remove(voiceId: string): Promise<void>;
}

/** A plain-language reason the voice provider refused. */
export class VoiceError extends Error {}

export const DEFAULT_VOICE_MODEL = "eleven_v4_turbo";

export class ElevenLabsVoice implements VoiceMaker {
  constructor(
    private readonly key: string,
    /** Text-to-speech model: v4 Turbo costs half of v2/v4 per character and sounds natural. */
    private readonly model = DEFAULT_VOICE_MODEL,
    private readonly base = "https://api.elevenlabs.io",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(method: string, path: string, body?: BodyInit, json = false): Promise<Response> {
    const headers: Record<string, string> = { "xi-api-key": this.key };
    if (json) headers["content-type"] = "application/json";
    const res = await this.fetchImpl(`${this.base}${path}`, { method, headers, body, signal: AbortSignal.timeout(90_000) });
    if (res.ok) return res;
    const raw = await res.text().catch(() => "");
    let detail = "";
    try {
      const d = (JSON.parse(raw) as { detail?: { status?: string; message?: string } | string }).detail;
      detail = typeof d === "string" ? d : [d?.status, d?.message].filter(Boolean).join(": ");
    } catch {
      detail = raw.slice(0, 160);
    }
    if (res.status === 401) throw new VoiceError("The voice service key isn't valid (check ELEVENLABS_API_KEY).");
    if (/quota|credits|limit/i.test(detail)) throw new VoiceError("The voice service account is out of characters this month.");
    if (/can_not_use_instant_voice_cloning|subscription|upgrade/i.test(detail)) throw new VoiceError("The voice service plan doesn't include voice copies (needs a paid ElevenLabs plan).");
    throw new VoiceError(`The voice service refused (${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}).`);
  }

  async clone(name: string, sample: VoiceSample): Promise<string> {
    const form = new FormData();
    form.set("name", name.slice(0, 80));
    form.set("remove_background_noise", "true");
    form.append("files", new Blob([new Uint8Array(sample.data)], { type: sample.type }), sample.name);
    const r = (await (await this.call("POST", "/v1/voices/add", form)).json()) as { voice_id?: string };
    if (!r.voice_id) throw new VoiceError("The voice service didn't return a voice.");
    return r.voice_id;
  }

  async speak(voiceId: string, text: string): Promise<Buffer> {
    const body = JSON.stringify({ text, model_id: this.model, voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true } });
    const res = await this.call("POST", `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, body, true);
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(voiceId: string): Promise<void> {
    await this.call("DELETE", `/v1/voices/${encodeURIComponent(voiceId)}`).catch((e) => {
      if (!(e instanceof VoiceError && /404/.test(e.message))) throw e;
    });
  }
}

/** The voice service from ELEVENLABS_API_KEY (model: ELEVENLABS_MODEL), or null when it isn't set. */
export function voiceFromEnv(env: NodeJS.ProcessEnv = process.env): VoiceMaker | null {
  const key = env.ELEVENLABS_API_KEY?.trim();
  return key ? new ElevenLabsVoice(key, env.ELEVENLABS_MODEL?.trim() || DEFAULT_VOICE_MODEL) : null;
}

/** Runs ffmpeg on stdin → stdout. Rejects when ffmpeg is missing or fails. */
function ffmpeg(input: Buffer, args: string[], bin = process.env.FFMPEG_PATH?.trim() || "ffmpeg"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", ...args, "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 60_000);
    p.stdout.on("data", (b: Buffer) => out.push(b));
    p.stderr.on("data", (b: Buffer) => (err += b.toString()).length > 2000 && (err = err.slice(-2000)));
    p.on("error", (e) => (clearTimeout(timer), reject(e)));
    p.on("close", (code) => (clearTimeout(timer), code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg failed: ${err.trim().slice(0, 200)}`))));
    p.stdin.on("error", () => undefined);
    p.stdin.end(input);
  });
}

/**
 * The audio as a LinkedIn voice message: .m4a (AAC) when ffmpeg is installed, else the mp3
 * itself (LinkedIn prefers m4a but takes mp3 too).
 */
export async function voiceMessageFile(mp3: Buffer): Promise<VoiceSample> {
  try {
    // m4a needs a seekable output for its index, so it's written fragmented to stream through a pipe.
    const m4a = await ffmpeg(mp3, ["-vn", "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4"]);
    if (m4a.length > 1000) return { data: m4a, name: "voice-note.m4a", type: "audio/mp4" };
  } catch {
    // no ffmpeg: fall through
  }
  return { data: mp3, name: "voice-note.mp3", type: "audio/mpeg" };
}
