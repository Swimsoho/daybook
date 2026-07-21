-- Daybook v1 schema: auth-linked profiles, real+sample workspaces, state blobs, RLS isolation.

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null default '',
  name text not null default '',
  role text not null default 'member' check (role in ('owner','member','view-only')),
  is_super_admin boolean not null default false,
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('real','sample')),
  created_at timestamptz not null default now(),
  unique (owner_id, kind)
);

create table if not exists workspace_state (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_state enable row level security;

drop policy if exists "profiles read" on profiles;
create policy "profiles read" on profiles for select
  using (id = auth.uid() or is_super_admin());
drop policy if exists "profiles update" on profiles;
create policy "profiles update" on profiles for update
  using (id = auth.uid() or is_super_admin());

drop policy if exists "workspaces all" on workspaces;
create policy "workspaces all" on workspaces for all
  using (owner_id = auth.uid() or is_super_admin())
  with check (owner_id = auth.uid() or is_super_admin());

drop policy if exists "state all" on workspace_state;
create policy "state all" on workspace_state for all
  using (workspace_id in (select id from workspaces where owner_id = auth.uid()) or is_super_admin())
  with check (workspace_id in (select id from workspaces where owner_id = auth.uid()) or is_super_admin());

-- Sign-up provisioning: profile + both workspaces. Craig's email becomes super-admin automatically.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, role, is_super_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when new.email = 'yisroelswimmer@gmail.com' then 'owner'
         else coalesce(new.raw_user_meta_data->>'role', 'member') end,
    new.email = 'yisroelswimmer@gmail.com'
  );
  insert into workspaces (owner_id, kind) values (new.id, 'real');
  insert into workspaces (owner_id, kind) values (new.id, 'sample');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
