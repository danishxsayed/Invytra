/** Email contacts, lists, variables, suppression (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addSuppressions,
  createVariable,
  deleteList,
  importContacts,
  listContacts,
  listLists,
  listSuppressions,
  removeSuppression,
  setSubscribed,
  variableFallbacks,
} from "../src/lib/email-contacts";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("email contacts", () => {
  let prisma: PrismaClient;
  const WS = "ws-ctc";
  const OTHER = "ws-ctc-2";
  const csv = "Email,First Name,Company Name,City\npriya@acme.io,Priya,Acme,Pune\nsam@beta.com,Sam,,\nbad-row,,,\npriya@acme.io,Dup,,";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "C" }, { id: OTHER, name: "O" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.$disconnect();
  });

  it("imports a CSV into a new list with its mapping, and makes variables of custom columns", async () => {
    const r = await importContacts(prisma, WS, { text: csv, mapping: ["email", "first_name", "company_name", "custom:city"], list: { name: "Nov leads" } });
    expect(r).toMatchObject({ ok: true, value: { listName: "Nov leads", added: 2, updated: 0, invalidCount: 1, duplicates: 1, variables: ["city"] } });
    expect(await prisma.emailVariable.findMany({ where: { workspaceId: WS }, select: { key: true } })).toEqual([{ key: "city" }]);
    const { rows } = await listContacts(prisma, WS);
    expect(rows.find((c) => c.email === "priya@acme.io")).toMatchObject({ firstName: "Priya", company: "Acme", vars: { city: "Pune" }, listNames: ["Nov leads"], verification: "NOT_CHECKED" });
    expect((await listContacts(prisma, OTHER)).total).toBe(0);
  });

  it("updates known contacts without erasing, into another list too", async () => {
    const lists = await listLists(prisma, WS);
    const r = await importContacts(prisma, WS, { text: "email,title,city\npriya@acme.io,CTO,\nnew@x.co,,", mapping: ["email", "job_title", "custom:city"], list: { name: "Second" } });
    expect(r).toMatchObject({ ok: true, value: { added: 1, updated: 1 } });
    const priya = (await listContacts(prisma, WS, { q: "priya" })).rows[0]!;
    expect(priya).toMatchObject({ title: "CTO", firstName: "Priya", company: "Acme", vars: { city: "Pune" } });
    expect(priya.listNames.sort()).toEqual(["Nov leads", "Second"]);
    expect((await listContacts(prisma, WS, { listId: lists[0]!.id })).total).toBe(2);
    expect(await importContacts(prisma, OTHER, { text: csv, mapping: ["email", "skip", "skip", "skip"], list: { id: lists[0]!.id } })).toEqual({ ok: false, error: "List not found." });
    expect(await importContacts(prisma, WS, { text: csv, mapping: ["skip", "skip", "skip", "skip"], list: { name: "x" } })).toEqual({ ok: false, error: "Choose which column holds the email address." });
  });

  it("unsubscribes (suppressed), subscribes again, and filters", async () => {
    const sam = (await listContacts(prisma, WS, { q: "sam" })).rows[0]!;
    await setSubscribed(prisma, WS, sam.id, false);
    expect((await listContacts(prisma, WS, { filter: "unsubscribed" })).rows.map((c) => c.email)).toEqual(["sam@beta.com"]);
    expect((await listSuppressions(prisma, WS)).map((s) => [s.email, s.reason])).toEqual([["sam@beta.com", "UNSUBSCRIBED"]]);
    expect(await setSubscribed(prisma, OTHER, sam.id, true)).toMatchObject({ ok: false });
    await setSubscribed(prisma, WS, sam.id, true);
    expect(await listSuppressions(prisma, WS)).toEqual([]);
  });

  it("keeps a suppression list of addresses and domains; hard bounces stay", async () => {
    expect(await addSuppressions(prisma, WS, "ceo@rival.com, @rival.com nonsense")).toEqual({ ok: true, value: { added: 2, invalid: 1 } });
    await prisma.emailSuppression.create({ data: { workspaceId: WS, email: "gone@x.co", reason: "HARD_BOUNCE" } });
    const hard = (await listSuppressions(prisma, WS)).find((s) => s.reason === "HARD_BOUNCE")!;
    expect(await removeSuppression(prisma, WS, hard.id)).toMatchObject({ ok: false });
    const manual = (await listSuppressions(prisma, WS)).find((s) => s.email === "@rival.com")!;
    expect(await removeSuppression(prisma, OTHER, manual.id)).toMatchObject({ ok: false });
    expect(await removeSuppression(prisma, WS, manual.id)).toMatchObject({ ok: true });
  });

  it("creates variables by hand with a default", async () => {
    expect(await createVariable(prisma, WS, { label: "Pain Point", fallback: "growth" })).toEqual({ ok: true, value: { key: "pain_point" } });
    expect(await createVariable(prisma, WS, { label: "First Name", fallback: "" })).toMatchObject({ ok: false });
    expect(await createVariable(prisma, WS, { label: "pain point", fallback: "" })).toEqual({ ok: false, error: "{{pain_point}} exists already." });
    expect(await variableFallbacks(prisma, WS)).toEqual({ pain_point: "growth" });
  });

  it("deletes a list but keeps its contacts", async () => {
    const [l] = await listLists(prisma, WS);
    expect(await deleteList(prisma, OTHER, l!.id)).toMatchObject({ ok: false });
    await deleteList(prisma, WS, l!.id);
    expect((await listContacts(prisma, WS)).total).toBe(3);
  });
});

import { requestVerification, verificationProgress } from "../src/lib/email-contacts";

d("asking for verification", () => {
  let prisma: PrismaClient;
  const WS = "ws-ctc-v";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "V" } });
    await prisma.emailContact.createMany({
      data: [
        { workspaceId: WS, email: "new@x.co" },
        { workspaceId: WS, email: "unknown@x.co", verification: "UNKNOWN" },
        { workspaceId: WS, email: "valid@x.co", verification: "VALID" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("queues unverified and unknown contacts only, once", async () => {
    expect(await requestVerification(prisma, WS)).toEqual({ ok: true, value: 2 });
    expect(await requestVerification(prisma, WS)).toEqual({ ok: true, value: 0 });
    expect(await verificationProgress(prisma, WS)).toEqual({ pending: 2, problem: null });
    await prisma.emailContact.updateMany({ where: { workspaceId: WS, email: "new@x.co" }, data: { verifyDetail: "Waiting: Insufficient credits" } });
    expect(await verificationProgress(prisma, WS)).toEqual({ pending: 2, problem: "Insufficient credits" });
  });
});
