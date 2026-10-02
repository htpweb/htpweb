-- Allow authenticated sessions to read advertising_settings through the existing MASTER-only RLS policy.
grant select on table public.advertising_settings to authenticated;
