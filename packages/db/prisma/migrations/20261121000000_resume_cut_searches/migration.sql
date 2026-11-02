-- Searches read through Secure login stopped after their first page when LinkedIn left the
-- result total empty (null was read as "no more pages"). Resume the ones that ended that way:
-- their last page was (nearly) full and they hadn't reached their limit.
UPDATE "lead_imports" i
SET "status" = 'RUNNING', "reason" = NULL, "finished_at" = NULL, "action_id" = NULL
FROM "linkedin_accounts" a
WHERE a."id" = i."account_id"
  AND a."engine" = 'UNIPILE'
  AND i."status" = 'DONE'
  AND i."reason" = 'END'
  AND i."found" < i."max_leads"
  AND i."pages" >= 1
  AND i."found" >= i."pages" * (CASE WHEN i."kind" = 'LINKEDIN_SEARCH' THEN 8 ELSE 20 END)
  AND i."finished_at" > NOW() - INTERVAL '30 days';
