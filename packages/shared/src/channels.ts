/*
 * The outreach channels of the platform. One account, one workspace, one sign-in; each
 * channel is a tool with its own subdomain (linkedin.invytra.com, whatsapp.invytra.com …).
 * Adding a channel = adding it here (and building its app): the workspace hub, the
 * subdomain routing and the access checks all read this list.
 */

export const CHANNEL_IDS = ["linkedin", "whatsapp", "email", "instagram"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** live = usable now; soon = shown as an upcoming, disabled card. */
export type ChannelStatus = "live" | "soon";

export interface ChannelDef {
  id: ChannelId;
  name: string;
  description: string;
  status: ChannelStatus;
  /** Its subdomain: <subdomain>.<root domain>. */
  subdomain: string;
  /** Where the tool lives inside this app (used when everything runs on one host, e.g. local dev). */
  basePath: string;
  /** Button text on its card. */
  open: string;
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    id: "linkedin",
    name: "LinkedIn Outreach",
    description: "Connection requests, messages and follow-ups from your LinkedIn accounts, with safe daily limits.",
    status: "live",
    subdomain: "linkedin",
    basePath: "/app",
    open: "Open LinkedIn",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Broadcasting",
    description: "Broadcasts and follow-ups on WhatsApp through the official Business API.",
    status: "soon",
    subdomain: "whatsapp",
    basePath: "/whatsapp",
    open: "Open WhatsApp",
  },
  {
    id: "email",
    name: "Email Marketing",
    description: "Cold email sequences with warm-up, inbox rotation and reply tracking.",
    status: "soon",
    subdomain: "email",
    basePath: "/email",
    open: "Open Email",
  },
  {
    id: "instagram",
    name: "Instagram Outreach",
    description: "Direct messages and follow-ups to Instagram profiles.",
    status: "soon",
    subdomain: "instagram",
    basePath: "/instagram",
    open: "Open Instagram",
  },
];

export const channelById = (id: string): ChannelDef | undefined => CHANNELS.find((c) => c.id === id);
export const channelBySubdomain = (sub: string): ChannelDef | undefined => CHANNELS.find((c) => c.subdomain === sub.toLowerCase());

/** Channels a new workspace gets (a paid package can add more as they launch). */
export const DEFAULT_WORKSPACE_CHANNELS: ChannelId[] = ["linkedin"];

/**
 * Whether a workspace may use a channel: it has launched, and the workspace's subscription
 * includes it. The one rule every channel app and the hub apply.
 */
export function canUseChannel(channel: ChannelDef | undefined, workspaceChannels: readonly string[]): boolean {
  return !!channel && channel.status === "live" && workspaceChannels.includes(channel.id);
}
