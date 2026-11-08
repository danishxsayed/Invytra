import { CHANNELS, canUseChannel, type ChannelId } from "@invytra/shared";
import type { CurrentUser } from "./auth";
import { channelHref, hubHref } from "./domains";

/** Billing is the owner's: everyone else sees neither the page nor its links. */
export const canSeeBilling = (me: Pick<CurrentUser, "role">) => me.role === "OWNER";

/** Where the AI credits chip leads: Billing for the owner, nowhere for members. */
export const creditsHref = (me: Pick<CurrentUser, "role">) => (canSeeBilling(me) ? hubHref("/billing#credits") : null);

const NAV_LABEL: Record<ChannelId, string> = { linkedin: "LinkedIn", whatsapp: "WhatsApp", email: "Email Marketing", instagram: "Instagram" };

/** The channels in the workspace menu: a link when usable, else why not. */
export function navChannels(me: CurrentUser) {
  return CHANNELS.map((c) => {
    const usable = canUseChannel(c, me.workspace.channels);
    return { id: c.id, label: NAV_LABEL[c.id] ?? c.name, href: usable ? channelHref(c.id) : null, note: c.status !== "live" ? "Soon" : usable ? undefined : "Not in plan" };
  });
}
