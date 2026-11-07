import { renderCard } from "@invytra/db";
import { cardSchema } from "@invytra/shared";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** The handwritten card as it will look (signed-in users only; previews are free). */
export async function GET(req: Request) {
  await requireUser();
  const q = new URL(req.url).searchParams;
  const card = cardSchema.safeParse({ text: q.get("text") ?? "", style: q.get("style") ?? "lined", font: q.get("font") ?? "neat", ink: q.get("ink") ?? "blue" });
  if (!card.success) return new NextResponse("Bad card", { status: 400 });
  const png = await renderCard({ ...card.data, text: card.data.text || "Your note appears here." });
  return new NextResponse(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
}
