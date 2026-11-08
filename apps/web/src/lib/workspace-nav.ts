import type { CurrentUser } from "./auth";
import { hubHref } from "./domains";

/** Billing is the owner's: everyone else sees neither the page nor its links. */
export const canSeeBilling = (me: Pick<CurrentUser, "role">) => me.role === "OWNER";

/** Where the AI credits chip leads: Billing for the owner, nowhere for members. */
export const creditsHref = (me: Pick<CurrentUser, "role">) => (canSeeBilling(me) ? hubHref("/billing#credits") : null);
