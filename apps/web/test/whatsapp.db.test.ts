/**
 * WhatsApp against a real database (only with TEST_DATABASE_URL — it is wiped) and a fake
 * Meta Graph API: connecting a number, templates, the webhook.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, openSecret, type MetaApp, type PlatformEmail } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatIdentity, connectNumber, saveProfilePhoto, createTemplate, deleteTemplate, disconnectNumber, getNumber, refreshNumber, syncTemplates, type WaDeps } from "../src/lib/whatsapp";
import { handleWhatsappWebhook, verifyWebhook } from "../src/lib/whatsapp-webhook";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

const app: MetaApp = { appId: "111", appSecret: "app-secret", configId: "cfg", verifyToken: "verify-me", creditLineId: "999", version: "v23.0" };

d("whatsapp", () => {
  let prisma: PrismaClient;
  const A = "ws-wa-a";
  const B = "ws-wa-b";
  const calls: { method: string; path: string; body?: unknown; auth?: string }[] = [];
  let templates: Record<string, unknown>[] = [{ id: "t1", name: "hello_world", language: "en_US", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello World" }] }];
  let failRegister = false;
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const path = u.pathname.replace("/v23.0/", "");
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body, auth: new Headers(init?.headers).get("authorization") ?? undefined });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (path === "oauth/access_token") return u.searchParams.get("code") === "good-code" ? json({ access_token: "biz-token" }) : json({ error: { message: "bad code", code: 100 } }, 400);
    if (path === "555/subscribed_apps") return json({ success: true });
    if (path === "777/register") return failRegister ? json({ error: { message: "pin", code: 133005 } }, 400) : json({ success: true });
    if (path === "999/whatsapp_credit_sharing_and_attach") return json({ allocation_config_id: "a1", waba_id: "555" });
    if (path === "777") return json({ id: "777", display_phone_number: "+971 50 123 4567", verified_name: "Acme", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K", status: "CONNECTED", is_official_business_account: true });
    if (path === "111/uploads") return json({ id: "upload:abc" });
    if (path === "upload:abc") return json({ h: "photo-handle" });
    if (path === "777/whatsapp_business_profile" && method === "POST") return json({ success: true });
    if (path === "777/whatsapp_business_profile") return json({ data: [{ about: "Hi", profile_picture_url: "https://pps.whatsapp.net/acme.jpg" }] });
    if (path === "555/message_templates" && method === "GET") return json({ data: templates });
    if (path === "555/message_templates" && method === "POST") return json({ id: "t2", status: "PENDING", category: "MARKETING" });
    if (path === "555/message_templates" && method === "DELETE") return json({ success: true });
    return json({ error: { message: `unexpected ${method} ${path}` } }, 404);
  }) as typeof fetch;
  const deps: WaDeps = { app, fetch: fakeFetch };

  const clean = () => prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await clean();
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("refuses without the app keys or with a bad code", async () => {
    expect(await connectNumber(prisma, A, { code: "good-code-xx", wabaId: "555", phoneNumberId: "777" }, { app: null })).toMatchObject({ ok: false, error: expect.stringContaining("isn't set up") });
    expect(await connectNumber(prisma, A, { code: "bad-code-xxxx", wabaId: "555", phoneNumberId: "777" }, deps)).toMatchObject({ ok: false, error: expect.stringContaining("Meta refused") });
    expect(await getNumber(prisma, A)).toBeNull();
  });

  it("connects: token, webhooks, registration, credit line, details, templates", async () => {
    calls.length = 0;
    const r = await connectNumber(prisma, A, { code: "good-code", wabaId: "555", phoneNumberId: "777" }, deps);
    expect(r).toMatchObject({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET oauth/access_token",
      "POST 555/subscribed_apps",
      "POST 777/register",
      "POST 999/whatsapp_credit_sharing_and_attach",
      "GET 777",
      "GET 555/message_templates",
    ]);
    expect(calls[2]!.body).toMatchObject({ messaging_product: "whatsapp", pin: expect.stringMatching(/^\d{6}$/) });
    expect(calls[3]!.auth).toBe("Bearer 111|app-secret");
    const n = await getNumber(prisma, A);
    expect(n).toMatchObject({ displayPhone: "+971 50 123 4567", verifiedName: "Acme", quality: "GREEN", messagingTier: "TIER_1K", status: "CONNECTED", creditShared: true, lastError: null });
    const row = await prisma.whatsappNumber.findFirstOrThrow({ where: { workspaceId: A } });
    expect(row.accessToken).not.toContain("biz-token");
    expect(openSecret(row.accessToken, process.env.SESSION_ENCRYPTION_KEY!)).toBe("biz-token");
    expect(await prisma.whatsappTemplate.count({ where: { workspaceId: A } })).toBe(1);
  });

  it("keeps a number to one workspace", async () => {
    expect(await connectNumber(prisma, B, { code: "good-code", wabaId: "555", phoneNumberId: "777" }, deps)).toMatchObject({ ok: false, error: expect.stringContaining("another Invytra workspace") });
  });

  it("records a registration problem instead of hiding it", async () => {
    failRegister = true;
    const r = await connectNumber(prisma, A, { code: "good-code", wabaId: "555", phoneNumberId: "777" }, deps);
    failRegister = false;
    expect(r).toMatchObject({ ok: true, value: { warning: expect.stringContaining("PIN") } });
    expect(await getNumber(prisma, A)).toMatchObject({ status: "ERROR" });
    expect(await refreshNumber(prisma, A, deps)).toEqual({ ok: true, value: undefined });
    expect(await getNumber(prisma, A)).toMatchObject({ status: "CONNECTED", lastError: null });
  });

  it("chat identity: profile photo and green badge, nothing for a workspace without a number", async () => {
    expect(await chatIdentity(prisma, A, deps)).toEqual({ photo: "https://pps.whatsapp.net/acme.jpg", official: true });
    expect(await chatIdentity(prisma, B, deps)).toEqual({ photo: null, official: false });
  });

  it("changes the profile photo: checks the file, uploads it, sets it", async () => {
    const png = (size: number, type = "image/png") => new File([new Uint8Array(size)], "logo.png", { type });
    expect(await saveProfilePhoto(prisma, A, png(10, "image/gif"), deps)).toMatchObject({ ok: false, error: expect.stringContaining("JPG or PNG") });
    expect(await saveProfilePhoto(prisma, A, png(6 * 1024 * 1024), deps)).toMatchObject({ ok: false, error: expect.stringContaining("5 MB") });
    expect(await saveProfilePhoto(prisma, B, png(10), deps)).toMatchObject({ ok: false, error: expect.stringContaining("Connect") });
    calls.length = 0;
    expect(await saveProfilePhoto(prisma, A, png(10), deps)).toEqual({ ok: true, value: undefined });
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "777/whatsapp_business_profile", body: { messaging_product: "whatsapp", profile_picture_handle: "photo-handle" } });
  });

  it("submits templates (checked first), syncs and deletes", async () => {
    const draft = { name: "intro_offer", language: "en", category: "MARKETING" as const, header: { type: "NONE" as const }, body: "Hi {{1}}, we help teams book more meetings. Interested?", bodyExamples: ["Sara"], footer: "", buttons: [] };
    expect(await createTemplate(prisma, A, { ...draft, bodyExamples: [] }, deps)).toMatchObject({ ok: false, error: "Add a sample value for {{1}}." });
    const r = await createTemplate(prisma, A, draft, deps);
    expect(r).toMatchObject({ ok: true, value: { status: "PENDING" } });
    expect(calls.at(-1)!.body).toMatchObject({ name: "intro_offer", components: [{ type: "BODY", example: { body_text: [["Sara"]] } }] });
    expect(await createTemplate(prisma, A, draft, deps)).toMatchObject({ ok: false, error: expect.stringContaining("already exists") });
    // Meta now has both; a template deleted in Meta disappears here on sync.
    templates = [{ id: "t2", name: "intro_offer", language: "en", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: draft.body }], quality_score: { score: "GREEN" } }];
    expect(await syncTemplates(prisma, A, deps)).toEqual({ ok: true, value: { count: 1 } });
    const rows = await prisma.whatsappTemplate.findMany({ where: { workspaceId: A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "intro_offer", status: "APPROVED", quality: "GREEN" });
    expect(await deleteTemplate(prisma, B, rows[0]!.id, deps)).toMatchObject({ ok: false });
    expect(await deleteTemplate(prisma, A, rows[0]!.id, deps)).toEqual({ ok: true, value: undefined });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "555/message_templates" });
  });

  it("webhook: checks the signature, updates reviews and number quality", async () => {
    await prisma.whatsappTemplate.create({ data: { workspaceId: A, wabaId: "555", metaId: "t9", name: "follow_up", language: "en", category: "MARKETING", status: "PENDING", components: [] } });
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "555",
          changes: [
            { field: "message_template_status_update", value: { event: "REJECTED", message_template_id: "t9", message_template_name: "follow_up", message_template_language: "en", reason: "PROMOTIONAL" } },
            { field: "phone_number_quality_update", value: { display_phone_number: "971501234567", event: "DOWNGRADE", current_limit: "TIER_250" } },
          ],
        },
      ],
    });
    const sig = `sha256=${createHmac("sha256", "app-secret").update(payload).digest("hex")}`;
    expect(await handleWhatsappWebhook(prisma, payload, "sha256=bad", app)).toEqual({ status: 401 });
    expect(await handleWhatsappWebhook(prisma, payload, sig, null)).toEqual({ status: 503 });
    const owner = await prisma.user.upsert({ where: { email: "owner@wa.test" }, update: {}, create: { email: "owner@wa.test", name: "Sara Khan", passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: owner.id, workspaceId: A, role: "OWNER" } });
    const mails: PlatformEmail[] = [];
    expect(await handleWhatsappWebhook(prisma, payload, sig, app, (m) => mails.push(...m))).toEqual({ status: 200 });
    expect(await prisma.whatsappTemplate.findFirst({ where: { metaId: "t9" } })).toMatchObject({ status: "REJECTED", rejectedReason: "PROMOTIONAL" });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "owner@wa.test", subject: 'Rejected: your WhatsApp template "follow_up"' });
    expect(mails[0]!.text).toContain("Submit it as Marketing");
    // The same status again (Meta retries) sends nothing.
    expect(await handleWhatsappWebhook(prisma, payload, sig, app, (m) => mails.push(...m))).toEqual({ status: 200 });
    expect(mails).toHaveLength(1);
    await prisma.user.delete({ where: { id: owner.id } });
    expect(await getNumber(prisma, A)).toMatchObject({ messagingTier: "TIER_250" });
    const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" });
    expect(verifyWebhook(q, app)).toBe("42");
    q.set("hub.verify_token", "nope");
    expect(verifyWebhook(q, app)).toBeNull();
  });

  it("disconnects: number and its templates leave Invytra", async () => {
    expect(await disconnectNumber(prisma, A, deps)).toEqual({ ok: true, value: undefined });
    expect(await getNumber(prisma, A)).toBeNull();
    expect(await prisma.whatsappTemplate.count({ where: { workspaceId: A } })).toBe(0);
  });
});
