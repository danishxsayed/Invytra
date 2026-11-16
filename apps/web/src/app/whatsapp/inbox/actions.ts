"use server";

import { prisma } from "@invytra/db";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { tagWaContacts } from "@/lib/whatsapp-contacts";
import { getChat, listChats, type InboxQuery } from "@/lib/whatsapp-inbox";
import { addNote, deleteChat, deleteNote, deleteSavedReply, markChatRead, saveSavedReply, sendInboxFile, sendInboxTemplate, sendInboxText, updateChat } from "@/lib/whatsapp-inbox-send";

/* The WhatsApp inbox: each action checks the WhatsApp channel and only touches the user's workspace. */

const who = async () => {
  const me = await requireChannel("whatsapp");
  return { ws: me.workspace.id, me: { id: me.user.id, name: me.user.name } };
};

/** For live updates: the chat list and the open chat, fetched every few seconds. */
export async function pollInboxAction(q: InboxQuery, open: string | null) {
  const { ws, me } = await who();
  const [chats, chat] = await Promise.all([listChats(prisma, ws, me.id, q), open ? getChat(prisma, ws, open) : null]);
  if (open && chat?.contact.unread) await markChatRead(prisma, ws, open);
  return { chats, chat: chat && { messages: chat.messages, notes: chat.notes, windowEnds: chat.windowEnds } };
}

export async function openChatAction(id: string) {
  const { ws } = await who();
  await markChatRead(prisma, ws, String(id));
}

export async function sendTextAction(id: string, text: string, replyTo?: string): Promise<Result<{ id: string }>> {
  const { ws, me } = await who();
  return sendInboxText(prisma, ws, me, String(id), String(text), replyTo ? String(replyTo) : undefined);
}

export async function sendFileAction(form: FormData): Promise<Result<{ id: string }>> {
  const { ws, me } = await who();
  const file = form.get("file");
  return sendInboxFile(prisma, ws, me, String(form.get("id") ?? ""), file instanceof File ? file : null, String(form.get("caption") ?? ""));
}

export async function sendTemplateAction(id: string, input: unknown): Promise<Result<{ id: string }>> {
  const { ws, me } = await who();
  return sendInboxTemplate(prisma, ws, me, String(id), input);
}

export async function updateChatAction(id: string, change: { starred?: boolean; assignedTo?: string | null; done?: boolean; unread?: boolean }): Promise<Result> {
  const { ws, me } = await who();
  return updateChat(prisma, ws, String(id), {
    ...(typeof change.starred === "boolean" && { starred: change.starred }),
    ...(change.assignedTo !== undefined && { assignedTo: change.assignedTo ? String(change.assignedTo) : null }),
    ...(typeof change.done === "boolean" && { done: change.done }),
    ...(change.unread === true && { unread: true }),
  }, new Date(), me);
}

export async function deleteChatAction(id: string): Promise<Result> {
  const { ws } = await who();
  return deleteChat(prisma, ws, String(id));
}

export async function addNoteAction(id: string, body: string): Promise<Result<{ id: string }>> {
  const { ws, me } = await who();
  return addNote(prisma, ws, me, String(id), String(body));
}

export async function deleteNoteAction(noteId: string): Promise<Result> {
  const { ws } = await who();
  return deleteNote(prisma, ws, String(noteId));
}

export async function tagChatAction(id: string, tag: string, add: boolean): Promise<Result<number>> {
  const { ws } = await who();
  return tagWaContacts(prisma, ws, [String(id)], String(tag), add);
}

export async function saveSavedReplyAction(input: unknown): Promise<Result<{ id: string }>> {
  const { ws } = await who();
  return saveSavedReply(prisma, ws, input);
}

export async function deleteSavedReplyAction(id: string): Promise<Result> {
  const { ws } = await who();
  return deleteSavedReply(prisma, ws, String(id));
}
