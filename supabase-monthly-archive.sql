-- kennyXpay POS: Monthly archive + safe sales cleanup.
-- Run once in Supabase Dashboard -> SQL Editor -> New query.
--
-- What this does:
-- 1) Keeps stock/products exactly as-is.
-- 2) Saves old monthly sales, cost, and gross profit into monthly_reports.
-- 3) Can delete old orders/order_items after the archive is saved.
-- 4) Does NOT delete products, stock_quantity, average_cost, or inventory_transactions.

create extension if not exists "uuid-ossp";

create table if not exists public.monthly_reports (
  id uuid primary key default uuid_generate_v4(),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  period_start date not null,
  period_end date not null,
  total_sales numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  gross_profit numeric(14,2) not null default 0,
  orders_count integer not null default 0,
  items_count numeric(14,3) not null default 0,
  cash_sales numeric(14,2) not null default 0,
  transfer_sales numeric(14,2) not null default 0,
  closed_by uuid references auth.users(id),
  closed_at timestamptz not null default now(),
  unique (year, month)
);

alter table public.monthly_reports enable row level security;

grant select, insert, update, delete on public.monthly_reports to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;

drop policy if exists "monthly_reports_select_manager" on public.monthly_reports;
drop policy if exists "monthly_reports_insert_owner" on public.monthly_reports;
drop policy if exists "monthly_reports_update_owner" on public.monthly_reports;
drop policy if exists "monthly_reports_delete_owner" on public.monthly_reports;

create policy "monthly_reports_select_manager"
on public.monthly_reports for select
to authenticated
using (private.current_user_role() in ('owner', 'admin'));

create policy "monthly_reports_insert_owner"
on public.monthly_reports for insert
to authenticated
with check (private.current_user_role() = 'owner');

create policy "monthly_reports_update_owner"
on public.monthly_reports for update
to authenticated
using (private.current_user_role() = 'owner')
with check (private.current_user_role() = 'owner');

create policy "monthly_reports_delete_owner"
on public.monthly_reports for delete
to authenticated
using (private.current_user_role() = 'owner');

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
using (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "orders_insert_active_staff"
on public.orders for insert
to authenticated
with check (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "orders_update_manager"
on public.orders for update
to authenticated
using (private.current_user_role() in ('owner', 'admin'))
with check (private.current_user_role() in ('owner', 'admin'));

create policy "orders_delete_owner"
on public.orders for delete
to authenticated
using (private.current_user_role() = 'owner');

drop policy if exists "Users access items for own orders" on public.order_items;
drop policy if exists "order_items_select_active_staff" on public.order_items;
drop policy if exists "order_items_insert_active_staff" on public.order_items;
drop policy if exists "order_items_update_manager" on public.order_items;
drop policy if exists "order_items_delete_owner" on public.order_items;

create policy "order_items_select_active_staff"
on public.order_items for select
to authenticated
using (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "order_items_insert_active_staff"
on public.order_items for insert
to authenticated
with check (private.current_user_role() in ('owner', 'admin', 'worker'));

create policy "order_items_update_manager"
on public.order_items for update
to authenticated
using (private.current_user_role() in ('owner', 'admin'))
with check (private.current_user_role() in ('owner', 'admin'));

create policy "order_items_delete_owner"
on public.order_items for delete
to authenticated
using (private.current_user_role() = 'owner');

create or replace function public.close_sales_month(
  p_year integer,
  p_month integer,
  p_delete_sales boolean default true
)
returns public.monthly_reports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_start date;
  v_end date;
  v_report public.monthly_reports;
begin
  v_role := private.current_user_role();

  if v_role <> 'owner' then
    raise exception 'Only owner can close monthly sales';
  end if;

  if p_month < 1 or p_month > 12 then
    raise exception 'Month must be 1-12';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month')::date;

  if p_delete_sales and v_end > current_date then
    raise exception 'Cannot delete sales for the current or future month';
  end if;

  insert into public.monthly_reports (
    year,
    month,
    period_start,
    period_end,
    total_sales,
    total_cost,
    gross_profit,
    orders_count,
    items_count,
    cash_sales,
    transfer_sales,
    closed_by,
    closed_at
  )
  select
    p_year,
    p_month,
    v_start,
    v_end,
    coalesce(sum(o.total), 0),
    coalesce(sum(item_cost.total_cost), 0),
    coalesce(sum(o.total), 0) - coalesce(sum(item_cost.total_cost), 0),
    count(o.id)::integer,
    coalesce(sum(item_cost.items_count), 0),
    coalesce(sum(o.total) filter (where coalesce(o.payment_method, 'cash') = 'cash'), 0),
    coalesce(sum(o.total) filter (where coalesce(o.payment_method, 'cash') = 'transfer'), 0),
    (select auth.uid()),
    now()
  from public.orders o
  left join lateral (
    select
      coalesce(sum(oi.quantity * oi.cost_at_sale), 0) as total_cost,
      coalesce(sum(oi.quantity), 0) as items_count
    from public.order_items oi
    where oi.order_id = o.id
  ) item_cost on true
  where o.status = 'completed'
    and o.created_at >= v_start
    and o.created_at < v_end
  on conflict (year, month) do update
  set
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    total_sales = excluded.total_sales,
    total_cost = excluded.total_cost,
    gross_profit = excluded.gross_profit,
    orders_count = excluded.orders_count,
    items_count = excluded.items_count,
    cash_sales = excluded.cash_sales,
    transfer_sales = excluded.transfer_sales,
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at
  returning * into v_report;

  if p_delete_sales then
    delete from public.orders o
    where o.status in ('completed', 'voided')
      and o.created_at >= v_start
      and o.created_at < v_end;
  end if;

  return v_report;
end;
$$;

grant execute on function public.close_sales_month(integer, integer, boolean) to authenticated;

-- Optional manual test after running this file:
-- select public.close_sales_month(2026, 7, false); -- archive only, do not delete
-- select public.close_sales_month(2026, 6, true);  -- archive then delete old June sales
