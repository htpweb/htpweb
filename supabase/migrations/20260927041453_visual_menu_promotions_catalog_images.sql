create or replace function public.public_local_promotions_catalog(p_local_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', lp.id,
        'local_id', lp.local_id,
        'title', lp.title,
        'body', lp.body,
        'image_url', lp.image_url,
        'starts_at', lp.starts_at,
        'ends_at', lp.ends_at,
        'days_of_week', lp.days_of_week,
        'display_order', lp.display_order,
        'promotion_type', lp.promotion_type,
        'promotion_price', lp.promotion_price,
        'available_now',
          (
            (lp.starts_at is null or lp.starts_at <= now())
            and (lp.ends_at is null or lp.ends_at >= now())
            and (
              cardinality(lp.days_of_week)=0
              or extract(dow from timezone('America/Guayaquil',now()))::smallint = any(lp.days_of_week)
            )
          ),
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'product_id', i.product_id,
              'product_name', pr.name,
              'product_image_url', pr.image_url,
              'variant_id', i.variant_id,
              'variant_name', pv.name,
              'quantity', i.quantity,
              'promo_price', i.promo_price,
              'regular_unit_price', coalesce(pv.price,pr.price)
            )
            order by i.display_order,i.id
          )
          from public.local_promotion_items i
          join public.products pr
            on pr.id=i.product_id
           and pr.active=true
          left join public.product_variants pv on pv.id=i.variant_id
          where i.promotion_id=lp.id
            and (i.variant_id is null or pv.active=true)
        ),'[]'::jsonb)
      )
      order by lp.display_order,lp.created_at desc
    ),
    '[]'::jsonb
  )
  from public.local_promotions lp
  join public.locals l
    on l.id=lp.local_id
   and l.active=true
  where lp.local_id=p_local_id
    and lp.active=true
    and (lp.ends_at is null or lp.ends_at >= now());
$$;

revoke all on function public.public_local_promotions_catalog(uuid) from public;
grant execute on function public.public_local_promotions_catalog(uuid)
  to anon,authenticated,service_role;

notify pgrst,'reload schema';
