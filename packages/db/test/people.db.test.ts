import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { profileSlug, syncPeople } from "../src/people.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const U = (s: string) => `https://www.linkedin.com/in/${s}/`;

d("contacts sync", () => {
  let prisma: PrismaClient;
  const WS = "ws-people";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "P" } });
    await prisma.leadList.createMany({ data: [{ id: "pl-1", workspaceId: WS, name: "A" }, { id: "pl-2", workspaceId: WS, name: "B" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("one contact per profile across lists, linked to the email contact with the same address", async () => {
    await prisma.emailContact.create({ data: { id: "pc-sara", workspaceId: WS, email: "sara@acme.io", firstName: "Sara", company: "Acme" } });
    await prisma.lead.createMany({
      data: [
        { id: "pl-sara-1", workspaceId: WS, listId: "pl-1", profileUrl: U("Sara-Lee"), firstName: "Sara", lastName: "Lee", title: "CEO", photoUrl: "https://media.licdn.com/s.jpg" },
        { id: "pl-sara-2", workspaceId: WS, listId: "pl-2", profileUrl: U("Sara-Lee"), firstName: "Sara" },
        { id: "pl-tom", workspaceId: WS, listId: "pl-1", profileUrl: U("tom"), firstName: "Tom" },
      ],
    });
    expect(await syncPeople(prisma, { workspaceId: WS })).toBe(4);
    expect(await prisma.person.count({ where: { workspaceId: WS } })).toBe(3);
    const sara = await prisma.person.findFirstOrThrow({ where: { workspaceId: WS, linkedinSlug: "sara-lee" }, include: { leads: true, emailContacts: true } });
    expect(sara.leads.map((l) => l.id).sort()).toEqual(["pl-sara-1", "pl-sara-2"]);
    expect(sara).toMatchObject({ firstName: "Sara", lastName: "Lee", title: "CEO", email: null });

    // LinkedIn reveals Sara's email: her two contacts become one.
    await prisma.lead.update({ where: { id: "pl-sara-1" }, data: { email: "Sara@Acme.io" } });
    await syncPeople(prisma, { workspaceId: WS });
    expect(await prisma.person.count({ where: { workspaceId: WS } })).toBe(2);
    const merged = await prisma.person.findFirstOrThrow({ where: { workspaceId: WS, linkedinSlug: "sara-lee" }, include: { emailContacts: true } });
    expect(merged).toMatchObject({ email: "sara@acme.io", company: "Acme", lastName: "Lee" });
    expect(merged.emailContacts.map((c) => c.id)).toEqual(["pc-sara"]);
    expect(await syncPeople(prisma, { workspaceId: WS })).toBe(0);
  });

  it("reads profile slugs", () => {
    expect(profileSlug("https://www.linkedin.com/in/Jane%20Doe/?x=1")).toBe("jane doe");
    expect(profileSlug("https://example.com")).toBeNull();
  });
});
