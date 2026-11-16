/**
 * The WhatsApp inbox against a real database (only with TEST_DATABASE_URL — it is wiped) and a
 * fake Meta: incoming messages, the chat list and filters, replies inside the 24-hour window,
 * templates outside it, read receipts, notes, assigning, deleting a chat, tenancy.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, sealSecret, type MetaApp } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WaDeps } from "../src/lib/whatsapp";
import { getChat, inboxCounts, listChats } from "../src/lib/whatsapp-inbox";
import { addNote, deleteChat, markChatRead, saveSavedReply, sendInboxFile, sendInboxTemplate, sendInboxText, updateChat } from "../src/lib/whatsapp-inbox-send";
import { handleWhatsappWebhook } from "../src/lib/whatsapp-webhook";

process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = "ws-wainbox-a";
const B = "ws-wainbox-b";
const app: MetaApp = { appId: "111", appSecret: "sec", configId: "c", verifyToken: "v", version: "v23.0" };
const at = new Date("2026-11-16T10:00:00Z");
const ts = (dt: Date) => String(Math.floor(dt.getTime() / 1000));

d("whatsapp inbox", () => {
  let prisma: PrismaClient;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let n = 0;
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/v[\d.]+\//, "");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ path, body });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (path === "pn-inbox/media") return json({ id: "media-1" });
    if (path === "pn-inbox/messages") return json(body.status === "read" ? { success: true } : { messages: [{ id: `wamid.out${++n}` }] });
    return new Response(JSON.stringify({ error: { message: `unexpected ${path}` } }), { status: 404 });
  }) as typeof fetch;
  const deps = (now: Date): WaDeps => ({ app, fetch: fakeFetch, now });
  const me = { id: "u-olivia", name: "Olivia" };
  const hook = (messages: object[], contacts: object[] = []) => {
    const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn-inbox" }, contacts, messages } }] }] });
    return handleWhatsappWebhook(prisma, payload, `sha256=${createHmac("sha256", "sec").update(payload).digest("hex")}`, app);
  };
  let priya = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: ["u-olivia", "u-rahul"] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    await prisma.user.createMany({ data: [{ id: "u-olivia", email: "olivia@inbox.test", name: "Olivia", passwordHash: "x" }, { id: "u-rahul", email: "rahul@inbox.test", name: "Rahul", passwordHash: "x" }] });
    await prisma.membership.create({ data: { userId: "u-olivia", workspaceId: A, role: "OWNER" } });
    await prisma.whatsappNumber.create({ data: { workspaceId: A, wabaId: "w", phoneNumberId: "pn-inbox", accessToken: sealSecret("tok", process.env.SESSION_ENCRYPTION_KEY!) } });
    await prisma.whatsappTemplate.create({ data: { id: "tpl-inbox", workspaceId: A, wabaId: "w", name: "follow_up", language: "en", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Hi {{1}}, your order is ready." }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Thanks" }] }] } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: ["u-olivia", "u-rahul"] } } });
    await prisma.$disconnect();
  });

  it("stores incoming messages and lists the chat (once, even if Meta repeats)", async () => {
    const msg = { from: "919820144120", id: "wamid.in1", timestamp: ts(at), type: "text", text: { body: "Is the red saree available?" } };
    expect(await hook([msg], [{ wa_id: "919820144120", profile: { name: "Priya" } }])).toEqual({ status: 200 });
    expect(await hook([msg])).toEqual({ status: 200 });
    await hook([{ from: "919820144120", id: "wamid.in2", timestamp: ts(new Date(at.getTime() + 1000)), type: "image", image: { id: "m-img", mime_type: "image/jpeg", caption: "this one" } }]);
    const chats = await listChats(prisma, A, me.id, {}, at);
    expect(chats).toEqual([expect.objectContaining({ name: "Priya", preview: "📷 Photo: this one", unread: 2, open: true })]);
    priya = chats[0]!.id;
    const chat = (await getChat(prisma, A, priya, at))!;
    expect(chat.messages.map((m) => [m.dir, m.kind, m.body, m.media?.type ?? null])).toEqual([
      ["IN", "TEXT", "Is the red saree available?", null],
      ["IN", "IMAGE", "this one", "image/jpeg"],
    ]);
    expect(await getChat(prisma, B, priya, at)).toBeNull();
    expect(await listChats(prisma, B, me.id, {}, at)).toEqual([]);
  });

  it("opening the chat sends a read receipt", async () => {
    calls.length = 0;
    await markChatRead(prisma, A, priya, deps(at));
    expect(calls).toEqual([{ path: "pn-inbox/messages", body: { messaging_product: "whatsapp", status: "read", message_id: "wamid.in2" } }]);
    expect((await listChats(prisma, A, me.id, { tab: "unread" }, at)).length).toBe(0);
  });

  it("replies with text and files inside 24 hours; only templates after", async () => {
    const r = await sendInboxText(prisma, A, me, priya, "Yes! ₹6,450 after the discount.", "wamid.in1", deps(at));
    expect(r).toMatchObject({ ok: true });
    expect(calls.at(-1)).toEqual({ path: "pn-inbox/messages", body: expect.objectContaining({ to: "919820144120", type: "text", text: { body: "Yes! ₹6,450 after the discount.", preview_url: false }, context: { message_id: "wamid.in1" } }) });
    const pdf = new File([new Uint8Array(20)], "size-guide.pdf", { type: "application/pdf" });
    expect(await sendInboxFile(prisma, A, me, priya, pdf, "Size guide", deps(at))).toMatchObject({ ok: true });
    expect(calls.at(-1)!.body).toMatchObject({ type: "document", document: { id: "media-1", caption: "Size guide", filename: "size-guide.pdf" } });
    expect((await listChats(prisma, A, me.id, { reply: "replied" }, at))[0]).toMatchObject({ preview: "You: 📄 Document: Size guide" });
    const later = new Date(at.getTime() + 25 * 3_600_000);
    expect(await sendInboxText(prisma, A, me, priya, "Hello?", undefined, deps(later))).toMatchObject({ ok: false, error: expect.stringContaining("template") });
    expect(await sendInboxTemplate(prisma, A, me, priya, { templateId: "tpl-inbox", values: {} }, deps(later))).toMatchObject({ ok: false, error: expect.stringContaining("{{1}}") });
    expect(await sendInboxTemplate(prisma, A, me, priya, { templateId: "tpl-inbox", values: { "body:1": "Priya" } }, deps(later))).toMatchObject({ ok: true });
    expect(calls.at(-1)!.body).toMatchObject({ type: "template", template: { name: "follow_up", components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }] }] } });
    const chat = (await getChat(prisma, A, priya, later))!;
    expect(chat.windowEnds).toBeNull();
    expect(chat.messages.at(-1)).toMatchObject({ dir: "OUT", kind: "TEMPLATE", body: "Hi Priya, your order is ready.", by: "Olivia", extra: { template: "follow_up", buttons: ["Thanks"] } });
    expect(await sendInboxText(prisma, B, me, priya, "hi", undefined, deps(at))).toMatchObject({ ok: false });
  });

  it("star, assign, done, notes, filters, delete", async () => {
    expect(await updateChat(prisma, A, priya, { assignedTo: "u-rahul" })).toMatchObject({ ok: false });
    expect(await updateChat(prisma, A, priya, { assignedTo: "u-olivia", starred: true })).toMatchObject({ ok: true });
    expect((await listChats(prisma, A, me.id, { tab: "priority", assigned: "me" }, at)).length).toBe(1);
    expect((await listChats(prisma, A, me.id, { assigned: "none" }, at)).length).toBe(0);
    expect(await addNote(prisma, A, me, priya, "Prefers delivery after 6 pm")).toMatchObject({ ok: true });
    expect((await getChat(prisma, A, priya, at))!.notes).toEqual([expect.objectContaining({ body: "Prefers delivery after 6 pm", by: "Olivia" })]);
    expect(await saveSavedReply(prisma, A, { shortcut: "/COD", body: "Yes, we do cash on delivery." })).toMatchObject({ ok: true });
    const counts = await inboxCounts(prisma, A, me.id, {}, at);
    expect(counts).toMatchObject({ all: 1, priority: 1, window: { open: 1, closed: 0 }, reply: { needs: 0, replied: 1 } });
    expect(await deleteChat(prisma, B, priya)).toMatchObject({ ok: false });
    expect(await deleteChat(prisma, A, priya)).toMatchObject({ ok: true });
    expect(await listChats(prisma, A, me.id, {}, at)).toEqual([]);
    expect(await prisma.whatsappContact.count({ where: { id: priya } })).toBe(1);
  });
});
