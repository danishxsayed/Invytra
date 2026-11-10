-- Migrations that were renamed after some databases had applied them (run before
-- `migrate deploy`; does nothing on a new database or one already fixed).
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    -- 2026-11: the video migration was named with a date before the voice migration it needs.
    UPDATE "_prisma_migrations" SET migration_name = '20261201000000_video_recordings'
      WHERE migration_name = '20261108155605_video_recordings';
  END IF;
END $$;
