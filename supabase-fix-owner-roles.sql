-- Fix owner roles for kennyXpay POS
-- Run this once in Supabase SQL Editor.
-- Only tofalaleo@gmail.com should stay owner.

update public.profiles
set
  role = 'worker',
  status = case when status = 'blocked' then 'blocked' else 'active' end,
  updated_at = now()
where lower(coalesce(email, '')) <> 'tofalaleo@gmail.com'
  and role = 'owner';

update public.profiles
set
  role = 'owner',
  status = 'active',
  updated_at = now()
where lower(coalesce(email, '')) = 'tofalaleo@gmail.com';
