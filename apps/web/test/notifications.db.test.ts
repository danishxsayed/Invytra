/**
 * The bell against a real database (only with TEST_DATABASE_URL — it is wiped): @mentions in notes,
 * chats assigned to someone else, template reviews, listing, counts, marking read, the pulse, tenancy.
 */
import { PrismaClient, templateNotices } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listNotifications, markNotificationsRead, whatsappPulse } from "../src/lib/notifications";
import { addNote, updateChat } from "../src/lib/whatsapp-inbox-send";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = "ws-bell-a";
const B = "ws-bell-b";
const U = ["u-bell-sneha", "u-bell-rohan", "u-bell-arjun", "u-bell-out"];

d("notifications", () => {
  let prisma: PrismaClient;
  const sneha = { id: "u-bell-sneha", name: "Sneha Patil" };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: U } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Nimbus" }, { id: B, name: "Other" }] });
    await prisma.user.createMany({
      data: [
        { id: U[0]!, email: "sneha@bell.test", name: "Sneha Patil", passwordHash: "x" },
        { id: U[1]!, email: "rohan@bell.test", name: "Rohan Iyer", passwordHash: "x" },
        { id: U[2]!, email: "arjun@bell.test", name: "Arjun Mehta", passwordHash: "x" },
        { id: U[3]!, email: "out@bell.test", name: "Rohan Outsider", passwordHash: "x" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { userId: U[2]!, workspaceId: A, role: "OWNER" },
        { userId: U[0]!, workspaceId: A, role: "MEMBER" },
        { userId: U[1]!, workspaceId: A, role: "MEMBER" },
        { userId: U[3]!, workspaceId: B, role: "OWNER" },
      ],
    });
    await prisma.whatsappContact.create({ data: { id: "c-bell-priya", workspaceId: A, phone: "919820144120", firstName: "Priya", lastName: "Sharma", unread: 2, chatAt: new Date("2026-11-16T10:31:00Z"), chatFrom: "IN" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: U } } });
    await prisma.$disconnect();
  });

  it("tells the teammates a note mentions (not the author, not other workspaces)", async () => {
    expect(await addNote(prisma, A, sneha, "c-bell-priya", "@rohan can you hold one in M? @Sneha @Arjun Mehta")).toMatchObject({ ok: true });
    const rohan = await listNotifications(prisma, A, U[1]!);
    expect(rohan.items).toHaveLength(1);
    expect(rohan.items[0]).toMatchObject({ kind: "MENTION", title: "Sneha Patil mentioned you in a note on Priya Sharma", body: "@rohan can you hold one in M? @Sneha @Arjun Mehta", href: "/whatsapp/inbox?c=c-bell-priya", actor: "Sneha Patil", read: false });
    expect((await listNotifications(prisma, A, U[2]!)).items).toHaveLength(1);
    expect((await listNotifications(prisma, A, U[0]!)).items).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: U[3]! } })).toBe(0);
    // A note without "@" tells nobody.
    await addNote(prisma, A, sneha, "c-bell-priya", "Prefers delivery after 6 pm");
    expect(await prisma.notification.count({ where: { workspaceId: A } })).toBe(2);
  });

  it("tells someone a chat was assigned to them, once, and not when they take it themselves", async () => {
    await updateChat(prisma, A, "c-bell-priya", { assignedTo: U[2]! }, new Date(), sneha);
    await updateChat(prisma, A, "c-bell-priya", { assignedTo: U[2]!, starred: true }, new Date(), sneha);
    await updateChat(prisma, A, "c-bell-priya", { assignedTo: U[0]! }, new Date(), sneha);
    const arjun = await listNotifications(prisma, A, U[2]!, "ASSIGNED");
    expect(arjun.items.map((n) => n.title)).toEqual(["Sneha Patil assigned Priya Sharma to you"]);
    expect(await prisma.notification.count({ where: { userId: U[0]!, kind: "ASSIGNED" } })).toBe(0);
  });

  it("tells the owners when Meta reviews a template", async () => {
    await templateNotices(prisma, { workspaceId: A, name: "diwali_sale", language: "en" }, "REJECTED", "INCORRECT_CATEGORY");
    const t = await listNotifications(prisma, A, U[2]!, "TEMPLATE");
    expect(t.items[0]).toMatchObject({ title: "Meta rejected your template diwali_sale", tone: "bad", href: "/whatsapp/templates" });
    expect(t.items[0]!.body).toMatch(/category/);
    expect(await prisma.notification.count({ where: { userId: U[1]!, kind: "TEMPLATE" } })).toBe(0);
  });

  it("counts unread by tab and marks read (only your own)", async () => {
    const all = await listNotifications(prisma, A, U[2]!);
    expect(all.counts).toMatchObject({ all: 3, MENTION: 1, ASSIGNED: 1, TEMPLATE: 1, CAMPAIGN: 0 });
    expect(await markNotificationsRead(prisma, A, U[1]!, [all.items[0]!.id])).toBe(0);
    expect(await markNotificationsRead(prisma, A, U[2]!, [all.items[0]!.id])).toBe(1);
    expect((await listNotifications(prisma, A, U[2]!)).counts.all).toBe(2);
    expect(await markNotificationsRead(prisma, A, U[2]!)).toBe(2);
    expect((await listNotifications(prisma, A, U[2]!)).counts.all).toBe(0);
  });

  it("gives every page its pulse: unread chats, the last message in, the bell", async () => {
    expect(await whatsappPulse(prisma, A, U[1]!)).toEqual({ unreadChats: 1, lastIn: "2026-11-16T10:31:00.000Z", bell: 1 });
    expect(await whatsappPulse(prisma, B, U[3]!)).toEqual({ unreadChats: 0, lastIn: null, bell: 0 });
  });
});
