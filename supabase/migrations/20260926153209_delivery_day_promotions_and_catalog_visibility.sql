
alter table public.products
  add column if not exists catalog_visible boolean not null default true;

create index if not exists products_public_catalog_idx
  on public.products(local_id, active, catalog_visible, display_order);

create or replace function public.public_delivery_promotions(
  p_delivery_id uuid,
  p_day_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_date date;
  v_result jsonb;
begin
  if p_day_offset is null or p_day_offset < 0 or p_day_offset > 30 then
    raise exception 'HTPWEB: el día solicitado debe estar entre hoy y los próximos 30 días';
  end if;

  v_target_date := timezone('America/Guayaquil', now())::date + p_day_offset;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
      and d.active = true
  ) then
    return jsonb_build_object(
      'target_date', v_target_date,
      'day_offset', p_day_offset,
      'promotions', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'target_date', v_target_date,
    'day_offset', p_day_offset,
    'promotions', coalesce(
      jsonb_agg(row_data order by sort_order, local_name, title, promotion_id),
      '[]'::jsonb
    )
  )
  into v_result
  from (
    select
      lp.display_order as sort_order,
      l.name as local_name,
      lp.title,
      lp.id as promotion_id,
      jsonb_build_object(
        'id', lp.id,
        'local_id', lp.local_id,
        'local_name', l.name,
        'local_logo_url', l.logo_url,
        'local_banner_url', l.banner_url,
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
            p_day_offset = 0
            and (lp.starts_at is null or lp.starts_at <= now())
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
              'variant_id', i.variant_id,
              'variant_name', pv.name,
              'quantity', i.quantity,
              'promo_price', i.promo_price,
              'regular_unit_price', coalesce(pv.price,pr.price)
            )
            order by i.display_order,i.id
          )
          from public.local_promotion_items i
          join public.products pr on pr.id=i.product_id and pr.active=true
          left join public.product_variants pv on pv.id=i.variant_id
          where i.promotion_id=lp.id
            and (i.variant_id is null or pv.active=true)
        ),'[]'::jsonb)
      ) as row_data
    from public.local_promotions lp
    join public.locals l
      on l.id=lp.local_id
     and l.active=true
    join public.local_deliveries ld
      on ld.local_id=l.id
     and ld.delivery_id=p_delivery_id
     and ld.active=true
    where lp.active=true
      and (
        lp.starts_at is null
        or timezone('America/Guayaquil',lp.starts_at)::date <= v_target_date
      )
      and (
        lp.ends_at is null
        or timezone('America/Guayaquil',lp.ends_at)::date >= v_target_date
      )
      and (
        cardinality(lp.days_of_week)=0
        or extract(dow from v_target_date)::smallint=any(lp.days_of_week)
      )
  ) q;

  return coalesce(v_result, jsonb_build_object(
    'target_date', v_target_date,
    'day_offset', p_day_offset,
    'promotions', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.public_delivery_promotions(uuid,integer) from public;
grant execute on function public.public_delivery_promotions(uuid,integer) to anon, authenticated;

notify pgrst, 'reload schema';