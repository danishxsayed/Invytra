/**
 * Database tests: run only when TEST_DATABASE_URL points at a disposable
 * Postgres with the migrations applied (it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountsOverview, recentActivity, recentReplies } from "../src/lib/data";
import { EmailTakenError, checkLogin, registerUser } from "../src/lib/registration";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("workspaces and tenant isolation", () => {
  let prisma: PrismaClient;
  let first: { userId: string; workspaceId: string };
  let second: { userId: string; workspaceId: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$executeRawUnsafe(
      `TRUNCATE inbox_messages, actions, memberships, users, linkedin_accounts RESTART IDENTITY CASCADE`,
    );
    await prisma.workspace.deleteMany({ where: { id: { not: "default" } } });
    await prisma.workspace.update({ where: { id: "default" }, data: { name: "My workspace" } });
    // A Phase 0 account that already exists in the default workspace
    await prisma.linkedinAccount.create({
      data: { id: "acc-old", label: "test-1", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
    });
    await prisma.action.create({ data: { accountId: "acc-old", type: "CONNECTION_REQUEST", status: "SUCCEEDED", executedAt: new Date() } });
    await prisma.inboxMessage.create({
      data: { accountId: "acc-old", linkedinMessageId: "m1", fromName: "Carol", text: "Sure!", sentAt: new Date() },
    });
  });
  afterAll(() => prisma.$disconnect());

  it("gives the first user the default workspace with the existing accounts", async () => {
    first = await registerUser(prisma, { name: "Tahur", company: "Crawlers", email: "Tahur@Example.com", password: "a-long-password" });
    expect(first.workspaceId).toBe("default");
    expect((await prisma.workspace.findUnique({ where: { id: "default" } }))!.name).toBe("Crawlers");
    expect((await accountsOverview(prisma, first.workspaceId)).map((a) => a.label)).toEqual(["test-1"]);
  });

  it("gives every later user their own empty workspace", async () => {
    second = await registerUser(prisma, { name: "Other", company: "Acme", email: "other@acme.com", password: "another-long-pass" });
    expect(second.workspaceId).not.toBe("default");
    expect(await accountsOverview(prisma, second.workspaceId)).toEqual([]);
  });

  it("never shows one workspace's activity or replies to another", async () => {
    expect(await recentActivity(prisma, second.workspaceId)).toEqual([]);
    expect(await recentReplies(prisma, second.workspaceId)).toEqual([]);
    expect((await recentActivity(prisma, first.workspaceId)).length).toBe(1);
    expect((await recentReplies(prisma, first.workspaceId)).length).toBe(1);
  });

  it("refuses a duplicate email (case-insensitive)", async () => {
    await expect(
      registerUser(prisma, { name: "X", company: "Y", email: "tahur@example.com", password: "a-long-password" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("stores only a hash of the password", async () => {
    const u = await prisma.user.findUnique({ where: { email: "tahur@example.com" } });
    expect(u!.passwordHash).not.toContain("a-long-password");
    expect(u!.passwordHash.startsWith("$2")).toBe(true);
  });

  it("checks logins", async () => {
    expect(await checkLogin(prisma, " TAHUR@example.com ", "a-long-password")).toEqual(first);
    expect(await checkLogin(prisma, "tahur@example.com", "wrong-password")).toBeNull();
    expect(await checkLogin(prisma, "nobody@example.com", "a-long-password")).toBeNull();
  });
});
