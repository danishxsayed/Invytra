/** Settings against a real database (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { changePassword, renameWorkspace, signOutEverywhere, teamMembers, updateProfile } from "../src/lib/settings";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("settings", () => {
  let prisma: PrismaClient;
  const W = "ws-settings";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.user.deleteMany({ where: { email: { in: ["owner@s.test", "new@s.test", "member@s.test", "taken@s.test"] } } });
    await prisma.workspace.deleteMany({ where: { id: W } });
    await prisma.workspace.create({ data: { id: W, name: "Old name" } });
    const hash = await hashPassword("old-password-123");
    await prisma.user.createMany({
      data: [
        { id: "u-owner", email: "owner@s.test", name: "Owner", passwordHash: hash },
        { id: "u-member", email: "member@s.test", name: "Member", passwordHash: hash },
        { id: "u-taken", email: "taken@s.test", name: "Taken", passwordHash: hash },
      ],
    });
    await prisma.membership.createMany({ data: [{ userId: "u-owner", workspaceId: W, role: "OWNER" }, { userId: "u-member", workspaceId: W, role: "MEMBER" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: W } });
    await prisma.user.deleteMany({ where: { id: { in: ["u-owner", "u-member", "u-taken"] } } });
    await prisma.$disconnect();
  });

  it("updates the name freely, but an email change needs the password and a free address", async () => {
    expect(await updateProfile(prisma, "u-owner", { name: "Tahur", email: "owner@s.test", currentPassword: "" })).toMatchObject({ ok: true });
    expect(await updateProfile(prisma, "u-owner", { name: "Tahur", email: "new@s.test", currentPassword: "wrong" })).toMatchObject({ ok: false });
    expect(await updateProfile(prisma, "u-owner", { name: "Tahur", email: "taken@s.test", currentPassword: "old-password-123" })).toMatchObject({ ok: false });
    expect(await updateProfile(prisma, "u-owner", { name: "Tahur", email: "new@s.test", currentPassword: "old-password-123" })).toMatchObject({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: "u-owner" } })).toMatchObject({ name: "Tahur", email: "new@s.test" });
  });

  it("changes the password only with the current one, and cuts off older sessions", async () => {
    expect(await changePassword(prisma, "u-owner", { currentPassword: "nope", newPassword: "brand-new-pass-1", confirm: "brand-new-pass-1" })).toMatchObject({ ok: false });
    const before = Date.now();
    expect(await changePassword(prisma, "u-owner", { currentPassword: "old-password-123", newPassword: "brand-new-pass-1", confirm: "brand-new-pass-1" })).toMatchObject({ ok: true });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: "u-owner" } });
    expect(await verifyPassword("brand-new-pass-1", u.passwordHash)).toBe(true);
    expect(u.sessionsValidAfter!.getTime()).toBeGreaterThan(before - 1000);
    expect(u.sessionsValidAfter!.getTime() % 1000).toBe(0);
  });

  it("signs out everywhere", async () => {
    await signOutEverywhere(prisma, "u-member");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "u-member" } })).sessionsValidAfter).not.toBeNull();
  });

  it("lets only the owner rename the workspace, and lists the team", async () => {
    expect(await renameWorkspace(prisma, W, "MEMBER", { name: "Hijack" })).toMatchObject({ ok: false });
    expect(await renameWorkspace(prisma, W, "OWNER", { name: "Crawlers" })).toMatchObject({ ok: true });
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: W } })).name).toBe("Crawlers");
    expect((await teamMembers(prisma, W)).map((m) => [m.user.name, m.role])).toEqual([
      ["Tahur", "OWNER"],
      ["Member", "MEMBER"],
    ]);
  });
});
