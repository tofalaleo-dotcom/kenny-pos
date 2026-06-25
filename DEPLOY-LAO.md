# ວິທີເຮັດໃຫ້ kennyXpay POS ເປັນ Online

ແນະນຳໃຊ້ Vercel ຫຼື Netlify. ແອັບນີ້ເປັນ React/Vite ແລະໃຊ້ Supabase online ຢູ່ແລ້ວ.

## ຕົວເລືອກ 1: Vercel

1. ເຂົ້າ https://vercel.com
2. ສ້າງບັນຊີ ຫຼື login
3. ກົດ Add New Project
4. ເລືອກ project `lao-pos`
5. ຕັ້ງຄ່າ:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. ໃສ່ Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. ກົດ Deploy

## ຕົວເລືອກ 2: Netlify

1. ເຂົ້າ https://netlify.com
2. ສ້າງບັນຊີ ຫຼື login
3. ກົດ Add new site
4. ເລືອກ project `lao-pos`
5. ຕັ້ງຄ່າ:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. ໃສ່ Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. ກົດ Deploy

## ຫຼັງ Deploy

ໃນ Supabase Dashboard:

1. ເຂົ້າ Authentication
2. ເຂົ້າ URL Configuration
3. ເພີ່ມ URL ຂອງເວັບ online ເຂົ້າໃນ:
   - Site URL
   - Redirect URLs

ຕົວຢ່າງ:

```text
https://kennyxpay.vercel.app
```

## URL ສຳລັບໃຊ້ງານ

- ຈໍພະນັກງານ / ໜ້າຂາຍ: URL ຫຼັກ
- ຈໍລູກຄ້າ: `?display=1`

ຕົວຢ່າງ:

```text
https://kennyxpay.vercel.app/?display=1
```

## ຂໍ້ຄວນຈື່

- ຢ່າ upload `.env.local` ຂຶ້ນ internet
- Supabase anon key ໃຊ້ໄດ້ໃນ frontend ແຕ່ຕ້ອງມີ RLS ປ້ອງກັນ
- ຖ້າຈະໃຊ້ກ້ອງສະແກນ barcode online ເວັບຕ້ອງເປັນ HTTPS
