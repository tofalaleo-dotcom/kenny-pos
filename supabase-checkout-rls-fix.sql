-- kennyXpay POS - Checkout RLS Fix
-- Run this in Supabase SQL Editor if checkout says:
-- "new row violates row-level security policy for table order_items"
--
-- What this fixes:
-- 1) Cashier/owner can create an order.
-- 2) Cashier/owner can insert order_items for the order they just created.
-- 3) Stock/products are not deleted or reset.

grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant execute on function private.current_user_role() to authenticated;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Users access own orders" on public.orders;
drop policy if exists "orders_select_active_staff" on public.orders;
drop policy if exists "orders_insert_active_staff" on public.orders;
drop policy if exists "orders_update_manager" on public.orders;
drop policy if exists "orders_delete_owner" on public.orders;

create policy "orders_select_active_staff"
on public.orders for select
to authenticated
using (
  store_id = (select auth.uid())
  or cashier_id = (select auth.uid())
  or private.current_user_role() in ('owner', 'admin', 'worker')
);

create policy "orders_insert_active_staff"
on public.orders for insert
to authenticated
with check (
  store_id = (select auth.uid())
  or cashier_id = (select auth.uid())
  or private.current_user_role() in ('owner', 'admin', 'worker')
);

create policy "orders_update_manager"
on public.orders for update
to authenticated
using (
  store_id = (select auth.uid())
  or cashier_id = (select auth.uid())
  or private.current_user_role() in ('owner', 'admin')
)
with check (
  store_id = (select auth.uid())
  or cashier_id = (select auth.uid())
  or private.current_user_role() in ('owner', 'admin')
);

create policy "orders_delete_owner"
on public.orders for delete
to authenticated
using (
  store_id = (select auth.uid())
  or private.current_user_role() = 'owner'
);

drop policy if exists "Users access items for own orders" on public.order_items;
drop policy if exists "order_items_select_active_staff" on public.order_items;
drop policy if exists "order_items_insert_active_staff" on public.order_items;
drop policy if exists "order_items_update_manager" on public.order_items;
drop policy if exists "order_items_delete_owner" on public.order_items;

create policy "order_items_select_active_staff"
on public.order_items for select
to authenticated
using (
  private.current_user_role() in ('owner', 'admin', 'worker')
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.store_id = (select auth.uid()) or o.cashier_id = (select auth.uid()))
  )
);

create policy "order_items_insert_active_staff"
on public.order_items for insert
to authenticated
with check (
  private.current_user_role() in ('owner', 'admin', 'worker')
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.store_id = (select auth.uid()) or o.cashier_id = (select auth.uid()))
  )
);

create policy "order_items_update_manager"
on public.order_items for update
to authenticated
using (
  private.current_user_role() in ('owner', 'admin')
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.store_id = (select auth.uid()) or o.cashier_id = (select auth.uid()))
  )
)
with check (
  private.current_user_role() in ('owner', 'admin')
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and (o.store_id = (select auth.uid()) or o.cashier_id = (select auth.uid()))
  )
);

create policy "order_items_delete_owner"
on public.order_items for delete
to authenticated
using (
  private.current_user_role() = 'owner'
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.store_id = (select auth.uid())
  )
);
