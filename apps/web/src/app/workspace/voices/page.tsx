import { prisma } from "@invytra/db";
import { VOICES_MAX } from "@invytra/shared";
import { AddVoice } from "@/components/voices/AddVoice";
import { VoiceList } from "@/components/voices/VoiceList";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { listVoices } from "@/lib/voices";

export const metadata = { title: "Your voice" };
export const dynamic = "force-dynamic";

/** Voice copies for voice notes: record or upload your voice once, then use it in message steps. */
export default async function VoicesPage() {
  const me = await requireUser();
  const voices = await listVoices(prisma, me.workspace.id);
  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Your voice</h1>
          <p className="mt-1 text-[15px] leading-relaxed text-stone-500">
            Record your voice once. Invytra then sends voice notes in your voice, with each person's name, from LinkedIn message steps. Each voice note uses 5 AI credits.
          </p>
        </div>
        <VoiceList voices={voices.map((v) => ({ id: v.id, name: v.name, added: timeAgo(v.createdAt) }))} />
        {voices.length < VOICES_MAX ? <AddVoice first={!voices.length} /> : <p className="text-[14px] text-stone-500">You have {VOICES_MAX} voices, the most you can keep. Delete one to add another.</p>}
    </div>
  );
}
