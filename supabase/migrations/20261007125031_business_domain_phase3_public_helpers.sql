begin;

create or replace function public.public_active_business_promotions(p_business_id uuid)
returns table(
  id uuid,
  business_id uuid,
  title text,
  body text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week smallint[],
  display_order integer,
  promotion_type text,
  promotion_price numeric,
  items jsonb
)
language sql stable security definer set search_path=''
as $$
  select
    p.id,p.local_id as business_id,p.title,p.body,p.image_url,p.starts_at,p.ends_at,
    p.days_of_week,p.display_order,p.promotion_type,p.promotion_price,p.items
  from public.public_active_local_promotions(p_business_id) p;
$$;

create or replace function public.public_business_delivery_choices(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_local_delivery_choices(p_business_id); $$;

grant execute on function public.public_active_business_promotions(uuid) to anon,authenticated,service_role;
grant execute on function public.public_business_delivery_choices(uuid) to anon,authenticated,service_role;

commit;
