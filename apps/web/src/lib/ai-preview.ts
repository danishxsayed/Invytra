import { aiFromEnv, readProfileContext, unipileFromEnv, type AiLineWriter, type PrismaClient, type UnipileClient } from "@invytra/db";
import { aiLineMaxChars, parseProfileUrl, type AiSettings, type AiSignal } from "@invytra/shared";
import type { Result } from "./accounts";
import { chargeAi, outOfAiCredits, refundAi } from "./ai-credits";

export interface AiPreviewLine {
  leadId: string;
  line: string | null;
  signal: AiSignal | "fallback" | null;
  /** Why there's no line for this person (shown instead of it). */
  note?: string;
}

const PREVIEW_LEADS = 5;

/**
 * AI lines for the first few people of a list, for the launch preview: read through one of the
 * chosen senders connected through Unipile (their profiles are viewed without notifying them).
 */
export async function previewAiLines(
  prisma: PrismaClient,
  workspaceId: string,
  input: { listId: string; accountIds: string[]; ai: AiSettings; template: string; limit: number; write?: { kind: "note" | "message"; guide: string; maxChars: number } },
  deps: { unipile?: UnipileClient | null; ai?: AiLineWriter | null } = {},
): Promise<Result<AiPreviewLine[]>> {
  const unipile = deps.unipile === undefined ? unipileFromEnv() : deps.unipile;
  const writer = deps.ai === undefined ? aiFromEnv() : deps.ai;
  if (!writer) return { ok: false, error: "AI isn't set up on this server yet: add OPENAI_API_KEY to .env and restart." };
  if (!input.ai.offer.trim()) return { ok: false, error: "Describe what you offer in Configure → AI personalisation first." };
  const sender = await prisma.linkedinAccount.findFirst({
    where: { workspaceId, id: { in: input.accountIds.slice(0, 50) }, engine: "UNIPILE", status: "ACTIVE", unipileAccountId: { not: null } },
    select: { unipileAccountId: true },
  });
  if (!sender || !unipile) return { ok: false, error: "AI lines are written with accounts connected with Secure login: choose one as a sender." };
  const leads = await prisma.lead.findMany({
    where: { workspaceId, listId: input.listId },
    orderBy: { createdAt: "asc" },
    take: PREVIEW_LEADS,
    select: { id: true, profileUrl: true },
  });
  const max = aiLineMaxChars(input.template, input.limit);
  const out: AiPreviewLine[] = [];
  // Each sample uses 1 AI credit (given back when nothing comes out).
  for (const l of leads) {
    const slug = parseProfileUrl(l.profileUrl);
    if (!slug.ok) {
      out.push({ leadId: l.id, line: null, signal: null, note: "Not a LinkedIn profile link" });
      continue;
    }
    const charge = await chargeAi(prisma, workspaceId, "NOTE", "preview");
    if (!charge.ok) {
      if (!out.some((x) => x.line)) return { ok: false, error: outOfAiCredits(1) };
      out.push({ leadId: l.id, line: null, signal: null, note: "Out of AI credits" });
      continue;
    }
    try {
      const profile = await readProfileContext(unipile, sender.unipileAccountId!, slug.slug);
      if (input.write) {
        const text = await writer.writeMessage(profile, input.ai, input.write);
        if (text) out.push({ leadId: l.id, line: text, signal: null });
        else {
          await refundAi(prisma, workspaceId, charge.value);
          out.push({ leadId: l.id, line: null, signal: null, note: "AI couldn't write a good one for this person: your text would go out instead" });
        }
        continue;
      }
      const r = await writer.write(profile, input.ai, max);
      if (r.line) out.push({ leadId: l.id, line: r.line, signal: r.signal });
      else {
        await refundAi(prisma, workspaceId, charge.value);
        if (input.ai.fallback) out.push({ leadId: l.id, line: input.ai.fallback, signal: "fallback", note: "Nothing specific in their profile: your fallback line" });
        else out.push({ leadId: l.id, line: null, signal: null, note: "Nothing specific in their profile, and no fallback line: they'd be skipped" });
      }
    } catch (e) {
      await refundAi(prisma, workspaceId, charge.value);
      out.push({ leadId: l.id, line: null, signal: null, note: e instanceof Error ? e.message.split("\n")[0] : "Couldn't read their profile" });
    }
  }
  return { ok: true, value: out };
}
