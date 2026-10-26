/** One LinkedIn profile can only be connected once per workspace (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sameProfileElsewhere } from "../../src/connect/same-profile.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const BASE = "http://127.0.0.1:7799";

d("same LinkedIn profile on two accounts", () => {
  let prisma: PrismaClient;
  const WS = "ws-sp";
  const OTHER_WS = "ws-sp2";
  const acc = (id: string, workspaceId: string, label: string, profileName: string | null, profileUrl: string | null) =>
    prisma.linkedinAccount.create({ data: { id, workspaceId, label, proxyUrl: "", workingHours: {}, limits: {}, profileName, profileUrl } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER_WS] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "SP" }, { id: OTHER_WS, name: "SP2" }] });
    await acc("sp-main", WS, "test-1", "Mohammed Tahur Sayed", "https://www.linkedin.com/in/Tahur-Sayed/");
    await acc("sp-new", WS, "Tahur", null, null);
    await acc("sp-noname", WS, "Spare", "Jane Doe", null);
    await acc("sp-elsewhere", OTHER_WS, "theirs", "Bob Lee", "https://www.linkedin.com/in/bob-lee/");
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER_WS] } } });
    await prisma.$disconnect();
  });

  const check = (profile: { name: string | null; url: string | null }) => sameProfileElsewhere(prisma, { id: "sp-new", workspaceId: WS }, profile, BASE);

  it("matches by profile link, on either host and in any case", async () => {
    expect(await check({ name: "M T Sayed", url: `${BASE}/in/tahur-sayed/` })).toBe("test-1");
  });
  it("falls back to the name when a link is missing", async () => {
    expect(await check({ name: "jane doe", url: `${BASE}/in/jane-d/` })).toBe("Spare");
  });
  it("allows a different profile, and ignores other workspaces", async () => {
    expect(await check({ name: "Someone Else", url: `${BASE}/in/someone/` })).toBeNull();
    expect(await check({ name: "Bob Lee", url: `${BASE}/in/bob-lee/` })).toBeNull();
  });
  it("never matches the account against itself", async () => {
    expect(await sameProfileElsewhere(prisma, { id: "sp-main", workspaceId: WS }, { name: "Mohammed Tahur Sayed", url: `${BASE}/in/tahur-sayed/` }, BASE)).toBeNull();
  });
});
