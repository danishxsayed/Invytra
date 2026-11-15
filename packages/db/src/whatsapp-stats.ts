import type { PrismaClient } from "@prisma/client";

export interface WaCampaignStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  skipped: number;
}

/** Each campaign's results (sent, delivered, read, replied …), counted from its messages. */
export async function waCampaignStats(prisma: PrismaClient, ids: string[]): Promise<Map<string, WaCampaignStats>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<{ campaign_id: string; total: bigint; queued: bigint; sent: bigint; delivered: bigint; read: bigint; replied: bigint; failed: bigint; skipped: bigint }[]>`
    SELECT campaign_id, count(*) AS total,
      count(*) FILTER (WHERE status = 'QUEUED') AS queued,
      count(*) FILTER (WHERE status IN ('SENT','DELIVERED','READ') OR (status = 'FAILED' AND sent_at IS NOT NULL)) AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL OR read_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE read_at IS NOT NULL) AS read,
      count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
      count(*) FILTER (WHERE status = 'FAILED') AS failed,
      count(*) FILTER (WHERE status = 'SKIPPED') AS skipped
    FROM whatsapp_messages WHERE campaign_id = ANY(${ids}) GROUP BY campaign_id`;
  return new Map(rows.map((r) => [r.campaign_id, { total: Number(r.total), queued: Number(r.queued), sent: Number(r.sent), delivered: Number(r.delivered), read: Number(r.read), replied: Number(r.replied), failed: Number(r.failed), skipped: Number(r.skipped) }]));
}
