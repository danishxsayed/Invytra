import { Prisma, type Person, type PrismaClient } from "@prisma/client";

/*
 * Contacts: one Person per human across channels. LinkedIn leads (by profile, plus the email
 * from their contact info) and email contacts (by address) are linked to their Person; when a
 * LinkedIn lead's email shows two contacts are the same human, they're merged. Runs in small
 * batches (worker every minute; the Contacts page before showing).
 */

/** "jane-doe-123" from a LinkedIn profile link (kept in step with linkedinSlug in @invytra/shared). */
export function profileSlug(url: string | null | undefined): string | null {
  const m = /linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i.exec(url ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!).toLowerCase().replace(/\/+$/, "");
  } catch {
    return m[1]!.toLowerCase();
  }
}

type Facts = Partial<Pick<Person, "firstName" | "lastName" | "company" | "title" | "location" | "linkedinSlug" | "linkedinUrl" | "email" | "photoUrl">>;

/** Only fills what the contact doesn't have yet (a photo is refreshed: LinkedIn's links expire). */
function fill(p: Person, f: Facts): Prisma.PersonUpdateInput {
  const out: Record<string, string> = {};
  for (const k of ["firstName", "lastName", "company", "title", "location", "linkedinSlug", "linkedinUrl", "email"] as const) if (!p[k] && f[k]) out[k] = f[k]!;
  if (f.photoUrl && f.photoUrl !== p.photoUrl) out.photoUrl = f.photoUrl;
  return out;
}

/** Moves everything of `from` onto `into` and deletes `from`. */
async function merge(tx: Prisma.TransactionClient, into: Person, from: Person): Promise<Person> {
  await tx.person.update({ where: { id: from.id }, data: { email: null, linkedinSlug: null } });
  await tx.lead.updateMany({ where: { personId: from.id }, data: { personId: into.id } });
  await tx.emailContact.updateMany({ where: { personId: from.id }, data: { personId: into.id } });
  const notes = [into.notes, from.notes].filter(Boolean).join("\n\n") || null;
  const merged = await tx.person.update({ where: { id: into.id }, data: { ...fill(into, { ...from, email: from.email, linkedinSlug: from.linkedinSlug } as Facts), phone: into.phone ?? from.phone, notes } });
  await tx.person.delete({ where: { id: from.id } });
  return merged;
}

/** The contact for these facts (found by profile or email, merged if both point at different ones), created if new. */
async function personFor(prisma: PrismaClient, workspaceId: string, f: Facts): Promise<Person> {
  return prisma.$transaction(async (tx) => {
    const bySlug = f.linkedinSlug ? await tx.person.findUnique({ where: { workspaceId_linkedinSlug: { workspaceId, linkedinSlug: f.linkedinSlug } } }) : null;
    const byEmail = f.email ? await tx.person.findUnique({ where: { workspaceId_email: { workspaceId, email: f.email } } }) : null;
    let p = bySlug ?? byEmail;
    // Two contacts, one human: keep the LinkedIn one (unless the email one has a different profile).
    if (bySlug && byEmail && bySlug.id !== byEmail.id && !byEmail.linkedinSlug) p = await merge(tx, bySlug, byEmail);
    if (!p) return tx.person.create({ data: { workspaceId, ...f } });
    // The email already belongs to someone else's profile: don't move it.
    const facts = byEmail && byEmail.id !== p.id ? { ...f, email: undefined } : f;
    const data = fill(p, facts);
    return Object.keys(data).length ? tx.person.update({ where: { id: p.id }, data }) : p;
  });
}

async function retrying<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    // Another sync created the same contact at the same moment: find it this time.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return f();
    throw e;
  }
}

/** Links unlinked LinkedIn leads and email contacts to contacts. Returns how many were linked. */
export async function syncPeople(prisma: PrismaClient, opts: { workspaceId?: string; batch?: number } = {}): Promise<number> {
  const batch = opts.batch ?? 300;
  const ws = opts.workspaceId ? { workspaceId: opts.workspaceId } : {};
  let linked = 0;
  // New leads, and linked ones that since learned an email (from LinkedIn contact info) or photo their contact lacks.
  const leads = await prisma.lead.findMany({
    where: { ...ws, OR: [{ personId: null }, { email: { not: null }, person: { email: null } }, { photoUrl: { not: null }, person: { photoUrl: null } }] },
    orderBy: { createdAt: "asc" },
    take: batch,
  });
  for (const l of leads) {
    const slug = profileSlug(l.profileUrl);
    const email = l.email?.trim().toLowerCase() || null;
    if (!slug && !email) continue;
    const p = await retrying(() =>
      personFor(prisma, l.workspaceId, { linkedinSlug: slug, linkedinUrl: slug ? l.profileUrl : null, email, firstName: l.firstName, lastName: l.lastName, company: l.company, title: l.title, location: l.location, photoUrl: l.photoUrl }),
    );
    // The same profile in other lists is the same contact.
    if (l.personId === p.id) continue;
    const notYet = { OR: [{ personId: null }, { personId: { not: p.id } }] };
    linked += (await prisma.lead.updateMany({ where: { workspaceId: l.workspaceId, OR: [{ id: l.id, ...notYet }, { profileUrl: l.profileUrl, personId: null }] }, data: { personId: p.id } })).count;
  }
  const contacts = await prisma.emailContact.findMany({ where: { ...ws, personId: null }, orderBy: { createdAt: "asc" }, take: batch });
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    const p = await retrying(() => personFor(prisma, c.workspaceId, { email, firstName: c.firstName, lastName: c.lastName, company: c.company, title: c.title }));
    linked += (await prisma.emailContact.updateMany({ where: { id: c.id, personId: null }, data: { personId: p.id } })).count;
  }
  return linked;
}
