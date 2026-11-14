import { metaSignatureOk, type MetaApp, type PrismaClient } from "@invytra/db";
import { isOptOut } from "@invytra/shared";
import { recordInbound } from "./whatsapp-contacts";

/*
 * Meta's WhatsApp webhooks (one URL for every customer: /api/whatsapp/webhook). Signed with
 * the app secret. Handled now: template reviews, template quality and category changes,
 * number quality and limit changes, account-level notices, and incoming messages (the sender
 * becomes a contact, their 24-hour window opens, "STOP" opts them out). Delivery statuses and
 * the message text itself are handled with campaigns and the inbox.
 */

type Change = { field?: string; value?: Record<string, unknown> };
type Payload = { object?: string; entry?: { id?: string; changes?: Change[] }[] };

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const digits = (s: string) => s.replace(/\D/g, "");

/** Meta's GET check when the webhook URL is saved: echoes the challenge if the token matches. */
export function verifyWebhook(params: URLSearchParams, app: MetaApp | null): string | null {
  if (!app?.verifyToken) return null;
  return params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === app.verifyToken ? params.get("hub.challenge") : null;
}

export async function handleWhatsappWebhook(prisma: PrismaClient, raw: string, signature: string | null, app: MetaApp | null): Promise<{ status: number }> {
  if (!app) return { status: 503 };
  if (!metaSignatureOk(raw, signature, app.appSecret)) return { status: 401 };
  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return { status: 400 };
  }
  if (body.object !== "whatsapp_business_account") return { status: 200 };
  for (const entry of body.entry ?? []) {
    const wabaId = str(entry.id);
    for (const change of entry.changes ?? []) {
      try {
        await applyChange(prisma, wabaId, change);
      } catch (e) {
        console.error("WhatsApp webhook change failed:", change.field, e instanceof Error ? e.message : e);
      }
    }
  }
  return { status: 200 };
}

async function applyChange(prisma: PrismaClient, wabaId: string, { field, value = {} }: Change) {
  const byTemplate = () => {
    const id = str(value.message_template_id);
    return id ? { wabaId, metaId: id } : { wabaId, name: str(value.message_template_name), language: str(value.message_template_language) };
  };
  switch (field) {
    case "message_template_status_update": {
      const reason = str(value.reason);
      await prisma.whatsappTemplate.updateMany({
        where: byTemplate(),
        data: { status: str(value.event).toUpperCase(), rejectedReason: reason && reason !== "NONE" ? reason : null },
      });
      return;
    }
    case "message_template_quality_update":
      await prisma.whatsappTemplate.updateMany({ where: byTemplate(), data: { quality: str(value.new_quality_score).toUpperCase() || null } });
      return;
    case "template_category_update":
      if (value.new_category) await prisma.whatsappTemplate.updateMany({ where: byTemplate(), data: { category: str(value.new_category).toUpperCase() } });
      return;
    case "phone_number_quality_update": {
      const phone = digits(str(value.display_phone_number));
      const numbers = await prisma.whatsappNumber.findMany({ where: { wabaId }, select: { id: true, displayPhone: true } });
      const event = str(value.event).toUpperCase();
      for (const n of numbers.filter((x) => !phone || digits(x.displayPhone) === phone)) {
        await prisma.whatsappNumber.update({
          where: { id: n.id },
          data: {
            ...(value.current_limit ? { messagingTier: str(value.current_limit) } : {}),
            ...(event === "FLAGGED" ? { quality: "RED" } : event === "UNFLAGGED" ? { quality: "GREEN" } : {}),
          },
        });
      }
      return;
    }
    case "phone_number_name_update": {
      const phone = digits(str(value.display_phone_number));
      const decision = str(value.decision).toUpperCase();
      const numbers = await prisma.whatsappNumber.findMany({ where: { wabaId }, select: { id: true, displayPhone: true } });
      for (const n of numbers.filter((x) => digits(x.displayPhone) === phone))
        await prisma.whatsappNumber.update({ where: { id: n.id }, data: { nameStatus: decision || null, ...(value.requested_verified_name && decision === "APPROVED" ? { verifiedName: str(value.requested_verified_name) } : {}) } });
      return;
    }
    case "account_update": {
      const event = str(value.event).toUpperCase();
      if (["PARTNER_REMOVED", "DISABLED_UPDATE", "ACCOUNT_DELETED"].includes(event) || str(value.ban_info && (value.ban_info as Record<string, unknown>).waba_ban_state) === "DISABLE")
        await prisma.whatsappNumber.updateMany({
          where: { wabaId },
          data: { status: "ERROR", lastError: event === "PARTNER_REMOVED" ? "Invytra's access to this WhatsApp account was removed in Meta. Connect the number again." : "Meta restricted this WhatsApp account. Open WhatsApp Manager to see why." },
        });
      return;
    }
    case "messages": {
      const phoneNumberId = str((value.metadata as Record<string, unknown> | undefined)?.phone_number_id);
      const n = phoneNumberId ? await prisma.whatsappNumber.findUnique({ where: { phoneNumberId }, select: { workspaceId: true } }) : null;
      if (!n) return;
      const names = new Map(((value.contacts as Record<string, unknown>[] | undefined) ?? []).map((c) => [str(c.wa_id), str((c.profile as Record<string, unknown> | undefined)?.name)]));
      for (const m of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const from = str(m.from);
        const text = messageText(m);
        const ts = Number(m.timestamp);
        await recordInbound(prisma, n.workspaceId, { phone: from, profileName: names.get(from), text, optOut: isOptOut(text), at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date() });
      }
      return; // delivery statuses: handled with campaigns
    }
    default:
      return;
  }
}

/** The words of an incoming message: text, a tapped template button or a reply button/list choice. */
function messageText(m: Record<string, unknown>): string {
  const o = (k: string) => (m[k] as Record<string, unknown> | undefined) ?? {};
  if (m.type === "text") return str(o("text").body);
  if (m.type === "button") return str(o("button").text) || str(o("button").payload);
  if (m.type === "interactive") {
    const i = o("interactive");
    return str((i.button_reply as Record<string, unknown> | undefined)?.title) || str((i.list_reply as Record<string, unknown> | undefined)?.title);
  }
  return "";
}
