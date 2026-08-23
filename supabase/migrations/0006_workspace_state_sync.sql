-- Daybook: make workspace saves concurrency-safe, and let clients see each other's changes.
--
-- THE PROBLEM THIS FIXES
-- A workspace is one `workspace_state.data` JSON document, previously saved with a
-- blind `upsert`. Whoever saved last replaced the whole document — so two clients
-- open at once (two browser tabs, or a laptop and a phone) silently destroyed each
-- other's work. Not one field: everything the other had done since it loaded.
--
-- THE FIX
--   1. `version` — bumped on every write by a trigger, so no writer can forget.
--   2. `save_workspace_state()` — writes only if the caller's expected version still
--      matches. If it doesn't, the write is refused and the current row is returned
--      so the client can merge and retry, instead of overwriting.
--   3. realtime — clients subscribe to their own workspace and pull changes as they
--      happen, rather than discovering them by destroying them.
--
-- SAFETY
-- Additive only. Existing rows get version 0; nothing is dropped or rewritten. An old
-- client still doing a blind upsert keeps working (the trigger bumps the version, so
-- newer clients still notice the change) — which means you can apply this migration
-- before deploying the new front-end, and deploy the two apps in whatever order suits.
--
-- Apply from the Supabase dashboard: SQL Editor → paste → Run. Safe to run twice.

-- ── 1. version column ───────────────────────────────────────────────────────

alter table workspace_state
  add column if not exists version bigint not null default 0;

-- ── 2. bump it on every write, whoever the writer is ────────────────────────

create or replace function bump_workspace_state_version()
returns trigger
language plpgsql
as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists workspace_state_version on workspace_state;
create trigger workspace_state_version
  before update on workspace_state
  for each row execute function bump_workspace_state_version();

-- ── 3. conditional save ─────────────────────────────────────────────────────
--
-- Returns one row:
--   ok = true   → saved; `version` is the new version, `data` is what you sent
--   ok = false  → refused because someone else wrote first; `version` and `data`
--                 are the current server values, for the caller to merge against
--
-- SECURITY INVOKER (the default) is deliberate: the function runs as the caller,
-- so the existing row-level security policy on workspace_state still applies and
-- this cannot be used to reach another user's workspace.

create or replace function save_workspace_state(
  p_workspace_id uuid,
  p_data jsonb,
  p_expected_version bigint
)
returns table (ok boolean, version bigint, data jsonb)
language plpgsql
as $$
declare
  current_version bigint;
  current_data jsonb;
begin
  select ws.version, ws.data into current_version, current_data
    from workspace_state ws
   where ws.workspace_id = p_workspace_id
   for update;

  -- first save for this workspace
  if not found then
    insert into workspace_state (workspace_id, data, version, updated_at)
    values (p_workspace_id, p_data, 1, now());
    return query select true, 1::bigint, p_data;
    return;
  end if;

  -- a null expectation means "I haven't loaded this yet" — refuse rather than guess
  if p_expected_version is null or p_expected_version <> current_version then
    return query select false, current_version, current_data;
    return;
  end if;

  update workspace_state
     set data = p_data
   where workspace_id = p_workspace_id;

  select ws.version into current_version
    from workspace_state ws
   where ws.workspace_id = p_workspace_id;

  return query select true, current_version, p_data;
end $$;

revoke all on function save_workspace_state(uuid, jsonb, bigint) from public;
grant execute on function save_workspace_state(uuid, jsonb, bigint) to authenticated;

-- ── 4. realtime ─────────────────────────────────────────────────────────────
-- Row-level security still applies to realtime, so a client only ever receives
-- changes to workspaces it can already read.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'workspace_state'
  ) then
    alter publication supabase_realtime add table workspace_state;
  end if;
exception
  when undefined_object then
    -- no supabase_realtime publication on this project; realtime simply stays off
    -- and the clients fall back to polling on focus.
    null;
end $$;

-- `data` is large; realtime needs the full old row only for deletes, which we never do.
alter table workspace_state replica identity default;
