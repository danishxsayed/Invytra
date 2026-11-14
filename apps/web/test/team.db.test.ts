/**
 * Team invites against a real database (only with TEST_DATABASE_URL — it is wiped): inviting,
 * resending, the link working once, cancelling, existing accounts, removing members.
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PlatformEmail } from "../src/lib/platform-mail";
import { acceptInvite, cancelInvite, inviteInfo, inviteMember, listInvites, removeMember } from "../src/lib/team";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const DAY = 86_400_000;

d("team invites", () => {
  let prisma: PrismaClient;
  const A = "ws-team-a";
  const B = "ws-team-b";
  const emails = ["owner-team-a@example.com", "owner-team-b@example.com", "new-mate@example.com", "second-mate@example.com"];
  const now = new Date("2026-11-14T10:00:00Z");
  const sent: PlatformEmail[] = [];
  const send = async (m: PlatformEmail) => void sent.push(m);
  const tokenOf = (m: PlatformEmail) => /token=([\w-]+)/.exec(m.text)![1]!;
  let ownerA = "";

  const clean = async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  };
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await clean();
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    const o = await prisma.user.create({ data: { email: emails[0]!, name: "Olivia Owner", passwordHash: "x", memberships: { create: { workspaceId: A, role: "OWNER" } } } });
    ownerA = o.id;
    await prisma.user.create({ data: { email: emails[1]!, name: "Bob", passwordHash: "x", memberships: { create: { workspaceId: B, role: "OWNER" } } } });
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("emails an invitation with a one-time link, and stores only its hash", async () => {
    const r = await inviteMember(prisma, A, { id: ownerA, name: "Olivia Owner" }, "  New-Mate@Example.com ", send, now);
    expect(r).toEqual({ ok: true, value: { resent: false } });
    expect(sent[0]).toMatchObject({ to: "new-mate@example.com", subject: "Olivia Owner invited you to Acme on Invytra" });
    const token = tokenOf(sent[0]!);
    const row = await prisma.workspaceInvite.findFirstOrThrow({ where: { workspaceId: A } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt).toEqual(new Date(now.getTime() + 7 * DAY));
    expect(await inviteInfo(prisma, token, now)).toEqual({ email: "new-mate@example.com", workspace: "Acme", inviter: "Olivia Owner" });
    expect(await listInvites(prisma, A, now)).toHaveLength(1);
    expect(await listInvites(prisma, B, now)).toHaveLength(0);
  });

  it("resending replaces the link (the old one stops working)", async () => {
    const old = tokenOf(sent[0]!);
    expect(await inviteMember(prisma, A, { id: ownerA, name: "Olivia Owner" }, "new-mate@example.com", send, now)).toEqual({ ok: true, value: { resent: true } });
    expect(await inviteInfo(prisma, old, now)).toBeNull();
    expect(await inviteInfo(prisma, tokenOf(sent[1]!), now)).not.toBeNull();
    expect(await listInvites(prisma, A, now)).toHaveLength(1);
  });

  it("refuses existing accounts, bad addresses, and keeps nothing when the email fails", async () => {
    expect(await inviteMember(prisma, A, { id: ownerA, name: "O" }, emails[1]!, send, now)).toMatchObject({ ok: false, error: expect.stringContaining("already has its own Invytra account") });
    expect(await inviteMember(prisma, A, { id: ownerA, name: "O" }, emails[0]!, send, now)).toMatchObject({ ok: false, error: "They're already in this workspace." });
    expect(await inviteMember(prisma, A, { id: ownerA, name: "O" }, "nope", send, now)).toMatchObject({ ok: false });
    expect(await inviteMember(prisma, A, { id: ownerA, name: "O" }, "x@example.com", null, now)).toMatchObject({ ok: false });
    const failing = async () => {
      throw new Error("smtp down");
    };
    expect(await inviteMember(prisma, A, { id: ownerA, name: "O" }, "second-mate@example.com", failing, now)).toMatchObject({ ok: false, error: expect.stringContaining("couldn't be sent") });
    expect(await prisma.workspaceInvite.count({ where: { email: "second-mate@example.com" } })).toBe(0);
  });

  it("the link creates the account in the workspace, once, and expires after 7 days", async () => {
    const token = tokenOf(sent[1]!);
    expect(await acceptInvite(prisma, { token, name: "", password: "long-enough-pass" }, now)).toMatchObject({ ok: false });
    expect(await acceptInvite(prisma, { token, name: "Nia", password: "long-enough-pass" }, new Date(now.getTime() + 8 * DAY))).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
    const r = await acceptInvite(prisma, { token, name: "Nia", password: "long-enough-pass" }, now);
    expect(r).toMatchObject({ ok: true, value: { workspaceId: A } });
    const m = await prisma.membership.findMany({ where: { workspaceId: A }, include: { user: true } });
    expect(m.find((x) => x.user.email === "new-mate@example.com")).toMatchObject({ role: "MEMBER", user: { name: "Nia" } });
    expect(await acceptInvite(prisma, { token, name: "Nia", password: "long-enough-pass" }, now)).toMatchObject({ ok: false });
    expect(await inviteInfo(prisma, token, now)).toBeNull();
    expect(await listInvites(prisma, A, now)).toHaveLength(0);
  });

  it("cancelled invitations stop working; other workspaces can't cancel them", async () => {
    await inviteMember(prisma, A, { id: ownerA, name: "O" }, "second-mate@example.com", send, now);
    const inv = await prisma.workspaceInvite.findFirstOrThrow({ where: { email: "second-mate@example.com" } });
    expect(await cancelInvite(prisma, B, inv.id, now)).toMatchObject({ ok: false });
    expect(await cancelInvite(prisma, A, inv.id, now)).toEqual({ ok: true, value: undefined });
    expect(await inviteInfo(prisma, tokenOf(sent.at(-1)!), now)).toBeNull();
  });

  it("removes a member (and their account), never the owner or yourself", async () => {
    const nia = await prisma.user.findUniqueOrThrow({ where: { email: "new-mate@example.com" } });
    expect(await removeMember(prisma, A, ownerA, ownerA)).toMatchObject({ ok: false });
    expect(await removeMember(prisma, A, nia.id, ownerA)).toMatchObject({ ok: false, error: expect.stringContaining("owner") });
    expect(await removeMember(prisma, B, ownerA, nia.id)).toMatchObject({ ok: false });
    expect(await removeMember(prisma, A, ownerA, nia.id)).toEqual({ ok: true, value: undefined });
    expect(await prisma.user.findUnique({ where: { email: "new-mate@example.com" } })).toBeNull();
  });
});
