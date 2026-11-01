import "server-only";
import type { PrismaClient } from "@invytra/db";
import type { ChannelId } from "@invytra/shared";

/** A channel's setup state on its hub card. */
export interface ChannelSetup {
  state: "ready" | "attention" | "setup";
  text: string;
}

type StatusReader = (prisma: PrismaClient, workspaceId: string) => Promise<ChannelSetup>;

/**
 * How far each channel is set up for a workspace. A new channel adds its reader here; one
 * without a reader shows as "Ready to set up".
 */
const READERS: Partial<Record<ChannelId, StatusReader>> = {
  linkedin: async (prisma, workspaceId) => {
    const [active, attention, campaigns] = await Promise.all([
      prisma.linkedinAccount.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.linkedinAccount.count({ where: { workspaceId, status: "NEEDS_ATTENTION" } }),
      prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
    ]);
    if (attention > 0) return { state: "attention", text: `${attention} account${attention === 1 ? " needs" : "s need"} attention` };
    if (active === 0) return { state: "setup", text: "Connect a LinkedIn account to start" };
    return {
      state: "ready",
      text: `${active} account${active === 1 ? "" : "s"} connected · ${campaigns} active campaign${campaigns === 1 ? "" : "s"}`,
    };
  },
  email: async (prisma, workspaceId) => {
    const [active, failing] = await Promise.all([
      prisma.emailAccount.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.emailAccount.count({ where: { workspaceId, status: "ERROR" } }),
    ]);
    if (failing > 0) return { state: "attention", text: `${failing} mailbox${failing === 1 ? " needs" : "es need"} attention` };
    if (active === 0) return { state: "setup", text: "Connect a mailbox to start" };
    return { state: "ready", text: `${active} mailbox${active === 1 ? "" : "es"} connected` };
  },
};

export async function channelSetup(prisma: PrismaClient, workspaceId: string, id: ChannelId): Promise<ChannelSetup> {
  const read = READERS[id];
  if (!read) return { state: "setup", text: "Ready to set up" };
  try {
    return await read(prisma, workspaceId);
  } catch {
    return { state: "setup", text: "Status unavailable right now" };
  }
}
