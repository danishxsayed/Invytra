import type { PrismaClient } from "@invytra/db";
import { parseProfileUrl } from "@invytra/shared";

type Profile = { name: string | null; url: string | null };

const slugOf = (url: string | null, baseUrl: string) => {
  if (!url) return null;
  const r = parseProfileUrl(url, baseUrl);
  return r.ok ? r.slug.toLowerCase() : null;
};

/**
 * The label of another account in the same workspace that is this same LinkedIn profile,
 * or null. Compared by profile link; by name only when a link is missing on either side.
 * Two accounts on one profile would read the same inbox twice and act twice from one person.
 */
export async function sameProfileElsewhere(
  prisma: PrismaClient,
  account: { id: string; workspaceId: string },
  profile: Profile,
  baseUrl: string,
): Promise<string | null> {
  if (!profile.url && !profile.name) return null;
  const others = await prisma.linkedinAccount.findMany({
    where: { workspaceId: account.workspaceId, id: { not: account.id } },
    select: { label: true, profileName: true, profileUrl: true },
  });
  const slug = slugOf(profile.url, baseUrl);
  const name = profile.name?.trim().toLowerCase() || null;
  for (const o of others) {
    const otherSlug = slugOf(o.profileUrl, baseUrl);
    if (slug && otherSlug) {
      if (slug === otherSlug) return o.label;
    } else if (name && o.profileName?.trim().toLowerCase() === name) {
      return o.label;
    }
  }
  return null;
}
