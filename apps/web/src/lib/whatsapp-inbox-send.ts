import type { PrismaClient } from "@invytra/db";
import { readMetaComponents, sendComponents, templateNeeds, type WaSlot, type WaVarSource } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";
import { NOT_SET_UP, clientFor, deps, failed, type WaDeps } from "./whatsapp";
import { WINDOW_MS } from "./whatsapp-inbox";
import { inboxPreview } from "./whatsapp-contacts";

/*
 * Doing things in a WhatsApp chat: replying (text or a file, only within 24 hours of their last
 * message), sending an approved template (any time), read receipts, star, assign, done, notes,
 * saved replies. Scoped to the workspace. Replies are sent right away, never retried.
 */

type Me = { id: string; name: string };

async function chatContext(prisma: PrismaClient, workspaceId: string, contactId: string) {
  const [contact, number] = await Promise.all([prisma.whatsappContact.findFirst({ where: { id: contactId, workspaceId } }), prisma.whatsappNumber.findFirst({ where: { workspaceId } })]);
  return { contact, number };
}

function blocked(c: { optedOutAt: Date | null }, number: { status: string } | null): string | null {
  if (!number) return "Connect a WhatsApp number first.";
  if (number.status === "DISCONNECTED") return "Your WhatsApp number is disconnected. Connect it again first.";
  if (c.optedOutAt) return "This person opted out of WhatsApp messages.";
  return null;
}

const windowOpen = (c: { lastInboundAt: Date | null }, now: Date) => !!c.lastInboundAt && now.getTime() - c.lastInboundAt.getTime() < WINDOW_MS;
const CLOSED = "It's been more than 24 hours since their last message, so WhatsApp only allows a template now.";

async function saveOut(prisma: PrismaClient, workspaceId: string, contactId: string, phone: string, me: Me, m: { kind: string; body: string; wamid: string; mediaId?: string; mediaType?: string; fileName?: string; replyTo?: string; extra?: object }, now: Date) {
  const row = await prisma.whatsappMessage.create({
    data: { workspaceId, contactId, phone, direction: "OUT", kind: m.kind, body: m.body.slice(0, 4096), wamid: m.wamid, status: "SENT", sentAt: now, createdAt: now, mediaId: m.mediaId, mediaType: m.mediaType, fileName: m.fileName, replyTo: m.replyTo, extra: m.extra, byUserId: me.id, byName: me.name },
  });
  await prisma.whatsappContact.update({ where: { id: contactId }, data: { chatAt: now, chatPreview: inboxPreview(m.kind, m.body).slice(0, 200), chatFrom: "OUT", unread: 0, chatDoneAt: null } });
  return row.id;
}

export async function sendInboxText(prisma: PrismaClient, workspaceId: string, me: Me, contactId: string, textRaw: string, replyTo?: string, d: WaDeps = deps()): Promise<Result<{ id: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const text = textRaw.trim();
  if (!text) return { ok: false, error: "Type a message." };
  if (text.length > 4096) return { ok: false, error: "A WhatsApp message can be up to 4,096 characters." };
  const now = d.now ?? new Date();
  const { contact: c, number: n } = await chatContext(prisma, workspaceId, contactId);
  if (!c) return { ok: false, error: "That chat is gone." };
  const why = blocked(c, n);
  if (why) return { ok: false, error: why };
  if (!windowOpen(c, now)) return { ok: false, error: CLOSED };
  try {
    const wamid = await clientFor(n!, d).sendText(n!.phoneNumberId, c.phone, text, replyTo || undefined);
    return { ok: true, value: { id: await saveOut(prisma, workspaceId, c.id, c.phone, me, { kind: "TEXT", body: text, wamid, replyTo }, now) } };
  } catch (e) {
    return failed(e, "send the message");
  }
}

const KINDS: Record<string, { kind: "image" | "video" | "audio" | "document"; maxMb: number }> = {
  "image/jpeg": { kind: "image", maxMb: 5 },
  "image/png": { kind: "image", maxMb: 5 },
  "video/mp4": { kind: "video", maxMb: 16 },
  "audio/mpeg": { kind: "audio", maxMb: 16 },
  "audio/ogg": { kind: "audio", maxMb: 16 },
  "audio/aac": { kind: "audio", maxMb: 16 },
  "application/pdf": { kind: "document", maxMb: 100 },
};
export const INBOX_FILE_ACCEPT = Object.keys(KINDS).join(",") + ",.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

export async function sendInboxFile(prisma: PrismaClient, workspaceId: string, me: Me, contactId: string, file: File | null, captionRaw: string, d: WaDeps = deps()): Promise<Result<{ id: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  if (!file || !file.size) return { ok: false, error: "Choose a file." };
  const type = file.type || "application/octet-stream";
  const k = KINDS[type] ?? (/^(application|text)\//.test(type) ? { kind: "document" as const, maxMb: 100 } : null);
  if (!k) return { ok: false, error: "WhatsApp can't send this kind of file. Photos (JPG, PNG), MP4 videos, audio and documents work." };
  if (file.size > k.maxMb * 1024 * 1024) return { ok: false, error: `That file is too big: WhatsApp allows ${k.maxMb} MB for this kind.` };
  const now = d.now ?? new Date();
  const { contact: c, number: n } = await chatContext(prisma, workspaceId, contactId);
  if (!c) return { ok: false, error: "That chat is gone." };
  const why = blocked(c, n);
  if (why) return { ok: false, error: why };
  if (!windowOpen(c, now)) return { ok: false, error: CLOSED };
  const caption = captionRaw.trim().slice(0, 1024);
  const name = (file.name || "file").slice(0, 200);
  try {
    const meta = clientFor(n!, d);
    const mediaId = await meta.uploadMedia(n!.phoneNumberId, { bytes: new Uint8Array(await file.arrayBuffer()), type, name });
    const wamid = await meta.sendMedia(n!.phoneNumberId, c.phone, { kind: k.kind, id: mediaId, caption, fileName: name });
    return { ok: true, value: { id: await saveOut(prisma, workspaceId, c.id, c.phone, me, { kind: k.kind.toUpperCase(), body: caption, wamid, mediaId, mediaType: type, fileName: name }, now) } };
  } catch (e) {
    return failed(e, "send the file");
  }
}

const templateSchema = z.object({ templateId: z.string().min(1).max(40), values: z.record(z.string().max(40), z.string().max(1000)).default({}), mediaUrl: z.string().max(2000).default("") });

/** An approved template: allowed any time, the only way to start or reopen a chat. */
export async function sendInboxTemplate(prisma: PrismaClient, workspaceId: string, me: Me, contactId: string, input: unknown, d: WaDeps = deps()): Promise<Result<{ id: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const p = templateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Choose a template." };
  const now = d.now ?? new Date();
  const [{ contact: c, number: n }, t] = await Promise.all([chatContext(prisma, workspaceId, contactId), prisma.whatsappTemplate.findFirst({ where: { id: p.data.templateId, workspaceId } })]);
  if (!c) return { ok: false, error: "That contact is gone." };
  const why = blocked(c, n);
  if (why) return { ok: false, error: why };
  if (!t || t.status !== "APPROVED") return { ok: false, error: "Choose an approved template." };
  if (t.category === "MARKETING" && !c.consentSource) return { ok: false, error: "This person hasn't opted in, so marketing templates can't be sent. Edit the contact once they agree." };
  const needs = templateNeeds(t.components);
  const map = Object.fromEntries(needs.slots.map((s) => [s.slot, { kind: "text", value: p.data.values[s.slot] ?? "" } satisfies WaVarSource])) as Partial<Record<WaSlot, WaVarSource>>;
  const empty = needs.slots.find((s) => !(p.data.values[s.slot] ?? "").trim());
  if (empty) return { ok: false, error: `Fill in ${empty.label}.` };
  if (needs.media && !/^https:\/\//.test(p.data.mediaUrl.trim())) return { ok: false, error: `Add a link (https://…) to the ${needs.media.toLowerCase()} for the header.` };
  const view = readMetaComponents(t.components);
  const body = view.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, k) => p.data.values[`body:${Number(k)}`]?.trim() || m);
  const header = view.header.type === "TEXT" ? view.header.text.replace(/\{\{\s*1\s*\}\}/, p.data.values.header ?? "") : view.header.type === "NONE" ? null : view.header.type;
  try {
    const wamid = await clientFor(n!, d).sendTemplate(n!.phoneNumberId, c.phone, { name: t.name, language: t.language, components: sendComponents(needs, map, c, p.data.mediaUrl) });
    return { ok: true, value: { id: await saveOut(prisma, workspaceId, c.id, c.phone, me, { kind: "TEMPLATE", body, wamid, extra: { template: t.name, header, footer: view.footer || null, buttons: view.buttons.map((b) => b.text) } }, now) } };
  } catch (e) {
    return failed(e, "send the template");
  }
}

/** Opening a chat: nothing unread any more, and they see blue ticks on their last message. */
export async function markChatRead(prisma: PrismaClient, workspaceId: string, contactId: string, d: WaDeps = deps()) {
  const c = await prisma.whatsappContact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, unread: true } });
  if (!c || !c.unread) return;
  await prisma.whatsappContact.update({ where: { id: c.id }, data: { unread: 0 } });
  const last = await prisma.whatsappMessage.findFirst({ where: { contactId: c.id, direction: "IN", wamid: { not: null } }, orderBy: { createdAt: "desc" }, select: { wamid: true } });
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!last?.wamid || !n || !d.app) return;
  await clientFor(n, d)
    .markRead(n.phoneNumberId, last.wamid)
    .catch(() => {}); // a read receipt is a courtesy; never block opening the chat
}

export async function updateChat(prisma: PrismaClient, workspaceId: string, contactId: string, change: { starred?: boolean; assignedTo?: string | null; done?: boolean; unread?: boolean }, now = new Date()): Promise<Result> {
  if (change.assignedTo) {
    const member = await prisma.membership.findFirst({ where: { workspaceId, userId: change.assignedTo }, select: { userId: true } });
    if (!member) return { ok: false, error: "That person isn't in this workspace." };
  }
  const r = await prisma.whatsappContact.updateMany({
    where: { id: contactId, workspaceId },
    data: {
      ...(change.starred !== undefined && { starred: change.starred }),
      ...(change.assignedTo !== undefined && { assignedTo: change.assignedTo }),
      ...(change.done !== undefined && { chatDoneAt: change.done ? now : null, ...(change.done && { unread: 0 }) }),
      ...(change.unread && { unread: 1 }),
    },
  });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That chat is gone." };
}

/** Takes a chat out of the inbox and deletes its messages from Invytra (campaign results stay). The contact stays. */
export async function deleteChat(prisma: PrismaClient, workspaceId: string, contactId: string): Promise<Result> {
  const c = await prisma.whatsappContact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } });
  if (!c) return { ok: false, error: "That chat is gone." };
  await prisma.$transaction([
    prisma.whatsappMessage.deleteMany({ where: { contactId: c.id, campaignId: null } }),
    prisma.whatsappNote.deleteMany({ where: { contactId: c.id } }),
    prisma.whatsappContact.update({ where: { id: c.id }, data: { chatAt: null, chatPreview: null, chatFrom: null, unread: 0, starred: false, assignedTo: null, chatDoneAt: null } }),
  ]);
  return { ok: true, value: undefined };
}

export async function addNote(prisma: PrismaClient, workspaceId: string, me: Me, contactId: string, raw: string): Promise<Result<{ id: string }>> {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Write the note." };
  if (body.length > 2000) return { ok: false, error: "Notes can be up to 2,000 characters." };
  const c = await prisma.whatsappContact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } });
  if (!c) return { ok: false, error: "That chat is gone." };
  const n = await prisma.whatsappNote.create({ data: { workspaceId, contactId: c.id, userId: me.id, userName: me.name, body } });
  return { ok: true, value: { id: n.id } };
}

export async function deleteNote(prisma: PrismaClient, workspaceId: string, noteId: string): Promise<Result> {
  const r = await prisma.whatsappNote.deleteMany({ where: { id: noteId, workspaceId } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That note is gone." };
}

/* ---------- saved replies ---------- */

export const listSavedReplies = (prisma: PrismaClient, workspaceId: string) => prisma.whatsappSavedReply.findMany({ where: { workspaceId }, orderBy: { shortcut: "asc" }, select: { id: true, shortcut: true, body: true } });

export async function saveSavedReply(prisma: PrismaClient, workspaceId: string, input: unknown): Promise<Result<{ id: string }>> {
  const p = z.object({ shortcut: z.string().trim().min(1, "Give it a shortcut.").max(30), body: z.string().trim().min(1, "Write the reply.").max(4096) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const shortcut = p.data.shortcut.toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_-]+/g, "-");
  if (!shortcut) return { ok: false, error: "Use letters or numbers in the shortcut." };
  if ((await prisma.whatsappSavedReply.count({ where: { workspaceId } })) >= 200) return { ok: false, error: "You can have up to 200 saved replies." };
  const r = await prisma.whatsappSavedReply.upsert({ where: { workspaceId_shortcut: { workspaceId, shortcut } }, create: { workspaceId, shortcut, body: p.data.body }, update: { body: p.data.body } });
  return { ok: true, value: { id: r.id } };
}

export async function deleteSavedReply(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  await prisma.whatsappSavedReply.deleteMany({ where: { id, workspaceId } });
  return { ok: true, value: undefined };
}
