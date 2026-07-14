-- Fix product / stock saving permissions for kennyXpay POS.
-- Run this once in Supabase Dashboard -> SQL Editor.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

revoke all on function private.current_user_role() from public;
revoke all on function private.current_user_role() from anon;
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;

alter table public.products enable row level security;
alter table public.inventory_transactions enable row level security;

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.inventory_transactions to authenticated;

drop policy if exists "Users access own products" on public.products;
drop policy if exists "products_select_active_staff" on public.products;
drop policy if exists "products_insert_manager" on public.products;
drop policy if exists "products_update_active_staff" on public.products;
drop policy if exists "products_delete_manager" on public.products;

create policy "products_select_active_staff"
on public.products for select
to authenticated
using (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "products_insert_manager"
on public.products for insert
to authenticated
with check (private.current_user_role() in ('owner', 'admin'));

create policy "products_update_active_staff"
on public.products for update
to authenticated
using (private.current_user_role() in ('owner', 'admin', 'worker'))
with check (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "products_delete_manager"
on public.products for delete
to authenticated
using (private.current_user_role() in ('owner', 'admin'));

drop policy if exists "Users access own inventory movements" on public.inventory_transactions;
drop policy if exists "inventory_select_active_staff" on public.inventory_transactions;
drop policy if exists "inventory_insert_active_staff" on public.inventory_transactions;
drop policy if exists "inventory_update_manager" on public.inventory_transactions;
drop policy if exists "inventory_delete_manager" on public.inventory_transactions;

create policy "inventory_select_active_staff"
on public.inventory_transactions for select
to authenticated
using (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "inventory_insert_active_staff"
on public.inventory_transactions for insert
to authenticated
with check (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "inventory_update_manager"
on public.inventory_transactions for update
to authenticated
using (private.current_user_role() in ('owner', 'admin'))
with check (private.current_user_role() in ('owner', 'admin'));

create policy "inventory_delete_manager"
on public.inventory_transactions for delete
to authenticated
using (private.current_user_role() in ('owner', 'admin'));

insert into public.profiles (id, email, role, status)
select id, lower(trim(email)), 'owner', 'active'
from auth.users
where lower(trim(email)) = 'tofalaleo@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'owner',
    status = 'active',
    updated_at = now();
