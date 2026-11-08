import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ElevenLabsVoice, VoiceError, voiceMessageFile } from "../src/voice.js";

describe("voice notes", () => {
  it("talks to ElevenLabs with the key in a header and explains refusals", async () => {
    const seen: { url: string; key: string | null; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, key: new Headers(init.headers).get("xi-api-key"), body: init.body });
      if (url.endsWith("/v1/voices/add")) return new Response(JSON.stringify({ voice_id: "v-123" }));
      if (url.includes("/text-to-speech/")) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "This request exceeds your quota" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const v = new ElevenLabsVoice("k-secret", "https://el.test", fake);
    expect(await v.clone("Tahur", { data: Buffer.from("abc"), name: "s.webm", type: "audio/webm" })).toBe("v-123");
    expect((seen[0]!.body as FormData).get("name")).toBe("Tahur");
    expect([...(await v.speak("v-123", "Hi Alex"))]).toEqual([1, 2, 3]);
    expect(seen[1]!.url).toBe("https://el.test/v1/text-to-speech/v-123?output_format=mp3_44100_128");
    expect(seen.every((s) => s.key === "k-secret")).toBe(true);
    await expect(v.remove("v-123")).rejects.toThrow(VoiceError);
  });

  it("turns the mp3 into an m4a voice message when ffmpeg is there", async () => {
    let mp3: Buffer;
    try {
      mp3 = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-f", "mp3", "pipe:1"]);
    } catch {
      return; // no ffmpeg here
    }
    const f = await voiceMessageFile(mp3);
    expect(f).toMatchObject({ name: "voice-note.m4a", type: "audio/mp4" });
    expect(f.data.subarray(4, 8).toString()).toBe("ftyp");
    process.env.FFMPEG_PATH = "/nonexistent/ffmpeg";
    try {
      expect(await voiceMessageFile(mp3)).toMatchObject({ name: "voice-note.mp3", type: "audio/mpeg" });
    } finally {
      delete process.env.FFMPEG_PATH;
    }
  });
});
