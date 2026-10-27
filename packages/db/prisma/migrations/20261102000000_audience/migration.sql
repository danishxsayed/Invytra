-- Connection degree and Premium badge, for a campaign's audience settings (connection levels, Premium only).
ALTER TABLE "leads" ADD COLUMN "degree" INTEGER, ADD COLUMN "premium" BOOLEAN;
ALTER TABLE "campaign_leads" ADD COLUMN "degree" INTEGER, ADD COLUMN "premium" BOOLEAN;
