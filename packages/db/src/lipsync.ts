/*
 * Lip-sync for video notes: given a few seconds of the customer's face and new audio (the
 * greeting with the person's name), returns that clip with the mouth matched to the audio.
 * Providers: HeyGen (default) or sync.so. Never log the API keys.
 */

/** A plain-language reason the lip-sync service refused or failed. */
export class VideoError extends Error {}

export interface LipSync {
  /**
   * The face clip (mp4) speaking the audio (wav). Returns mp4 bytes. With `onlyUntilMs`, only
   * the start up to there is changed (the rest is the person's real speech, given for context).
   */
  sync(video: Buffer, audio: Buffer, opts?: { onlyUntilMs?: number }): Promise<Buffer>;
  /** How much of the real speech after the greeting to send along (some services need it to find the speaker). */
  readonly contextMs?: number;
}

export const DEFAULT_LIPSYNC_MODEL = "lipsync-2";

type Generation = { id?: string; status?: string; outputUrl?: string | null; error?: string | null; errorCode?: string | null };

export class SyncSoLipSync implements LipSync {
  constructor(
    private readonly key: string,
    private readonly model = DEFAULT_LIPSYNC_MODEL,
    private readonly opts: { base?: string; fetch?: typeof fetch; pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  private get base() {
    return this.opts.base ?? "https://api.sync.so";
  }
  private get fetch() {
    return this.opts.fetch ?? fetch;
  }

  private async refused(res: Response): Promise<never> {
    const raw = await res.text().catch(() => "");
    let detail = raw.slice(0, 200);
    try {
      const j = JSON.parse(raw) as { message?: string; error?: string; errorCode?: string };
      detail = [j.errorCode, j.message ?? j.error].filter(Boolean).join(": ") || detail;
    } catch {
      // not JSON
    }
    if (res.status === 401 || res.status === 403) throw new VideoError("The lip-sync service key isn't valid (check SYNC_API_KEY).");
    if (res.status === 402 || /credit|balance|quota|payment/i.test(detail)) throw new VideoError("The lip-sync service account is out of credit.");
    if (/file_size_exceeds_plan_limit/.test(detail)) throw new VideoError("The lip-sync service plan doesn't take a clip this size.");
    throw new VideoError(`The lip-sync service refused (${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}).`);
  }

  async sync(video: Buffer, audio: Buffer): Promise<Buffer> {
    const form = new FormData();
    form.set("model", this.model);
    // remap: the face clip is slowed or sped up to the greeting's length, so it still ends where the recording carries on.
    form.set("options", JSON.stringify({ sync_mode: "remap" }));
    form.append("video", new Blob([new Uint8Array(video)], { type: "video/mp4" }), "intro.mp4");
    form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "greeting.wav");
    const headers = { "x-api-key": this.key };
    const res = await this.fetch(`${this.base}/v2/generate`, { method: "POST", headers, body: form, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) await this.refused(res);
    const created = (await res.json()) as Generation;
    if (!created.id) throw new VideoError("The lip-sync service didn't start the job.");

    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const until = Date.now() + (this.opts.timeoutMs ?? 8 * 60_000);
    let g: Generation = created;
    while (g.status !== "COMPLETED") {
      if (g.status === "FAILED" || g.status === "REJECTED") throw new VideoError(`The lip-sync service couldn't make the video${g.error ? ` (${g.error.slice(0, 160)})` : ""}.`);
      if (Date.now() > until) throw new VideoError("The lip-sync service took too long.");
      await sleep(this.opts.pollMs ?? 5000);
      const r = await this.fetch(`${this.base}/v2/generate/${encodeURIComponent(created.id)}`, { headers, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) await this.refused(r);
      g = (await r.json()) as Generation;
    }
    if (!g.outputUrl) throw new VideoError("The lip-sync service finished without a video.");
    const out = await this.fetch(g.outputUrl, { signal: AbortSignal.timeout(120_000) });
    if (!out.ok) throw new VideoError(`Couldn't download the lip-synced clip (${out.status}).`);
    return Buffer.from(await out.arrayBuffer());
  }
}

type HeyGenLipsync = { status?: string; video_url?: string | null; failure_message?: string | null };

/**
 * HeyGen's lip-sync (POST /v3/lipsyncs). The clip and audio are uploaded as assets first.
 * mode "precision" looks better; "speed" is cheaper (HeyGen calls it drafts).
 */
export class HeyGenLipSync implements LipSync {
  /** HeyGen looks for the speaker in the clip; ~2 s of greeting alone is too short ("No speaker is detected"). */
  readonly contextMs = 4000;

  constructor(
    private readonly key: string,
    private readonly mode: "precision" | "speed" = "precision",
    private readonly opts: { base?: string; fetch?: typeof fetch; pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  private get base() {
    return this.opts.base ?? "https://api.heygen.com";
  }

  private async call<T>(method: string, path: string, body?: BodyInit, json = false): Promise<T> {
    const headers: Record<string, string> = { "x-api-key": this.key };
    if (json) headers["content-type"] = "application/json";
    const res = await (this.opts.fetch ?? fetch)(`${this.base}${path}`, { method, headers, body, signal: AbortSignal.timeout(120_000) });
    const raw = await res.text().catch(() => "");
    if (res.ok) return (JSON.parse(raw || "{}") as { data: T }).data;
    let detail = raw.slice(0, 200);
    try {
      const j = JSON.parse(raw) as { error?: { message?: string; code?: string } | string; message?: string };
      detail = (typeof j.error === "string" ? j.error : [j.error?.code, j.error?.message].filter(Boolean).join(": ")) || j.message || detail;
    } catch {
      // not JSON
    }
    if (res.status === 401 || res.status === 403) throw new VideoError("The lip-sync service key isn't valid (check HEYGEN_API_KEY).");
    if (res.status === 402 || /credit|balance|quota|insufficient|payment/i.test(detail)) throw new VideoError("The lip-sync service account is out of credit. Top up the HeyGen API balance.");
    if (res.status === 429) throw new VideoError("The lip-sync service is busy (too many requests). It will be tried again.");
    throw new VideoError(`The lip-sync service refused (${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}).`);
  }

  private async upload(data: Buffer, name: string, type: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type }), name);
    const a = await this.call<{ asset_id?: string }>("POST", "/v3/assets", form);
    if (!a?.asset_id) throw new VideoError("The lip-sync service didn't take the upload.");
    return a.asset_id;
  }

  async sync(video: Buffer, audio: Buffer, opts: { onlyUntilMs?: number } = {}): Promise<Buffer> {
    const [v, a] = await Promise.all([this.upload(video, "intro.mp4", "video/mp4"), this.upload(audio, "greeting.wav", "audio/wav")]);
    const part = opts.onlyUntilMs ? { start_time: 0, end_time: Math.round(opts.onlyUntilMs) / 1000 } : {};
    const body = JSON.stringify({
      video: { type: "asset_id", asset_id: v },
      audio: { type: "asset_id", asset_id: a },
      mode: this.mode,
      title: "Invytra video note",
      // The face clip follows the greeting's length, so it still ends where the recording carries on.
      enable_dynamic_duration: true,
      enable_watermark: false,
      keep_the_same_format: true,
      ...part,
    });
    const created = await this.call<{ lipsync_id?: string }>("POST", "/v3/lipsyncs", body, true);
    const id = created?.lipsync_id;
    if (!id) throw new VideoError("The lip-sync service didn't start the job.");

    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const until = Date.now() + (this.opts.timeoutMs ?? 8 * 60_000);
    let job: HeyGenLipsync = { status: "pending" };
    while (job.status !== "completed") {
      if (job.status === "failed") throw new VideoError(`The lip-sync service couldn't make the video${job.failure_message ? ` (${job.failure_message.slice(0, 160)})` : ""}.`);
      if (Date.now() > until) throw new VideoError("The lip-sync service took too long.");
      await sleep(this.opts.pollMs ?? 5000);
      job = await this.call<HeyGenLipsync>("GET", `/v3/lipsyncs/${encodeURIComponent(id)}`);
    }
    if (!job.video_url) throw new VideoError("The lip-sync service finished without a video.");
    const out = await (this.opts.fetch ?? fetch)(job.video_url, { signal: AbortSignal.timeout(120_000) });
    if (!out.ok) throw new VideoError(`Couldn't download the lip-synced clip (${out.status}).`);
    return Buffer.from(await out.arrayBuffer());
  }
}

/**
 * The lip-sync service: HeyGen when HEYGEN_API_KEY is set (HEYGEN_LIPSYNC_MODE: precision or
 * speed), else sync.so when SYNC_API_KEY is set; LIPSYNC_PROVIDER=heygen|sync picks one when
 * both are. Null when none is set up.
 */
export function lipSyncFromEnv(env: NodeJS.ProcessEnv = process.env): LipSync | null {
  const heygen = env.HEYGEN_API_KEY?.trim();
  const sync = env.SYNC_API_KEY?.trim();
  const want = env.LIPSYNC_PROVIDER?.trim().toLowerCase();
  if (heygen && (want !== "sync" || !sync)) return new HeyGenLipSync(heygen, env.HEYGEN_LIPSYNC_MODE?.trim() === "speed" ? "speed" : "precision");
  return sync ? new SyncSoLipSync(sync, env.SYNC_MODEL?.trim() || DEFAULT_LIPSYNC_MODEL) : null;
}
