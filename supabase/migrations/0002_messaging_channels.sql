-- Registers per-profile Telegram/Slack identifiers so inbound messages from either can be
-- matched to a Daybook account (mirrors the existing `phone` column used for SMS/WhatsApp
-- capture, added the same way: a nullable text column, no uniqueness enforced in the DB —
-- the same lookup pattern sms-inbound already uses via .maybeSingle()).
--
-- Note: `phone` itself was added directly against the live project in an earlier session
-- without a matching committed migration file (drift discovered while building this one) —
-- the `if not exists` here makes this migration safe to run against either the already-patched
-- live database or a fresh one that only ever ran 0001_init.sql.
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists telegram_chat_id text;
alter table profiles add column if not exists slack_user_id text;
