/** Connecting accounts through Unipile (only with TEST_DATABASE_URL). */
import { PrismaClient, UnipileClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncUnipileAccount, unipileConnectLink } from "../src/lib/unipile";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

/** Unipile's accounts list, /users/me and the hosted-link call, faked. */
function fakeUnipile(accounts: { id: string; name: string; status: string; slug: string }[]) {
  const seen: { path: string; body?: unknown }[] = [];
  const deleted: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ path: `${init?.method ?? "GET"} ${u.pathname}`, body });
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
    if (u.pathname === "/api/v1/hosted/accounts/link") return json(201, { url: "https://account.unipile.com/abc" });
    if (u.pathname === "/api/v1/accounts") {
      return json(200, { items: accounts.map((a) => ({ id: a.id, name: a.name, type: "LINKEDIN", sources: [{ id: "s", status: a.status }] })), cursor: null });
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
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "U" } });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "u-1", workspaceId: WS, label: "one", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
        { id: "u-2", workspaceId: WS, label: "two", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED", profileUrl: "https://www.linkedin.com/in/taken-person/" },
        { id: "u-3", workspaceId: WS, label: "three", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
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

  it("reports a login that didn't finish or is still being checked", async () => {
    expect(await syncUnipileAccount(prisma, WS, "u-3", fakeUnipile([]).client, { tries: 1 })).toEqual({ ok: false, code: "unfinished" });
    const checking = fakeUnipile([{ id: "UNI-C", name: "invytra:u-3", status: "CONNECTING", slug: "x" }]);
    expect(await syncUnipileAccount(prisma, WS, "u-3", checking.client, { tries: 2, delayMs: 1 })).toEqual({ ok: false, code: "checking" });
  });
});
