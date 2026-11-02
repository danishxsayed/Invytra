/** Forgot password (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/lib/password";
import { requestPasswordReset, resetPassword, resetTokenValid, setPasswordByEmail } from "../src/lib/password-reset";
import type { PlatformEmail } from "../src/lib/platform-mail";
import { routeRequest } from "../src/lib/routing";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("reset pages", () => {
  it("are sign-in pages, open without a session", () => {
    expect(routeRequest({ host: "localhost:3000", pathname: "/reset-password", search: "?token=x", hasSession: false }, { root: null, protocol: "http:" })).toEqual({ type: "next" });
    expect(routeRequest({ host: "app.invytra.com", pathname: "/forgot-password", search: "", hasSession: false }, { root: "invytra.com", protocol: "https:" })).toEqual({ type: "next" });
  });
});

d("forgot password", () => {
  let prisma: PrismaClient;
  const EMAIL = "reset-me@example.com";
  const sent: PlatformEmail[] = [];
  const send = async (m: PlatformEmail) => void sent.push(m);
  const now = new Date("2026-11-02T06:00:00Z");
  const tokenOf = (m: PlatformEmail) => /token=([\w-]+)/.exec(m.text)![1]!;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.user.create({ data: { email: EMAIL, name: "Reset Me", passwordHash: "x" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it("emails a one-use link only to real accounts, at most 3 an hour", async () => {
    await requestPasswordReset(prisma, "nobody@example.com", send, now);
    expect(sent).toHaveLength(0);
    await requestPasswordReset(prisma, " Reset-Me@Example.com ", send, now);
    expect(sent[0]).toMatchObject({ to: EMAIL, subject: "Reset your Invytra password" });
    expect(sent[0]!.text).toContain("Hi Reset,");
    // Only a hash is stored.
    const token = tokenOf(sent[0]!);
    expect(await prisma.passwordReset.findFirst({ where: { tokenHash: token } })).toBeNull();
    await requestPasswordReset(prisma, EMAIL, send, now);
    await requestPasswordReset(prisma, EMAIL, send, now);
    await requestPasswordReset(prisma, EMAIL, send, now);
    expect(sent).toHaveLength(3);
  });

  it("sets the new password once, signs out everywhere, and kills other links", async () => {
    const [a, b] = [tokenOf(sent[0]!), tokenOf(sent[1]!)];
    expect(await resetTokenValid(prisma, a, now)).toBe(true);
    expect(await resetTokenValid(prisma, a, new Date(now.getTime() + 61 * 60_000))).toBe(false);
    expect(await resetPassword(prisma, "made-up", "new-password-123", now)).toMatchObject({ ok: false });
    expect(await resetPassword(prisma, a, "new-password-123", now)).toMatchObject({ ok: true });
    const u = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(await verifyPassword("new-password-123", u.passwordHash)).toBe(true);
    expect(u.sessionsValidAfter).toEqual(now);
    expect(await resetPassword(prisma, a, "again-password-1", now)).toMatchObject({ ok: false });
    expect(await resetTokenValid(prisma, b, now)).toBe(false);
  });

  it("sets a password from the command line", async () => {
    expect(await setPasswordByEmail(prisma, EMAIL, "short")).toMatchObject({ ok: false });
    expect(await setPasswordByEmail(prisma, "nobody@x.co", "long-enough-1")).toMatchObject({ ok: false });
    expect(await setPasswordByEmail(prisma, EMAIL, "cli-password-123")).toMatchObject({ ok: true });
    expect(await verifyPassword("cli-password-123", (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).passwordHash)).toBe(true);
  });
});
