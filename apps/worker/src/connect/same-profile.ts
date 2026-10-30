import type { PrismaClient } from "@invytra/db";
import { parseProfileUrl } from "@invytra/shared";

type Profile = { name: string | null; url: string | null };

/** Where else this LinkedIn profile is already connected: an account in this workspace, or another user's. */
export type ProfileTwin = { label: string } | { otherUser: true };

const slugOf = (url: string | null, baseUrl: string) => {
  if (!url) return null;
  const r = parseProfileUrl(url, baseUrl);
  return r.ok ? r.slug.toLowerCase() : null;
};

/**
 * Whether this LinkedIn profile is already connected on Invytra: in this workspace (with
 * that account's name), or by another user (no details shared). Compared by profile link
 * everywhere; by name only inside the workspace, and only when a link is missing on either side.
 * One profile on two accounts would act twice from one person and read one inbox twice.
 */
export async function sameProfileElsewhere(
  prisma: PrismaClient,
  account: { id: string; workspaceId: string },
  profile: Profile,
  baseUrl: string,
): Promise<ProfileTwin | null> {
  if (!profile.url && !profile.name) return null;
  const slug = slugOf(profile.url, baseUrl);
  const name = profile.name?.trim().toLowerCase() || null;
  const others = await prisma.linkedinAccount.findMany({
    where: {
      id: { not: account.id },
      OR: [{ workspaceId: account.workspaceId }, ...(slug ? [{ profileUrl: { contains: `/in/${slug}`, mode: "insensitive" as const } }] : [])],
    },
    select: { label: true, workspaceId: true, profileName: true, profileUrl: true },
  });
  // A twin in this workspace is named, so look there first.
  others.sort((a, b) => Number(b.workspaceId === account.workspaceId) - Number(a.workspaceId === account.workspaceId));
  for (const o of others) {
    const otherSlug = slugOf(o.profileUrl, baseUrl);
    const mine = o.workspaceId === account.workspaceId;
    if (slug && otherSlug) {
      if (slug === otherSlug) return mine ? { label: o.label } : { otherUser: true };
    } else if (mine && name && o.profileName?.trim().toLowerCase() === name) {
      return { label: o.label };
    }
  }
  return null;
}
