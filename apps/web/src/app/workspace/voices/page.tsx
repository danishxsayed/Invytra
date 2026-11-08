import { prisma } from "@invytra/db";
import { VOICES_MAX } from "@invytra/shared";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";
import { CreditsChip } from "@/components/credits/CreditsChip";
import { AddVoice } from "@/components/voices/AddVoice";
import { VoiceList } from "@/components/voices/VoiceList";
import { getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { listVoices } from "@/lib/voices";

export const metadata = { title: "Your voice" };
export const dynamic = "force-dynamic";

/** Voice copies for voice notes: record or upload your voice once, then use it in message steps. */
export default async function VoicesPage() {
  const me = await requireUser();
  const [voices, ai] = await Promise.all([listVoices(prisma, me.workspace.id), getAiBalance(prisma, me.workspace.id)]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href={hubHref("/")} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All channels
          </a>
          <CreditsChip left={ai.left} href={hubHref("/credits")} className="ml-auto" />
          <span className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-[16px] font-semibold text-stone-900">Invytra</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Your voice</h1>
          <p className="mt-1 text-[15px] leading-relaxed text-stone-500">
            Record your voice once. Invytra then sends voice notes in your voice, with each person's name, from LinkedIn message steps. Each voice note uses 5 AI credits.
          </p>
        </div>
        <VoiceList voices={voices.map((v) => ({ id: v.id, name: v.name, added: timeAgo(v.createdAt) }))} />
        {voices.length < VOICES_MAX ? <AddVoice first={!voices.length} /> : <p className="text-[14px] text-stone-500">You have {VOICES_MAX} voices, the most you can keep. Delete one to add another.</p>}
      </main>
    </div>
  );
}
