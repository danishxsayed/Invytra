import { prisma } from "@invytra/db";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listSaved, searchCsv, socialsText } from "@/lib/invy";

/** CSV of a search's businesses (?ids=a,b,c for the chosen ones), or of saved businesses (id "saved"). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  let csv: string | null;
  if (id === "saved") {
    const rows = await listSaved(prisma, me.workspace.id);
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    csv = [
      "Business,Category,Address,Phone,Email,Social profiles,Website,Why,Opportunity,Google Maps,Saved",
      ...rows.map((r) => [r.name, r.category, r.address, r.phone, r.email, socialsText(r.socials), r.website, r.why, r.opportunity, r.mapsUrl, r.savedAt.toISOString().slice(0, 10)].map(cell).join(",")),
    ].join("\n");
  } else {
    const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 500) ?? null;
    csv = await searchCsv(prisma, me.workspace.id, id, ids);
  }
  if (csv === null) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ask-invy-${id === "saved" ? "saved" : "businesses"}.csv"`, "cache-control": "no-store" },
  });
}
