import { randomInt } from "node:crypto";
import { MetaClient, MetaError, metaApp, openSecret, sealSecret, type MetaApp, type MetaTemplate, type PrismaClient } from "@invytra/db";
import { WA_HEADER_MEDIA, checkTemplate, toMetaTemplate, type WaHeaderMedia, type WaTemplateDraft } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * WhatsApp (official Cloud API): connecting a number with Meta's Embedded Signup, the
 * number's status and business profile, and the account's message templates. Every query is
 * scoped to the signed-in workspace (CLAUDE.md rule 0). The business token is stored sealed
 * and never sent to the browser. Meta's notices: whatsapp-webhook.ts.
 */

export interface WaDeps {
  app: MetaApp | null;
  fetch?: typeof fetch;
  now?: Date;
}

const deps = (): WaDeps => ({ app: metaApp() });
const key = () => {
  const k = process.env.SESSION_ENCRYPTION_KEY;
  if (!k) throw new Error("SESSION_ENCRYPTION_KEY is missing from .env");
  return k;
};
const NOT_SET_UP = "WhatsApp isn't set up on this server yet. Ask the Invytra team.";
const failed = (e: unknown, what: string): { ok: false; error: string } => {
  if (e instanceof MetaError) return { ok: false, error: e.message };
  console.error(`WhatsApp ${what} failed:`, e instanceof Error ? e.message : e);
  return { ok: false, error: `Couldn't ${what} right now. Please try again.` };
};

type WaNumberRow = NonNullable<Awaited<ReturnType<PrismaClient["whatsappNumber"]["findFirst"]>>>;
export const clientFor = (n: Pick<WaNumberRow, "accessToken">, d: WaDeps) => new MetaClient(d.app!, openSecret(n.accessToken, key()), d.fetch);

/** What the browser needs to open Meta's signup popup (nothing secret). */
export function signupConfig(app: MetaApp | null = metaApp()) {
  return app ? { appId: app.appId, configId: app.configId, version: app.version } : null;
}

/** The workspace's number (one per workspace for now), without its secrets. */
export async function getNumber(prisma: PrismaClient, workspaceId: string) {
  return prisma.whatsappNumber.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, wabaId: true, phoneNumberId: true, displayPhone: true, verifiedName: true, nameStatus: true, quality: true, messagingTier: true, status: true, lastError: true, creditShared: true, syncedAt: true, createdAt: true },
  });
}
export type WaNumberView = NonNullable<Awaited<ReturnType<typeof getNumber>>>;

const connectSchema = z.object({
  code: z.string().min(4).max(2000),
  wabaId: z.string().regex(/^\d{1,30}$/, "Meta didn't say which WhatsApp account was chosen. Try again."),
  phoneNumberId: z.string().regex(/^\d{1,30}$/, "Meta didn't say which number was chosen. Try again."),
});

/** Finishes Embedded Signup: token, webhooks, registration, billing, then the templates. */
export async function connectNumber(prisma: PrismaClient, workspaceId: string, input: unknown, d: WaDeps = deps()): Promise<Result<{ id: string; warning?: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const p = connectSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const { code, wabaId, phoneNumberId } = p.data;
  const elsewhere = await prisma.whatsappNumber.findUnique({ where: { phoneNumberId }, select: { workspaceId: true } });
  if (elsewhere && elsewhere.workspaceId !== workspaceId) return { ok: false, error: "This number is already connected to another Invytra workspace." };
  const other = await prisma.whatsappNumber.findFirst({ where: { workspaceId, NOT: { phoneNumberId } }, select: { id: true } });
  if (other) return { ok: false, error: "This workspace already has a WhatsApp number. Disconnect it first." };

  let token: string;
  try {
    token = await MetaClient.exchangeCode(d.app, code, d.fetch);
  } catch (e) {
    return failed(e, "finish connecting with Meta");
  }
  const meta = new MetaClient(d.app, token, d.fetch);
  const problems: string[] = [];
  try {
    await meta.subscribeApp(wabaId);
  } catch (e) {
    return failed(e, "turn on messages for this account");
  }
  const pin = String(randomInt(100000, 1000000));
  try {
    await meta.register(phoneNumberId, pin);
  } catch (e) {
    problems.push(e instanceof MetaError ? e.message : "Meta didn't finish registering the number.");
  }
  let creditShared = false;
  if (d.app.creditLineId) {
    try {
      await meta.shareCreditLine(wabaId);
      creditShared = true;
    } catch (e) {
      problems.push(`Billing isn't attached yet: ${e instanceof MetaError ? e.message : "Meta refused"}`);
    }
  }
  let info: Awaited<ReturnType<MetaClient["phone"]>> = { id: phoneNumberId };
  try {
    info = await meta.phone(phoneNumberId);
  } catch (e) {
    problems.push(e instanceof MetaError ? e.message : "Couldn't read the number's details.");
  }
  const now = d.now ?? new Date();
  const data = {
    wabaId,
    accessToken: sealSecret(token, key()),
    pin: sealSecret(pin, key()),
    displayPhone: info.display_phone_number ?? "",
    verifiedName: info.verified_name ?? "",
    nameStatus: info.name_status ?? null,
    quality: (info.quality_rating ?? "UNKNOWN").toUpperCase(),
    messagingTier: info.messaging_limit_tier ?? null,
    status: problems.length ? "ERROR" : "CONNECTED",
    lastError: problems.join(" ") || null,
    creditShared,
    syncedAt: now,
  };
  const row = await prisma.whatsappNumber.upsert({ where: { phoneNumberId }, create: { workspaceId, phoneNumberId, ...data }, update: data });
  const sync = await syncTemplates(prisma, workspaceId, d);
  if (!sync.ok) problems.push(sync.error);
  return { ok: true, value: { id: row.id, ...(problems.length && { warning: problems.join(" ") }) } };
}

/** Reads the number's quality, limit and name status again from Meta. */
export async function refreshNumber(prisma: PrismaClient, workspaceId: string, d: WaDeps = deps()): Promise<Result> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  try {
    const info = await clientFor(n, d).phone(n.phoneNumberId);
    await prisma.whatsappNumber.update({
      where: { id: n.id },
      data: {
        displayPhone: info.display_phone_number ?? n.displayPhone,
        verifiedName: info.verified_name ?? n.verifiedName,
        nameStatus: info.name_status ?? n.nameStatus,
        quality: (info.quality_rating ?? n.quality).toUpperCase(),
        messagingTier: info.messaging_limit_tier ?? n.messagingTier,
        ...(info.status && info.status !== "CONNECTED"
          ? { status: "ERROR", lastError: `Meta shows the number as ${info.status.toLowerCase().replace(/_/g, " ")}. Open WhatsApp Manager to see why, or connect it again.` }
          : { status: "CONNECTED", lastError: null }),
        syncedAt: d.now ?? new Date(),
      },
    });
    return { ok: true, value: undefined };
  } catch (e) {
    if (e instanceof MetaError && e.code === 190) await prisma.whatsappNumber.update({ where: { id: n.id }, data: { status: "ERROR", lastError: e.message } });
    return failed(e, "check the number");
  }
}

/** Removes the number from Invytra (it stays on the customer's Meta account, untouched). */
export async function disconnectNumber(prisma: PrismaClient, workspaceId: string, d: WaDeps = deps()): Promise<Result> {
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "There's no number to disconnect." };
  if (d.app)
    await clientFor(n, d)
      .unsubscribeApp(n.wabaId)
      .catch(() => undefined); // best effort: the customer may have removed our access already
  await prisma.$transaction([prisma.whatsappTemplate.deleteMany({ where: { workspaceId, wabaId: n.wabaId } }), prisma.whatsappNumber.delete({ where: { id: n.id } })]);
  return { ok: true, value: undefined };
}

/* ---------- Business profile ---------- */

export const profileSchema = z.object({
  about: z.string().trim().max(139, "The status line can be up to 139 characters."),
  description: z.string().trim().max(512, "The description can be up to 512 characters."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(128)]),
  address: z.string().trim().max(256),
  website: z.union([z.literal(""), z.string().trim().url("Enter the website as https://…").max(256)]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export async function readProfile(prisma: PrismaClient, workspaceId: string, d: WaDeps = deps()): Promise<ProfileInput & { photo: string | null }> {
  const empty = { about: "", description: "", email: "", address: "", website: "", photo: null };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n || !d.app) return empty;
  try {
    const p = await clientFor(n, d).profile(n.phoneNumberId);
    return { about: p.about ?? "", description: p.description ?? "", email: p.email ?? "", address: p.address ?? "", website: p.websites?.[0] ?? "", photo: p.profile_picture_url ?? null };
  } catch {
    return empty;
  }
}

/** How the business appears at the top of a chat: its WhatsApp profile photo (a short-lived Meta link) and green badge. */
export async function chatIdentity(prisma: PrismaClient, workspaceId: string, d: WaDeps = deps()): Promise<{ photo: string | null; official: boolean }> {
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n || !d.app) return { photo: null, official: false };
  let c: MetaClient;
  try {
    c = clientFor(n, d);
  } catch {
    return { photo: null, official: false };
  }
  const [p, ph] = await Promise.allSettled([c.profile(n.phoneNumberId), c.phone(n.phoneNumberId)]);
  return {
    photo: p.status === "fulfilled" ? (p.value.profile_picture_url ?? null) : null,
    official: ph.status === "fulfilled" && ph.value.is_official_business_account === true,
  };
}

export async function saveProfile(prisma: PrismaClient, workspaceId: string, input: unknown, d: WaDeps = deps()): Promise<Result> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  const { website, ...rest } = p.data;
  try {
    await clientFor(n, d).updateProfile(n.phoneNumberId, { ...rest, websites: website ? [website] : [] });
    return { ok: true, value: undefined };
  } catch (e) {
    return failed(e, "save the profile");
  }
}

/* ---------- Templates ---------- */

const templateRow = (t: MetaTemplate) => ({
  metaId: t.id,
  category: t.category,
  status: t.status,
  rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
  quality: t.quality_score?.score ?? null,
  components: (t.components ?? []) as object,
});

/** Copies the account's templates from Meta (Meta is the source of truth). */
export async function syncTemplates(prisma: PrismaClient, workspaceId: string, d: WaDeps = deps()): Promise<Result<{ count: number }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  let list: MetaTemplate[];
  try {
    list = await clientFor(n, d).templates(n.wabaId);
  } catch (e) {
    return failed(e, "load your templates from Meta");
  }
  await prisma.$transaction(async (tx) => {
    for (const t of list) {
      const row = templateRow(t);
      await tx.whatsappTemplate.upsert({
        where: { wabaId_name_language: { wabaId: n.wabaId, name: t.name, language: t.language } },
        create: { workspaceId, wabaId: n.wabaId, name: t.name, language: t.language, ...row },
        update: row,
      });
    }
    const keep = new Set(list.map((t) => `${t.name}|${t.language}`));
    const local = await tx.whatsappTemplate.findMany({ where: { workspaceId, wabaId: n.wabaId }, select: { id: true, name: true, language: true } });
    const gone = local.filter((t) => !keep.has(`${t.name}|${t.language}`)).map((t) => t.id);
    if (gone.length) await tx.whatsappTemplate.deleteMany({ where: { id: { in: gone } } });
  });
  return { ok: true, value: { count: list.length } };
}

export async function listTemplates(prisma: PrismaClient, workspaceId: string) {
  return prisma.whatsappTemplate.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: "desc" }] });
}
export type WaTemplateRow = Awaited<ReturnType<typeof listTemplates>>[number];

/** Submits a new template to Meta for review. */
export async function createTemplate(prisma: PrismaClient, workspaceId: string, draft: WaTemplateDraft, d: WaDeps = deps()): Promise<Result<{ id: string; status: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const errs = checkTemplate(draft);
  if (errs.length) return { ok: false, error: errs[0]! };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  const exists = await prisma.whatsappTemplate.findUnique({ where: { wabaId_name_language: { wabaId: n.wabaId, name: draft.name, language: draft.language } } });
  if (exists) return { ok: false, error: "A template with this name and language already exists. Choose another name." };
  const body = toMetaTemplate(draft);
  try {
    const r = await clientFor(n, d).createTemplate(n.wabaId, body);
    const row = await prisma.whatsappTemplate.create({
      data: { workspaceId, wabaId: n.wabaId, metaId: r.id, name: draft.name, language: draft.language, category: r.category ?? draft.category, status: r.status ?? "PENDING", components: body.components as object },
    });
    return { ok: true, value: { id: row.id, status: row.status } };
  } catch (e) {
    return failed(e, "submit the template");
  }
}

export async function deleteTemplate(prisma: PrismaClient, workspaceId: string, templateId: string, d: WaDeps = deps()): Promise<Result> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const t = await prisma.whatsappTemplate.findFirst({ where: { id: templateId, workspaceId } });
  if (!t) return { ok: false, error: "That template is already gone." };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId, wabaId: t.wabaId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  try {
    // Meta deletes every language of a name at once unless the id is given.
    await clientFor(n, d).deleteTemplate(t.wabaId, t.name, t.metaId ?? undefined);
  } catch (e) {
    if (!(e instanceof MetaError && e.status === 404)) return failed(e, "delete the template");
  }
  await prisma.whatsappTemplate.delete({ where: { id: t.id } });
  return { ok: true, value: undefined };
}

/** Uploads the sample header file (image, video or PDF) Meta reviews with the template → its handle. */
export async function uploadHeaderMedia(prisma: PrismaClient, workspaceId: string, kind: string, file: File | null, d: WaDeps = deps()): Promise<Result<{ handle: string }>> {
  if (!d.app) return { ok: false, error: NOT_SET_UP };
  const spec = WA_HEADER_MEDIA[kind as WaHeaderMedia];
  if (!spec) return { ok: false, error: "Choose an image, video or document header." };
  if (!file || !file.size) return { ok: false, error: "Choose a file." };
  if (!(spec.types as readonly string[]).includes(file.type)) return { ok: false, error: `Use ${spec.hint.split(",")[0]}.` };
  if (file.size > spec.maxMb * 1024 * 1024) return { ok: false, error: `The file can be up to ${spec.maxMb} MB.` };
  const n = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });
  if (!n) return { ok: false, error: "Connect a WhatsApp number first." };
  try {
    const handle = await clientFor(n, d).uploadSample({ bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, name: file.name || "header" });
    return { ok: true, value: { handle } };
  } catch (e) {
    return failed(e, "upload the file");
  }
}
