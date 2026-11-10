import { prisma } from "@invytra/db";
import { notFound } from "next/navigation";
import { InvyResults } from "@/components/invy/InvyResults";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { getSearch } from "@/lib/invy";

export const metadata = { title: "Ask Invy" };
export const dynamic = "force-dynamic";

export default async function InvySearchPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const s = await getSearch(prisma, me.workspace.id, (await params).id);
  if (!s) notFound();
  return <InvyResults s={s} home={hubHref("/invy")} />;
}
