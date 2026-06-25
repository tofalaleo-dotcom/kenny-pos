-- ເພີ່ມລະບົບ role ສຳລັບ Owner / Worker
-- 1) Run ໃນ Supabase SQL Editor
-- 2) ຫຼັງຈາກ run ແລ້ວ ເຈົ້າສາມາດປ່ຽນ role ໄດ້ໃນຕາຕະລາງ profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'worker',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists status text not null default 'pending';

do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles drop constraint if exists profiles_status_check;
  alter table public.profiles add constraint profiles_role_check check (role in ('owner','admin','worker'));
  alter table public.profiles add constraint profiles_status_check check (status in ('pending','active','blocked'));
end $$;

insert into public.profiles (id, email, role, status)
select id, email, 'owner'
from auth.users
where email = 'tofalaleo@gmail.com'
on conflict (id) do update set role = 'owner', status = 'active', email = excluded.email, updated_at = now();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'worker', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'active' limit 1;
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_owner" on public.profiles;
create policy "profiles_select_own_or_owner"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner');

drop policy if exists "profiles_insert_own_pending" on public.profiles;
create policy "profiles_insert_own_pending"
on public.profiles for insert
to authenticated
with check (id = auth.uid() and role = 'worker' and status = 'pending');

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

-- ຖ້າຢາກໃຫ້ user ອື່ນເປັນ worker:
-- update public.profiles set role = 'worker', status = 'active' where email = 'worker-email@example.com';
