import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { canSeeBilling } from "@/lib/workspace-nav";

/** Credits live on the Billing page now (owner only). */
export default async function OldCredits() {
  const me = await requireUser();
  redirect(canSeeBilling(me) ? hubHref("/billing#credits") : hubHref("/"));
}
