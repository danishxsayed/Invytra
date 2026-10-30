/** Connecting accounts through Unipile (only with TEST_DATABASE_URL). */
import { PrismaClient, UnipileClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, linkedinEmailProblem, setLinkedinEmail } from "../src/lib/accounts";
import { isLocalOrigin, syncUnipileAccount, unipileConnectLink } from "../src/lib/unipile";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

/** Unipile's accounts list, /users/me and the hosted-link call, faked. */
function fakeUnipile(accounts: { id: string; name: string; status: string; slug: string; at?: string; member?: string }[]) {
  const seen: { path: string; body?: unknown }[] = [];
  const deleted: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ path: `${init?.method ?? "GET"} ${u.pathname}`, body });
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
    if (u.pathname === "/api/v1/hosted/accounts/link") return json(201, { url: "https://account.unipile.com/abc" });
    if (u.pathname === "/api/v1/accounts") {
      return json(200, { items: accounts.map((a) => ({ id: a.id, name: a.name, type: "LINKEDIN", created_at: a.at ?? new Date().toISOString(), connection_params: { im: { id: a.member ?? a.slug, publicIdentifier: a.slug } }, sources: [{ id: "s", status: a.status }] })), cursor: null });
    }
    const one = /^\/api\/v1\/accounts\/(.+)$/.exec(u.pathname);
    if (one && init?.method === "DELETE") {
      deleted.push(one[1]!);
      return json(200, {});
    }
    if (one) return accounts.some((a) => a.id === one[1]) ? json(200, { id: one[1], type: "LINKEDIN" }) : json(404, { type: "errors/resource_not_found" });
    if (u.pathname === "/api/v1/users/me") {
      const a = accounts.find((x) => x.id === u.searchParams.get("account_id"))!;
      return json(200, { first_name: "Orian", last_name: "Honey", public_identifier: a.slug, premium: false, profile_picture_url: null });
    }
    return json(404, { type: "errors/not_found" });
  }) as typeof fetch;
  return { client: new UnipileClient("api.test:1", "k", fetchImpl), seen, deleted };
}

d("Unipile connect", () => {
  let prisma: PrismaClient;
  const WS = "ws-unic";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, "ws-unic-2"] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "U" }, { id: "ws-unic-2", name: "Another user" }] });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "u-1", workspaceId: WS, label: "one", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
        { id: "u-2", workspaceId: WS, label: "two", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED", profileUrl: "https://www.linkedin.com/in/taken-person/" },
        { id: "u-3", workspaceId: WS, label: "three", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, "ws-unic-2"] } } });
    await prisma.$disconnect();
  });

  it("asks Unipile for a login link that comes back to the account", async () => {
    process.env.WEB_ORIGIN = "https://app.example.com";
    const f = fakeUnipile([]);
    const r = await unipileConnectLink(prisma, WS, "u-1", f.client);
    expect(r).toEqual({ ok: true, value: "https://account.unipile.com/abc" });
    const call = f.seen.find((c) => c.path.endsWith("/hosted/accounts/link"))!.body as Record<string, unknown>;
    expect(call).toMatchObject({
      type: "create",
      providers: ["LINKEDIN"],
      name: "invytra:u-1",
      success_redirect_url: "https://app.example.com/app/accounts/u-1/unipile-return",
    });
    await expect(unipileConnectLink(prisma, "other-ws", "u-1", f.client)).rejects.toThrow();
  });

  it("on this computer, leaves the return to the dashboard (browsers block a public page sending it to localhost)", async () => {
    process.env.WEB_ORIGIN = "http://localhost:3000";
    const f = fakeUnipile([]);
    await unipileConnectLink(prisma, WS, "u-1", f.client);
    const call = f.seen.find((c) => c.path.endsWith("/hosted/accounts/link"))!.body as Record<string, unknown>;
    expect(call.success_redirect_url).toBeUndefined();
    expect(call.name).toBe("invytra:u-1");
    expect([isLocalOrigin("http://192.168.1.5:3000"), isLocalOrigin("http://127.0.0.1:3000"), isLocalOrigin("https://app.invytra.com")]).toEqual([true, true, false]);
    process.env.WEB_ORIGIN = "https://app.example.com";
  });

  it("marks the account connected with whose LinkedIn it is", async () => {
    const f = fakeUnipile([{ id: "UNI-A", name: "invytra:u-1", status: "OK", slug: "orian-honey" }]);
    const r = await syncUnipileAccount(prisma, WS, "u-1", f.client, { tries: 1 });
    expect(r).toEqual({ ok: true, name: "Orian Honey" });
    const a = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: "u-1" } });
    expect(a).toMatchObject({ engine: "UNIPILE", unipileAccountId: "UNI-A", status: "ACTIVE", profileUrl: "https://www.linkedin.com/in/orian-honey/", premium: false });
    expect(a.sessionUpdatedAt).not.toBeNull();
  });

  it("reconnects in place once the account is known", async () => {
    const f = fakeUnipile([{ id: "UNI-A", name: "invytra:u-1", status: "OK", slug: "orian-honey" }]);
    await unipileConnectLink(prisma, WS, "u-1", f.client);
    expect(f.seen.find((c) => c.path.endsWith("/hosted/accounts/link"))!.body).toMatchObject({ type: "reconnect", reconnect_account: "UNI-A" });
  });

  it("refuses a LinkedIn profile already connected as another account, and removes it at Unipile", async () => {
    const f = fakeUnipile([{ id: "UNI-B", name: "invytra:u-3", status: "OK", slug: "taken-person" }]);
    const r = await syncUnipileAccount(prisma, WS, "u-3", f.client, { tries: 1 });
    expect(r).toEqual({ ok: false, code: "duplicate" });
    expect(f.deleted).toEqual(["UNI-B"]);
    expect((await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: "u-3" } })).status).toBe("DISCONNECTED");
  });

  it("recognises the new login by when it appeared (Unipile doesn't keep our name), and removes repeats", async () => {
    await prisma.linkedinAccount.create({ data: { id: "u-4", workspaceId: WS, label: "four", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED", unipileLinkAt: new Date() } });
    const old = new Date(Date.now() - 3600_000).toISOString();
    const f = fakeUnipile([
      { id: "OLD", name: "Someone Else", status: "OK", slug: "someone-else", at: old }, // before this login
      { id: "UNI-A", name: "Orian Honey", status: "OK", slug: "orian-honey" }, // already u-1's
      { id: "TRY-1", name: "Spare Person", status: "OK", slug: "spare-person", at: new Date(Date.now() - 5000).toISOString() },
      { id: "TRY-2", name: "Spare Person", status: "OK", slug: "spare-person" },
    ]);
    const r = await syncUnipileAccount(prisma, WS, "u-4", f.client, { tries: 1 });
    expect(r).toEqual({ ok: true, name: "Orian Honey" }); // the fake's /me always says Orian Honey
    const a = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: "u-4" } });
    expect(a.unipileAccountId).toBe("TRY-2");
    expect(a.unipileLinkAt).toBeNull();
    expect(f.deleted).toEqual(["TRY-1"]);
  });

  it("reports a login that didn't finish or is still being checked", async () => {
    expect(await syncUnipileAccount(prisma, WS, "u-3", fakeUnipile([]).client, { tries: 1 })).toEqual({ ok: false, code: "unfinished" });
    const checking = fakeUnipile([{ id: "UNI-C", name: "invytra:u-3", status: "CONNECTING", slug: "x" }]);
    expect(await syncUnipileAccount(prisma, WS, "u-3", checking.client, { tries: 2, delayMs: 1 })).toEqual({ ok: false, code: "checking" });
  });

  it("one LinkedIn login email is on Invytra once (named only inside your own workspace)", async () => {
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    const allow = process.env.ALLOW_NO_PROXY;
    process.env.ALLOW_NO_PROXY = "true";
    const theirs = await createAccount(prisma, "ws-unic-2", { label: "theirs", timezone: "UTC", proxyUrl: "", warmup: false, email: "jane@acme.com" });
    expect(theirs.ok).toBe(true);
    expect(await linkedinEmailProblem(prisma, WS, " JANE@acme.com ")).toMatch(/already on Invytra under a different user/);
    expect(await createAccount(prisma, WS, { label: "mine", timezone: "UTC", proxyUrl: "", warmup: false, email: "jane@acme.com" })).toMatchObject({ ok: false });
    expect(await setLinkedinEmail(prisma, WS, "u-3", "u3@acme.com")).toEqual({ ok: true, value: undefined });
    expect(await linkedinEmailProblem(prisma, WS, "u3@acme.com")).toBe("This LinkedIn account is already added here as “three”.");
    expect(await setLinkedinEmail(prisma, WS, "u-3", "u3@acme.com")).toEqual({ ok: true, value: undefined }); // its own email is fine
    process.env.ALLOW_NO_PROXY = allow;
  });

  it("refuses a LinkedIn profile another user already connected, and removes this login at Unipile", async () => {
    await prisma.linkedinAccount.create({
      data: { id: "u-x", workspaceId: "ws-unic-2", label: "x", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE", profileUrl: "https://www.linkedin.com/in/someone-elses/" },
    });
    await prisma.linkedinAccount.create({ data: { id: "u-5", workspaceId: WS, label: "five", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED", unipileLinkAt: new Date() } });
    const f = fakeUnipile([{ id: "UNI-E", name: "Someone", status: "OK", slug: "someone-elses" }]);
    // The fake /me answers with the account's slug.
    const r = await syncUnipileAccount(prisma, WS, "u-5", f.client, { tries: 1 });
    expect(r).toEqual({ ok: false, code: "elsewhere" });
    expect(f.deleted).toEqual(["UNI-E"]);
  });
});
