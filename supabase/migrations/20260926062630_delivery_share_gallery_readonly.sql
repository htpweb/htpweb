
create or replace function public.delivery_share_locals(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not public.is_master() then
    if public.current_role_code() <> 'DELIVERY_ADMIN' then
      raise exception 'HTPWEB: solo DELIVERY_ADMIN puede usar Compartir';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',l.id,
        'name',l.name,
        'description',l.description,
        'banner_url',l.banner_url,
        'logo_url',l.logo_url,
        'business_category_id',l.business_category_id,
        'business_category_name',bc.name,
        'zone_id',l.zone_id,
        'gallery_count',coalesce(g.gallery_count,0),
        'first_gallery_image_url',g.first_image_url
      )
      order by lower(l.name),l.id
    )
    from public.local_deliveries ld
    join public.locals l on l.id=ld.local_id and l.active=true
    left join public.local_business_categories bc on bc.id=l.business_category_id and bc.active=true
    left join lateral (
      select
        count(*)::integer as gallery_count,
        (array_agg(gi.image_url order by gi.display_order,gi.created_at,gi.id))[1] as first_image_url
      from public.local_gallery_images gi
      where gi.local_id=l.id and gi.active=true
    ) g on true
    where ld.delivery_id=p_delivery_id
      and ld.active=true
  ),'[]'::jsonb);
end;
$$;

create or replace function public.delivery_share_local_gallery(
  p_delivery_id uuid,
  p_local_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not public.is_master() then
    if public.current_role_code() <> 'DELIVERY_ADMIN' then
      raise exception 'HTPWEB: solo DELIVERY_ADMIN puede usar Compartir';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  if not exists(
    select 1
    from public.local_deliveries ld
    join public.locals l on l.id=ld.local_id and l.active=true
    where ld.delivery_id=p_delivery_id
      and ld.local_id=p_local_id
      and ld.active=true
  ) then
    raise exception 'HTPWEB: LOCAL no vinculado a este DELIVERY';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',g.id,
        'image_url',g.image_url,
        'display_order',g.display_order
      )
      order by g.display_order,g.created_at,g.id
    )
    from public.local_gallery_images g
    where g.local_id=p_local_id
      and g.active=true
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.delivery_share_locals(uuid) from public;
revoke all on function public.delivery_share_local_gallery(uuid,uuid) from public;
grant execute on function public.delivery_share_locals(uuid) to authenticated,service_role;
grant execute on function public.delivery_share_local_gallery(uuid,uuid) to authenticated,service_role;
