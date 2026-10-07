begin;

create or replace function public.public_business_advertisements(p_business_id uuid)
returns table(
  id uuid,
  scope_type text,
  delivery_id uuid,
  business_id uuid,
  product_id uuid,
  title text,
  body text,
  image_url text,
  target_url text,
  priority integer,
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  is_internal boolean
)
language sql stable security definer set search_path=''
as $$
  select
    a.id,a.scope_type,a.delivery_id,a.local_id as business_id,a.product_id,a.title,a.body,
    a.image_url,a.target_url,a.priority,a.active,a.starts_at,a.ends_at,a.is_internal
  from public.public_local_advertisements(p_business_id) a;
$$;

grant execute on function public.public_business_advertisements(uuid) to anon,authenticated,service_role;

commit;
