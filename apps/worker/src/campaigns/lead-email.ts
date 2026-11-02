import type { PrismaClient } from "@invytra/db";

/*
 * Emails found on LinkedIn: a connection's contact info sometimes has their email. We keep it
 * on the lead, and add them to Email Outreach → Contacts, in a list named after the LinkedIn
 * list ("LinkedIn · <list>"), so they can get email campaigns too. An existing contact is
 * never overwritten (it may have been edited or verified already).
 */

export const emailListName = (leadListName: string) => `LinkedIn · ${leadListName}`.slice(0, 120);

export async function saveLeadEmail(prisma: PrismaClient, leadId: string, email: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { list: { select: { name: true } } } });
  if (!lead || lead.email === email) return false;
  await prisma.lead.update({ where: { id: leadId }, data: { email } });
  const ws = lead.workspaceId;
  const contact = await prisma.emailContact.upsert({
    where: { workspaceId_email: { workspaceId: ws, email } },
    create: {
      workspaceId: ws,
      email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      vars: { linkedin_url: lead.profileUrl },
    },
    update: {},
  });
  const list = await prisma.emailList.upsert({
    where: { workspaceId_name: { workspaceId: ws, name: emailListName(lead.list.name) } },
    create: { workspaceId: ws, name: emailListName(lead.list.name) },
    update: {},
  });
  await prisma.emailListMember.upsert({
    where: { listId_contactId: { listId: list.id, contactId: contact.id } },
    create: { listId: list.id, contactId: contact.id },
    update: {},
  });
  return true;
}
