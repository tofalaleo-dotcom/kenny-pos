-- ອັບເດດ column ສຳລັບຟີເຈີໃໝ່:
-- 1) ຢຸດຂາຍ/ລຶບສິນຄ້າຈາກໜ້າຂາຍ
-- 2) ເກັບວິທີຊຳລະເງິນ ແລະ ສະຖານະຮັບບິນ

alter table public.products
  add column if not exists is_active boolean not null default true;

alter table public.orders
  add column if not exists payment_method text default 'cash' check (payment_method in ('cash','transfer')),
  add column if not exists print_receipt boolean not null default true;
