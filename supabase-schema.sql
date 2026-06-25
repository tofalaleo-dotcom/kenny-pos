-- ນຳໄປວາງໃນ Supabase SQL Editor ແລ້ວ Run ກ່ອນເຊື່ອມ React app.
create extension if not exists "uuid-ossp";

create table public.products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references auth.users(id),
  barcode text not null,
  name text not null,
  unit text not null default 'ອັນ',
  selling_price numeric(14,2) not null check (selling_price >= 0),
  average_cost numeric(14,2) not null default 0 check (average_cost >= 0),
  stock_quantity numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, barcode)
);

create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references auth.users(id),
  cashier_id uuid not null references auth.users(id),
  status text not null default 'completed' check (status in ('held','completed','voided')),
  total numeric(14,2) not null default 0,
  payment_amount numeric(14,2),
  change_amount numeric(14,2),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  cost_at_sale numeric(14,2) not null default 0
);

create table public.inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id),
  created_by uuid not null references auth.users(id),
  transaction_type text not null check (transaction_type in ('stock_in','sale','adjustment')),
  quantity_change numeric(14,3) not null,
  unit_cost numeric(14,2),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_transactions enable row level security;

create policy "Users access own products" on public.products for all using (store_id = auth.uid()) with check (store_id = auth.uid());
create policy "Users access own orders" on public.orders for all using (store_id = auth.uid()) with check (store_id = auth.uid());
create policy "Users access items for own orders" on public.order_items for all using (exists (select 1 from public.orders o where o.id = order_id and o.store_id = auth.uid()));
create policy "Users access own inventory movements" on public.inventory_transactions for all using (exists (select 1 from public.products p where p.id = product_id and p.store_id = auth.uid()));

-- Run stock-ins through a database function in production so moving-average cost
-- and stock updates happen atomically, even when two cashiers work at once.
