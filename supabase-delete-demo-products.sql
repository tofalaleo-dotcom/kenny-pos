-- ໃຊ້ໄຟລ໌ນີ້ຖ້າຢາກລຶບສິນຄ້າ demo ເກົ່າອອກຈາກ Supabase.
-- ມັນຈະລຶບຕາມ barcode demo ເທົ່ານັ້ນ.

delete from public.inventory_transactions
where product_id in (
  select id from public.products
  where barcode in ('8850123456789','8850987654321','8850444555666','8850777888999')
);

delete from public.order_items
where product_id in (
  select id from public.products
  where barcode in ('8850123456789','8850987654321','8850444555666','8850777888999')
);

delete from public.products
where barcode in ('8850123456789','8850987654321','8850444555666','8850777888999');
