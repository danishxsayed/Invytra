import { VoiceError, voiceFromEnv, type PrismaClient, type VoiceMaker } from "@invytra/db";
import { VOICES_MAX, VOICE_SAMPLE, VOICE_SCRIPT_MAX, VOICE_TRY_MAX } from "@invytra/shared";
import type { Result } from "./accounts";
import { chargeAi, refundAi } from "./ai-credits";

/*
 * Voice copies for voice notes. The recording goes straight to the voice service and isn't
 * kept here; only the copy's id is. A copy is made only after the user confirms it's their own
 * voice and they agree (saved with who and when).
 */

const NOT_READY = "Voice notes aren't available yet. Please try again later.";
const reason = (e: unknown) => (e instanceof VoiceError ? e.message : "The voice service didn't answer. Please try again in a minute.");

export const listVoices = (prisma: PrismaClient, workspaceId: string) =>
  prisma.voiceClone.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, createdAt: true } });

export async function addVoice(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  input: { name: string; consent: boolean; sample: { data: Buffer; name: string; type: string } },
  maker: VoiceMaker | null = voiceFromEnv(),
): Promise<Result<{ id: string }>> {
  if (!input.consent) return { ok: false, error: "Please confirm this is your own voice and that you agree to the copy." };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the voice a name (e.g. your name)." };
  if (!/^(audio|video)\//.test(input.sample.type) || input.sample.data.length < 20_000) return { ok: false, error: "Record or upload at least 30 seconds of your voice." };
  if (input.sample.data.length > VOICE_SAMPLE.maxBytes) return { ok: false, error: "That recording is too large (10 MB at most). A 1–2 minute recording is plenty." };
  if ((await prisma.voiceClone.count({ where: { workspaceId } })) >= VOICES_MAX) return { ok: false, error: `You can keep up to ${VOICES_MAX} voices. Delete one first.` };
  if (!maker) return { ok: false, error: NOT_READY };
  try {
    const providerVoiceId = await maker.clone(name, input.sample);
    const v = await prisma.voiceClone.create({ data: { workspaceId, name, providerVoiceId, consentAt: new Date(), consentByUserId: userId } });
    return { ok: true, value: { id: v.id } };
  } catch (e) {
    return { ok: false, error: reason(e) };
  }
}

/** Deletes the copy at the voice service too. Steps using it then send without the voice note. */
export async function removeVoice(prisma: PrismaClient, workspaceId: string, id: string, maker: VoiceMaker | null = voiceFromEnv()): Promise<Result> {
  const v = await prisma.voiceClone.findFirst({ where: { id, workspaceId } });
  if (!v) return { ok: false, error: "That voice is already gone." };
  try {
    await maker?.remove(v.providerVoiceId);
  } catch (e) {
    return { ok: false, error: reason(e) };
  }
  await prisma.voiceClone.delete({ where: { id: v.id } });
  return { ok: true, value: undefined };
}

/** Text read in the voice, to hear how it sounds: a short line 1 AI credit, a whole voice note 10. mp3 as a data URL. */
export async function tryVoice(prisma: PrismaClient, workspaceId: string, id: string, text: string, maker: VoiceMaker | null = voiceFromEnv()): Promise<Result<{ audio: string }>> {
  const line = text.trim().slice(0, VOICE_SCRIPT_MAX);
  if (!line) return { ok: false, error: "Type a line to hear." };
  const v = await prisma.voiceClone.findFirst({ where: { id, workspaceId } });
  if (!v) return { ok: false, error: "Pick one of your voices." };
  if (!maker) return { ok: false, error: NOT_READY };
  const paid = await chargeAi(prisma, workspaceId, line.length > VOICE_TRY_MAX ? "VOICE" : "TEXT", "voice-try");
  if (!paid.ok) return paid;
  try {
    const mp3 = await maker.speak(v.providerVoiceId, line);
    return { ok: true, value: { audio: `data:audio/mpeg;base64,${mp3.toString("base64")}` } };
  } catch (e) {
    await refundAi(prisma, workspaceId, paid.value);
    return { ok: false, error: reason(e) };
  }
}
