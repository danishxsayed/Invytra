import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@invytra/db";
import { VIDEO_RECORDING } from "@invytra/shared";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { addVideo, checkNewVideo } from "@/lib/videos";

export const runtime = "nodejs";
export const maxDuration = 300;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * Adds a recording. The body is the video file itself (streamed to disk, up to 200 MB);
 * name, voiceId and consent=yes come in the query string.
 */
export async function POST(req: Request) {
  const me = await requireUser();
  const q = new URL(req.url).searchParams;
  const input = { name: q.get("name") ?? "", voiceId: q.get("voiceId") ?? "", consent: q.get("consent") === "yes" };
  const ok = await checkNewVideo(prisma, me.workspace.id, input);
  if (!ok.ok) return fail(ok.error);
  if (!req.body) return fail("Record or upload your video first.");
  if (Number(req.headers.get("content-length") ?? 0) > VIDEO_RECORDING.maxBytes) return fail("That file is too large (200 MB at most). Keep it under a minute.", 413);

  const dir = await mkdtemp(path.join(tmpdir(), "invytra-upload-"));
  const file = path.join(dir, "upload");
  try {
    let seen = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        seen += chunk.length;
        done(seen > VIDEO_RECORDING.maxBytes ? new Error("too large") : null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(req.body as never), limit, createWriteStream(file));
    } catch {
      return fail(seen > VIDEO_RECORDING.maxBytes ? "That file is too large (200 MB at most). Keep it under a minute." : "The upload was interrupted. Please try again.", 413);
    }
    const r = await addVideo(prisma, me.workspace.id, me.user.id, input, file);
    return r.ok ? NextResponse.json(r) : fail(r.error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
