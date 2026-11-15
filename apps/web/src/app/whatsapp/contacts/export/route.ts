import { prisma } from "@invytra/db";
import { WA_CONSENT, toCsv, type WaConsentSource } from "@invytra/shared";
import { requireChannel } from "@/lib/auth";
import { WA_CONTACT_FILTERS, waContactWhere, type WaContactFilter } from "@/lib/whatsapp-contacts";
import { getSegment } from "@/lib/whatsapp-segments";

export const dynamic = "force-dynamic";

/** The contacts in view (or the ticked ones) as a CSV that imports back into Invytra. */
export async function GET(req: Request) {
  const me = await requireChannel("whatsapp");
  const ws = me.workspace.id;
  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, 5000);
  const view = sp.get("view") ?? "";
  const seg = sp.get("seg") ? await getSegment(prisma, ws, sp.get("seg")!) : null;
  const where = ids.length
    ? { workspaceId: ws, id: { in: ids } }
    : waContactWhere(ws, {
        filter: (WA_CONTACT_FILTERS as readonly string[]).includes(view) ? (view as WaContactFilter) : "all",
        segment: seg,
        tag: sp.get("tag") ?? undefined,
        city: sp.get("loc") ?? undefined,
        q: sp.get("q") ?? undefined,
      });
  const rows = await prisma.whatsappContact.findMany({ where, orderBy: { createdAt: "desc" }, take: 100_000 });
  const keys = [...new Set(rows.flatMap((c) => Object.keys((c.vars as Record<string, string>) ?? {})))].filter((k) => k !== "location").sort();
  const csv = toCsv([
    ["Name", "Phone", "Email", "User ID", "Company", "Tags", "WhatsApp Opted", "Location", "WhatsApp", "Status", "Consent", "Consent date", ...keys.map((k) => (k === "appointment_time" ? "Appointment Time" : k))],
    ...rows.map((c) => {
      const vars = (c.vars as Record<string, string>) ?? {};
      return [
        [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || "",
        `+${c.phone}`,
        c.email ?? "",
        c.externalId ?? "",
        c.company ?? "",
        c.tags.join(","),
        c.consentSource && !c.optedOutAt ? "yes" : "no",
        c.location ?? "",
        c.waStatus === "ON" ? "On WhatsApp" : c.waStatus === "NOT_FOUND" ? "Not found" : "",
        c.optedOutAt ? "Opted out" : c.consentSource ? "Subscribed" : "Not opted in",
        c.consentSource ? (WA_CONSENT[c.consentSource as WaConsentSource] ?? c.consentSource) : "",
        c.consentAt?.toISOString().slice(0, 10) ?? "",
        ...keys.map((k) => vars[k] ?? ""),
      ];
    }),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="whatsapp-contacts-${day}.csv"`, "cache-control": "no-store" } });
}
