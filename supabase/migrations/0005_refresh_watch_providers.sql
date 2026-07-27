-- Keeps "where to watch (US)" fresh on every Movies / TV / watch-list collection, automatically.
-- pg_cron + pg_net must be enabled (same as the digest job). Runs daily at 08:00 UTC and calls the
-- refresh-watch-providers Edge Function, which re-looks-up current US streaming providers on TMDB
-- for the stalest entries (up to a per-run cap) and writes them into each list's text
-- "Platform"/"Where to watch" column. cron.schedule() upserts, so re-running this is safe.
--
-- Tune the cadence here (this line) and the per-run volume via MAX_LOOKUPS in the function.
select cron.schedule(
  'daybook-refresh-watch-providers',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/refresh-watch-providers',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', 'df291fd260702ae2d1b8e18b7eb2036020af1f14adcb5980'),
    body := '{}'::jsonb
  );
  $$
);
