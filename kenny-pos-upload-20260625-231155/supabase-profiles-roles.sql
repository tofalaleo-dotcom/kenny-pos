-- ເພີ່ມລະບົບ role ສຳລັບ Owner / Worker
-- 1) Run ໃນ Supabase SQL Editor
-- 2) ຫຼັງຈາກ run ແລ້ວ ເຈົ້າສາມາດປ່ຽນ role ໄດ້ໃນຕາຕະລາງ profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'worker' check (role in ('owner','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, email, role)
select id, email, 'owner'
from auth.users
where email = 'tofalaleo@gmail.com'
on conflict (id) do update set role = 'owner', email = excluded.email, updated_at = now();

-- ຖ້າຢາກໃຫ້ user ອື່ນເປັນ worker:
-- update public.profiles set role = 'worker' where email = 'worker-email@example.com';
