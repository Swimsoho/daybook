-- Schedules the real Telegram/Slack morning & lunch push (Settings > Morning brief & nudges).
-- pg_cron + pg_net are both already enabled on this project. This job runs every 15 minutes and
-- calls the send-scheduled-digest Edge Function, which decides per-account whether anyone is
-- actually due a message right now (see that function's own comment header for the full design).
--
-- The literal secret below is a low-stakes anti-spam token (not a real credential) — it only
-- exists so a random internet request can't trigger this function; see the function's own header
-- comment for how to rotate it if you ever want to. cron.schedule() with a named job upserts, so
-- re-running this migration (or applying it again after editing the URL/secret) is always safe.
select cron.schedule(
  'daybook-scheduled-digest',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/send-scheduled-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', 'df291fd260702ae2d1b8e18b7eb2036020af1f14adcb5980'),
    body := '{}'::jsonb
  );
  $$
);
