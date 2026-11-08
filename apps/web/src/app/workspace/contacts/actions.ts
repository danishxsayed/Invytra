"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { updatePerson } from "@/lib/contacts";
import { addDnc } from "@/lib/do-not-contact";

const id = z.string().min(1).max(40);

export async function updatePersonAction(personId: unknown, input: unknown): Promise<Result> {
  const me = await requireUser();
  const r = await updatePerson(prisma, me.workspace.id, id.parse(personId), input);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Puts this person's LinkedIn profile and email on the do-not-contact list (stops them everywhere). */
export async function blockPersonAction(personId: unknown): Promise<Result<number>> {
  const me = await requireUser();
  const p = await prisma.person.findFirst({ where: { id: id.parse(personId), workspaceId: me.workspace.id }, select: { linkedinUrl: true, linkedinSlug: true, email: true } });
  if (!p) return { ok: false, error: "Contact not found." };
  const lines = [p.linkedinUrl ?? (p.linkedinSlug ? `https://www.linkedin.com/in/${p.linkedinSlug}/` : null), p.email].filter(Boolean).join("\n");
  const r = await addDnc(prisma, me.workspace.id, me.user.id, lines, "Added from Contacts");
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, value: r.value.stopped.linkedin + r.value.stopped.email } : r;
}
