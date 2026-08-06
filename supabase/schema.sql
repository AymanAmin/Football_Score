-- سجل الملاعب: تخزين ومشاركة آمنان لكل مستخدم في Supabase
-- شغّل هذا الملف كاملًا من SQL Editor. يمكن تشغيله مجددًا لتحديث السياسات.

create table if not exists public.football_app_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":2,"players":[],"matches":[]}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.football_app_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  member_email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (owner_id, member_email),
  check (member_email = lower(member_email)),
  check (owner_email = lower(owner_email)),
  check (char_length(member_email) between 3 and 320)
);

alter table public.football_app_data enable row level security;
alter table public.football_app_members enable row level security;

revoke all on table public.football_app_data from public, anon;
revoke all on table public.football_app_members from public, anon;
grant select, insert, update, delete on table public.football_app_data to authenticated;
grant select, insert, update, delete on table public.football_app_members to authenticated;

-- إزالة سياسات النسخة السابقة والسياسات الحالية قبل إعادة إنشائها.
drop policy if exists "Users can read their football data" on public.football_app_data;
drop policy if exists "Users can insert their football data" on public.football_app_data;
drop policy if exists "Users can update their football data" on public.football_app_data;
drop policy if exists "Users can delete their football data" on public.football_app_data;
drop policy if exists "Owners and members can read football data" on public.football_app_data;
drop policy if exists "Owners and editors can insert football data" on public.football_app_data;
drop policy if exists "Owners and editors can update football data" on public.football_app_data;
drop policy if exists "Owners can delete football data" on public.football_app_data;

drop policy if exists "Owners and invitees can read memberships" on public.football_app_members;
drop policy if exists "Owners can add memberships" on public.football_app_members;
drop policy if exists "Owners can update memberships" on public.football_app_members;
drop policy if exists "Owners can delete memberships" on public.football_app_members;

create policy "Owners and invitees can read memberships"
on public.football_app_members
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create policy "Owners can add memberships"
on public.football_app_members
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create policy "Owners can update memberships"
on public.football_app_members
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create policy "Owners can delete memberships"
on public.football_app_members
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners and members can read football data"
on public.football_app_data
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

create policy "Owners and editors can insert football data"
on public.football_app_data
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
  )
);

create policy "Owners and editors can update football data"
on public.football_app_data
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
  )
)
with check (
  (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
  )
);

create policy "Owners can delete football data"
on public.football_app_data
for delete
to authenticated
using ((select auth.uid()) = owner_id);
