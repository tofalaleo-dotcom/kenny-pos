-- ໃຊ້ໄຟລ໌ນີ້ ຖ້າ database ມີຕາຕະລາງ products ຢູ່ແລ້ວ.
-- ບໍ່ລົບ products ຫຼື ຂໍ້ມູນເກົ່າ.

create extension if not exists "uuid-ossp";

alter table public.products
  add column if not exists store_id uuid references auth.users(id),
  add column if not exists average_cost numeric(14,2) not null default 0 check (average_cost >= 0),
  add column if not exists stock_quantity numeric(14,3) not null default 0,
  add column if not exists low_stock_threshold numeric(14,3) not null default 0,
  add column if not exists is_active boolean not null default true;

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references auth.users(id),
  cashier_id uuid references auth.users(id),
  status text not null default 'completed' check (status in ('held','completed','voided')),
  total numeric(14,2) not null default 0,
  payment_amount numeric(14,2),
  change_amount numeric(14,2),
  payment_method text default 'cash' check (payment_method in ('cash','transfer')),
  print_receipt boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists payment_method text default 'cash' check (payment_method in ('cash','transfer')),
  add column if not exists print_receipt boolean not null default true;

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  cost_at_sale numeric(14,2) not null default 0
);

create table if not exists public.inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id),
  created_by uuid references auth.users(id),
  transaction_type text not null check (transaction_type in ('stock_in','sale','adjustment')),
  quantity_change numeric(14,3) not null,
  unit_cost numeric(14,2),
  reason text,
  created_at timestamptz not null default now()
);

-- ເປີດ Realtime ສຳລັບ products ແລະ ໜ້າຈໍລູກຄ້າ.
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
end $$;

-- RLS ຈະຖືກເປີດຫຼັງຈາກເພີ່ມ Login ໃນ app.
-- ຕອນນີ້ບໍ່ເປີດ RLS ເພາະຍັງບໍ່ມີ user session;
-- ຖ້າເປີດຕອນນີ້ app ຈະອ່ານສິນຄ້າບໍ່ໄດ້.
