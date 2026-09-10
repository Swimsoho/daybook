-- Public, no-login project share links (Phase 1 of "invite someone to a project who doesn't have
-- Daybook"). Mirrors task_shares: a random token maps to one project in one workspace. The row holds
-- no project content itself — the shared-project Edge Function reads the live project out of
-- workspace_state at view time and returns only that project's data. Access is exclusively through
-- that function (service-role); RLS is enabled with no public policies so the table is unreadable to
-- anon/auth clients directly.

create table if not exists public.project_shares (
  token         text primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  project_id    text not null,
  created_at    timestamptz not null default now(),
  revoked       boolean not null default false
);

create index if not exists project_shares_workspace_idx on public.project_shares (workspace_id);

alter table public.project_shares enable row level security;
-- (No policies on purpose: only the service-role Edge Function touches this table.)
