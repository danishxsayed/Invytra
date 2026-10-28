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

d("account management stays inside its workspace", () => {
  let prisma: PrismaClient;
  let mine: string;
  let theirs: string;
  const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

  beforeAll(async () => {
    process.env.SESSION_ENCRYPTION_KEY = KEY;
    process.env.ALLOW_NO_PROXY = "false";
    prisma = new PrismaClient({ datasources: { db: { url } } });
    mine = (await prisma.workspace.create({ data: { name: "Mine" } })).id;
    theirs = (await prisma.workspace.create({ data: { name: "Theirs" } })).id;
  });
  afterAll(() => prisma.$disconnect());

  it("creates accounts with an encrypted proxy and warm-up, and requires a proxy", async () => {
    const { createAccount } = await import("../src/lib/accounts");
    const noProxy = await createAccount(prisma, mine, { label: "a", timezone: "Asia/Kolkata", proxyUrl: "", warmup: true });
    expect(noProxy.ok).toBe(false);
    const r = await createAccount(prisma, mine, { label: "Sales 1", timezone: "Asia/Kolkata", proxyUrl: "http://u:secret@p.example:8000", warmup: true });
    expect(r.ok).toBe(true);
    const row = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: (r as { value: string }).value } });
    expect(row.proxyUrl).not.toContain("secret");
    expect(row.status).toBe("DISCONNECTED");
    expect(row.warmupUntil!.getTime()).toBeGreaterThan(Date.now() + 13 * 86400_000);
    const dup = await createAccount(prisma, mine, { label: "sales 1", timezone: "Asia/Kolkata", proxyUrl: "http://p.example:1", warmup: false });
    expect(dup).toEqual({ ok: false, error: "You already have an account with that name." });
    // Same name in another workspace is fine
    expect((await createAccount(prisma, theirs, { label: "Sales 1", timezone: "UTC", proxyUrl: "http://p.example:1", warmup: false })).ok).toBe(true);
  });

  it("never lets two LinkedIn accounts share a proxy (password and host case don't matter)", async () => {
    const lib = await import("../src/lib/accounts");
    const first = await lib.createAccount(prisma, mine, { label: "Proxy A", timezone: "UTC", proxyUrl: "http://alice:pw1@Gate.Proxy.test:9001", warmup: false });
    expect(first.ok).toBe(true);
    expect(await lib.createAccount(prisma, mine, { label: "Proxy B", timezone: "UTC", proxyUrl: "http://alice:other@gate.proxy.test:9001", warmup: false })).toEqual({
      ok: false,
      error: "This proxy is already used by “Proxy A”. Each LinkedIn account needs its own proxy, so buy another one for this account.",
    });
    // Another customer's account is never named.
    const r = await lib.createAccount(prisma, theirs, { label: "Theirs", timezone: "UTC", proxyUrl: "http://alice:pw1@gate.proxy.test:9001", warmup: false });
    expect(r).toEqual({ ok: false, error: "This proxy is already used by another LinkedIn account on Invytra. Each LinkedIn account needs its own proxy." });
    // A different username on the same gateway is a different proxy.
    expect((await lib.createAccount(prisma, mine, { label: "Proxy C", timezone: "UTC", proxyUrl: "http://bob:pw@gate.proxy.test:9001", warmup: false })).ok).toBe(true);
    // Changing an account to another account's proxy is refused; keeping its own is fine.
    const c = await prisma.linkedinAccount.findFirstOrThrow({ where: { workspaceId: mine, label: "Proxy C" } });
    const settings = {
      label: "Proxy C",
      timezone: "UTC",
      limits: { connectionRequestsPerDay: 20, connectionRequestsPerWeek: 150, messagesPerDay: 50, profileVisitsPerDay: 80, randomizeDaily: true },
      workingHours: { days: [1], startHour: 9, endHour: 18 },
      warmup: false,
      removeProxy: false,
    };
    expect((await lib.updateSettings(prisma, mine, c.id, { ...settings, proxyUrl: "http://alice:x@gate.proxy.test:9001" })).ok).toBe(false);
    expect((await lib.updateSettings(prisma, mine, c.id, { ...settings, proxyUrl: "http://bob:newpw@gate.proxy.test:9001" })).ok).toBe(true);
    // Older duplicates are reported on the Accounts page.
    await prisma.linkedinAccount.update({ where: { id: c.id }, data: { proxyUrl: (await prisma.linkedinAccount.findFirstOrThrow({ where: { label: "Proxy A" } })).proxyUrl } });
    expect(await lib.sharedProxyGroups(prisma, mine)).toEqual([expect.arrayContaining(["Proxy A", "Proxy C"])]);
    await prisma.linkedinAccount.deleteMany({ where: { label: { in: ["Proxy A", "Proxy C"] } } });
  });

  it("refuses to read, change, pause or remove another workspace's account", async () => {
    const lib = await import("../src/lib/accounts");
    const { accountsOverview } = await import("../src/lib/data");
    const target = await prisma.linkedinAccount.findFirstOrThrow({ where: { workspaceId: theirs } });
    await expect(lib.getAccount(prisma, mine, target.id)).rejects.toBeInstanceOf(lib.AccountNotFoundError);
    await expect(lib.setPaused(prisma, mine, target.id, true)).rejects.toBeInstanceOf(lib.AccountNotFoundError);
    await expect(lib.removeAccount(prisma, mine, target.id)).rejects.toBeInstanceOf(lib.AccountNotFoundError);
    await expect(
      lib.updateSettings(prisma, mine, target.id, {
        label: "hijack",
        timezone: "UTC",
        limits: { connectionRequestsPerDay: 40, connectionRequestsPerWeek: 200, messagesPerDay: 100, profileVisitsPerDay: 150, randomizeDaily: false },
        workingHours: { days: [1], startHour: 0, endHour: 24 },
        warmup: false,
        removeProxy: false,
      }),
    ).rejects.toBeInstanceOf(lib.AccountNotFoundError);
    expect(await accountsOverview(prisma, mine, target.id)).toEqual([]);
    expect((await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: target.id } })).label).toBe("Sales 1");
  });

  it("saves settings, pauses and resumes its own account", async () => {
    const lib = await import("../src/lib/accounts");
    const a = await prisma.linkedinAccount.findFirstOrThrow({ where: { workspaceId: mine } });
    const r = await lib.updateSettings(prisma, mine, a.id, {
      label: "Sales main",
      timezone: "America/New_York",
      limits: { connectionRequestsPerDay: 15, connectionRequestsPerWeek: 90, messagesPerDay: 30, profileVisitsPerDay: 60, randomizeDaily: true },
      workingHours: { days: [1, 2, 3], startHour: 10, endHour: 16 },
      warmup: false,
      removeProxy: false,
    });
    expect(r.ok).toBe(true);
    const row = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ label: "Sales main", timezone: "America/New_York", warmupUntil: null, proxyUrl: a.proxyUrl });
    expect(await lib.setPaused(prisma, mine, a.id, true)).toEqual({ ok: false, error: "Only a connected account can be paused." });
    await prisma.linkedinAccount.update({ where: { id: a.id }, data: { status: "ACTIVE" } });
    expect((await lib.setPaused(prisma, mine, a.id, true)).ok).toBe(true);
    expect((await lib.setPaused(prisma, mine, a.id, false)).ok).toBe(true);
    expect((await lib.removeAccount(prisma, mine, a.id)).ok).toBe(true);
    expect(await prisma.linkedinAccount.count({ where: { workspaceId: mine } })).toBe(0);
  });
});
