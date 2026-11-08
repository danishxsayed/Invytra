import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma, videoPath } from "@invytra/db";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * A recording of this workspace: ?f=video (default), poster, or try (the last "try it" video).
 * Supports Range so the player can seek.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const v = await prisma.videoRecording.findFirst({ where: { id, workspaceId: me.workspace.id }, select: { id: true, file: true, poster: true } });
  if (!v) return new NextResponse("Not found", { status: 404 });
  const f = new URL(req.url).searchParams.get("f");
  const name = f === "poster" ? v.poster : f === "try" ? `${me.workspace.id}/try-${v.id}.mp4` : v.file;
  const type = f === "poster" ? "image/jpeg" : "video/mp4";
  let full: string;
  let size: number;
  try {
    full = videoPath(name);
    size = (await stat(full)).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && type === "video/mp4") {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new NextResponse(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new NextResponse(Readable.toWeb(createReadStream(full)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
