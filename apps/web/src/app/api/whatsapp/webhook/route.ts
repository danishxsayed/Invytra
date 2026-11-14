import { metaApp, prisma } from "@invytra/db";
import { handleWhatsappWebhook, verifyWebhook } from "@/lib/whatsapp-webhook";

export const dynamic = "force-dynamic";

/** Meta checks the URL when it's saved in the app's WhatsApp settings. */
export async function GET(req: Request) {
  const challenge = verifyWebhook(new URL(req.url).searchParams, metaApp());
  return challenge === null ? new Response("Forbidden", { status: 403 }) : new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/** Template reviews, number quality and (later) messages and delivery statuses. */
export async function POST(req: Request) {
  const raw = await req.text();
  const { status } = await handleWhatsappWebhook(prisma, raw, req.headers.get("x-hub-signature-256"), metaApp());
  return new Response(status === 200 ? "ok" : "", { status });
}
