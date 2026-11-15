import { prisma } from "@invytra/db";
import type { WaButton, WaTemplateDraft } from "@invytra/shared";
import { redirect } from "next/navigation";
import { TemplateBuilder } from "@/components/whatsapp/TemplateBuilder";
import { requireChannel } from "@/lib/auth";
import { getNumber } from "@/lib/whatsapp";

export const metadata = { title: "New WhatsApp template" };
export const dynamic = "force-dynamic";

const EMPTY_DRAFT: WaTemplateDraft = { name: "", language: "en", category: "MARKETING", header: { type: "NONE" }, body: "", bodyExamples: [], footer: "", buttons: [] };

type C = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** A saved template back into the builder (to fix a rejected one or start from it). */
function toDraft(t: { name: string; language: string; category: string; components: unknown }): WaTemplateDraft {
  const list = arr(t.components) as C[];
  const find = (type: string) => list.find((c) => s(c.type).toUpperCase() === type);
  const h = find("HEADER");
  const body = find("BODY");
  const ex = (c: C | undefined, k: string) => arr((c?.example as C | undefined)?.[k]);
  const buttons: WaButton[] = (arr(find("BUTTONS")?.buttons) as C[]).flatMap((b): WaButton[] => {
    const type = s(b.type).toUpperCase();
    if (type === "QUICK_REPLY") return [{ type, text: s(b.text) }];
    if (type === "URL") return [{ type, text: s(b.text), url: s(b.url), example: s(arr(b.example)[0]) }];
    if (type === "PHONE_NUMBER") return [{ type, text: s(b.text), phone: s(b.phone_number) }];
    if (type === "COPY_CODE") return [{ type, text: "", code: s(arr(b.example)[0] ?? b.example) }];
    return [];
  });
  const format = s(h?.format).toUpperCase();
  const footer = find("FOOTER");
  const category = t.category === "UTILITY" ? "UTILITY" : t.category === "AUTHENTICATION" ? "AUTHENTICATION" : "MARKETING";
  return {
    name: `${t.name}_v2`.slice(0, 512),
    language: t.language,
    category,
    ...(category === "AUTHENTICATION" && {
      otp: { securityNote: !!body?.add_security_recommendation, expiryMinutes: Number(footer?.code_expiration_minutes) || null, buttonText: s((arr(find("BUTTONS")?.buttons)[0] as C | undefined)?.text) || "Copy code" },
    }),
    header: !h ? { type: "NONE" } : format === "TEXT" ? { type: "TEXT", text: s(h.text), example: s(ex(h, "header_text")[0]) } : { type: format === "VIDEO" || format === "DOCUMENT" ? format : "IMAGE" },
    body: s(body?.text),
    bodyExamples: arr(ex(body, "body_text")[0]).map(s),
    footer: s(find("FOOTER")?.text),
    buttons,
  };
}

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const me = await requireChannel("whatsapp");
  const n = await getNumber(prisma, me.workspace.id);
  if (!n) redirect("/whatsapp/number");
  const copy = (await searchParams).copy;
  const from = copy ? await prisma.whatsappTemplate.findFirst({ where: { id: copy, workspaceId: me.workspace.id } }) : null;
  return <TemplateBuilder initial={from ? toDraft(from) : EMPTY_DRAFT} business={n.verifiedName} copied={!!from} />;
}
