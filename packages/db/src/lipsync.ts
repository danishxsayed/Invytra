/*
 * Lip-sync for video notes: given a few seconds of the customer's face and new audio (the
 * greeting with the person's name), returns that clip with the mouth matched to the audio.
 * The provider is sync.so (lipsync-2). Never log the API key.
 */

/** A plain-language reason the lip-sync service refused or failed. */
export class VideoError extends Error {}

export interface LipSync {
  /** The face clip (mp4) speaking the audio (wav). Returns mp4 bytes. */
  sync(video: Buffer, audio: Buffer): Promise<Buffer>;
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

/** The lip-sync service from SYNC_API_KEY (model: SYNC_MODEL), or null when it isn't set. */
export function lipSyncFromEnv(env: NodeJS.ProcessEnv = process.env): LipSync | null {
  const key = env.SYNC_API_KEY?.trim();
  return key ? new SyncSoLipSync(key, env.SYNC_MODEL?.trim() || DEFAULT_LIPSYNC_MODEL) : null;
}
