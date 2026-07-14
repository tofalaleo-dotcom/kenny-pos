-- kennyXpay POS: fix stock/product permission error.
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Fixes: "permission denied for function current_user_role"

grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;

-- Make sure the owner account is active.
insert into public.profiles (id, email, role, status)
select id, lower(trim(email)), 'owner', 'active'
from auth.users
where lower(trim(email)) = 'tofalaleo@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'owner',
    status = 'active',
    updated_at = now();
