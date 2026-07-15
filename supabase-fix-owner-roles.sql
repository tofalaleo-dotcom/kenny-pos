-- Fix owner roles for kennyXpay POS
-- Run this once in Supabase SQL Editor.
-- tofalaleo@gmail.com is the main owner.
-- Total owner accounts are limited to 5.

-- Make sure main owner is always active owner.
update public.profiles
set role = 'owner',
    status = 'active',
    updated_at = now()
where lower(coalesce(email, '')) = 'tofalaleo@gmail.com';

-- If there are more than 5 owners, keep:
-- 1) main owner, and
-- 2) first 4 additional owner rows by created_at.
with ranked_owners as (
  select
    id,
    row_number() over (
      order by
        case when lower(coalesce(email, '')) = 'tofalaleo@gmail.com' then 0 else 1 end,
        created_at asc nulls last
    ) as owner_rank
  from public.profiles
  where role = 'owner'
    and status = 'active'
)
update public.profiles
set role = 'worker',
    updated_at = now()
where id in (
  select id
  from ranked_owners
  where owner_rank > 5
);
