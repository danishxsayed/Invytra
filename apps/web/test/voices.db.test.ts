/**
 * Voice copies against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient, VoiceError, type VoiceMaker } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../src/lib/campaigns";
import { addVoice, listVoices, removeVoice, tryVoice } from "../src/lib/voices";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("voices", () => {
  let prisma: PrismaClient;
  const A = "ws-voice-a";
  const B = "ws-voice-b";
  const cloned: string[] = [];
  const removed: string[] = [];
  let fail = false;
  const maker: VoiceMaker = {
    clone: async (name) => (cloned.push(name), `el-${name}`),
    speak: async () => {
      if (fail) throw new VoiceError("The voice service account is out of characters this month.");
      return Buffer.from("mp3");
    },
    remove: async (id) => void removed.push(id),
  };
  const sample = { data: Buffer.alloc(50_000, 1), name: "me.webm", type: "audio/webm" };
  const used = () => prisma.aiCreditUse.aggregate({ where: { workspaceId: A }, _sum: { credits: true } }).then((r) => r._sum.credits ?? 0);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A", plan: "pro" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.create({ data: { id: "acc-voice-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-voice-a", workspaceId: A, name: "L" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("makes a copy only with consent and a real recording, and only when the service is set up", async () => {
    expect(await addVoice(prisma, A, "u1", { name: "Tahur", consent: false, sample }, maker)).toMatchObject({ ok: false, error: expect.stringMatching(/own voice/) });
    expect(await addVoice(prisma, A, "u1", { name: "Tahur", consent: true, sample: { ...sample, data: Buffer.alloc(100) } }, maker)).toMatchObject({ ok: false, error: expect.stringMatching(/30 seconds/) });
    expect(await addVoice(prisma, A, "u1", { name: "Tahur", consent: true, sample }, null)).toMatchObject({ ok: false, error: expect.stringMatching(/aren't available/) });
    const r = await addVoice(prisma, A, "u1", { name: "Tahur", consent: true, sample }, maker);
    expect(r.ok).toBe(true);
    const row = await prisma.voiceClone.findFirstOrThrow({ where: { workspaceId: A } });
    expect(row).toMatchObject({ name: "Tahur", providerVoiceId: "el-Tahur", consentByUserId: "u1" });
    expect(cloned).toEqual(["Tahur"]);
  });

  it("plays a line for 1 credit (a whole note 10), and pays back when the service fails", async () => {
    const [v] = await listVoices(prisma, A);
    const before = await used();
    expect(await tryVoice(prisma, A, v!.id, "Hi Alex!", maker)).toMatchObject({ ok: true, value: { audio: expect.stringMatching(/^data:audio\/mpeg;base64,/) } });
    expect(await used()).toBe(before + 1);
    await tryVoice(prisma, A, v!.id, "word ".repeat(40), maker);
    expect(await used()).toBe(before + 11);
    fail = true;
    expect(await tryVoice(prisma, A, v!.id, "Hi", maker)).toMatchObject({ ok: false, error: expect.stringMatching(/out of characters/) });
    fail = false;
    expect(await used()).toBe(before + 11);
    // Another workspace can't use it.
    expect(await tryVoice(prisma, B, v!.id, "Hi", maker)).toMatchObject({ ok: false });
  });

  it("campaigns can only use their own workspace's voices; deleting removes it at the service too", async () => {
    const [v] = await listVoices(prisma, A);
    const steps = (voiceId: string) => [{ type: "MESSAGE" as const, delayDays: 0, text: "", voice: { voiceId, script: "Hey {firstName}!" } }];
    const input = (voiceId: string) => ({ name: "Voice", accountIds: ["acc-voice-a"], listId: "list-voice-a", steps: steps(voiceId), settings: {} });
    expect(await createCampaign(prisma, A, input("someone-elses-voice"))).toMatchObject({ ok: false, error: expect.stringMatching(/voice/) });
    expect((await createCampaign(prisma, A, input(v!.id))).ok).toBe(true);
    expect(await removeVoice(prisma, B, v!.id, maker)).toMatchObject({ ok: false });
    expect(await removeVoice(prisma, A, v!.id, maker)).toEqual({ ok: true, value: undefined });
    expect(removed).toEqual(["el-Tahur"]);
    expect(await listVoices(prisma, A)).toEqual([]);
  });
});
