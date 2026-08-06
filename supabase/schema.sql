-- سجل الملاعب: نتائج عامة للقراءة + دعوات عرض/تعديل + مسؤول عام
-- شغّل هذا الملف كاملًا من SQL Editor. يمكن تشغيله مجددًا لتحديث الجداول والسياسات.
-- المسؤول العام: ayman1793@gmail.com

create table if not exists public.football_app_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  owner_email text,
  data jsonb not null default '{"version":2,"players":[],"matches":[]}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.football_app_data
  add column if not exists owner_email text;

-- تعبئة بريد المالك للبيانات التي أُنشئت قبل إضافة البحث العام.
update public.football_app_data as app_data
set owner_email = lower(app_user.email)
from auth.users as app_user
where app_user.id = app_data.owner_id
  and (app_data.owner_email is null or btrim(app_data.owner_email) = '');

create index if not exists football_app_data_owner_email_idx
  on public.football_app_data (lower(owner_email));

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

-- دالة مركزية لمعرفة حساب المسؤول العام من JWT.
create or replace function public.is_football_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'ayman1793@gmail.com';
$$;

revoke all on function public.is_football_app_admin() from public;
grant execute on function public.is_football_app_admin() to authenticated;

alter table public.football_app_data enable row level security;
alter table public.football_app_members enable row level security;

revoke all on table public.football_app_data from public, anon;
revoke all on table public.football_app_members from public, anon;
grant select, insert, update, delete on table public.football_app_data to authenticated;
grant select, insert, update, delete on table public.football_app_members to authenticated;

-- إزالة كل أسماء السياسات المستخدمة في الإصدارات السابقة والحالية.
drop policy if exists "Users can read their football data" on public.football_app_data;
drop policy if exists "Users can insert their football data" on public.football_app_data;
drop policy if exists "Users can update their football data" on public.football_app_data;
drop policy if exists "Users can delete their football data" on public.football_app_data;
drop policy if exists "Owners and members can read football data" on public.football_app_data;
drop policy if exists "Owners and editors can insert football data" on public.football_app_data;
drop policy if exists "Owners and editors can update football data" on public.football_app_data;
drop policy if exists "Owners can delete football data" on public.football_app_data;
drop policy if exists "Authenticated users can read public football data" on public.football_app_data;
drop policy if exists "Owners editors and admin can insert football data" on public.football_app_data;
drop policy if exists "Owners editors and admin can update football data" on public.football_app_data;
drop policy if exists "Owners and admin can delete football data" on public.football_app_data;

drop policy if exists "Owners and invitees can read memberships" on public.football_app_members;
drop policy if exists "Owners can add memberships" on public.football_app_members;
drop policy if exists "Owners can update memberships" on public.football_app_members;
drop policy if exists "Owners can delete memberships" on public.football_app_members;
drop policy if exists "Owners invitees and admin can read memberships" on public.football_app_members;
drop policy if exists "Owners and admin can add memberships" on public.football_app_members;
drop policy if exists "Owners and admin can update memberships" on public.football_app_members;
drop policy if exists "Owners and admin can delete memberships" on public.football_app_members;

-- الدعوات لا تظهر إلا للمالك، المدعو نفسه، أو المسؤول العام.
create policy "Owners invitees and admin can read memberships"
on public.football_app_members
for select
to authenticated
using (
  public.is_football_app_admin()
  or (select auth.uid()) = owner_id
  or member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create policy "Owners and admin can add memberships"
on public.football_app_members
for insert
to authenticated
with check (
  public.is_football_app_admin()
  or (
    (select auth.uid()) = owner_id
    and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

create policy "Owners and admin can update memberships"
on public.football_app_members
for update
to authenticated
using (
  public.is_football_app_admin()
  or (select auth.uid()) = owner_id
)
with check (
  public.is_football_app_admin()
  or (
    (select auth.uid()) = owner_id
    and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

create policy "Owners and admin can delete memberships"
on public.football_app_members
for delete
to authenticated
using (
  public.is_football_app_admin()
  or (select auth.uid()) = owner_id
);

-- كل مستخدم مسجل يستطيع البحث وقراءة النتائج، لكن لا يستطيع تعديلها دون صلاحية.
create policy "Authenticated users can read public football data"
on public.football_app_data
for select
to authenticated
using (true);

create policy "Owners editors and admin can insert football data"
on public.football_app_data
for insert
to authenticated
with check (
  public.is_football_app_admin()
  or (
    (select auth.uid()) = owner_id
    and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
      and member.owner_email = football_app_data.owner_email
  )
);

create policy "Owners editors and admin can update football data"
on public.football_app_data
for update
to authenticated
using (
  public.is_football_app_admin()
  or (select auth.uid()) = owner_id
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
  )
)
with check (
  public.is_football_app_admin()
  or (
    (select auth.uid()) = owner_id
    and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
  or exists (
    select 1
    from public.football_app_members as member
    where member.owner_id = football_app_data.owner_id
      and member.member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.role = 'editor'
      and member.owner_email = football_app_data.owner_email
  )
);

create policy "Owners and admin can delete football data"
on public.football_app_data
for delete
to authenticated
using (
  public.is_football_app_admin()
  or (select auth.uid()) = owner_id
);
