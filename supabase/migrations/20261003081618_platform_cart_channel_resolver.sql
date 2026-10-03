-- Resolve valid purchase channels for a HTPWEB cart without duplicating DELIVERY logic.
create or replace function public.public_htpweb_cart_channels(p_local_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_local record;
  v_deliveries jsonb;
  v_direct boolean;
begin
  if p_local_ids is null or cardinality(p_local_ids)=0 then
    return jsonb_build_object('locals','[]'::jsonb);
  end if;

  select array_agg(distinct x order by x)
    into v_ids
  from unnest(p_local_ids) x
  where x is not null;

  if coalesce(cardinality(v_ids),0)=0 then
    return jsonb_build_object('locals','[]'::jsonb);
  end if;

  if cardinality(v_ids)>20 then
    raise exception 'HTPWEB: el carrito supera el máximo de 20 negocios';
  end if;
  foreach v_id in array v_ids loop
    select l.id,l.name,l.slug,l.active
      into v_local
    from public.locals l
    where l.id=v_id and l.active=true;

    if not found then
      raise exception 'HTPWEB: uno de los negocios del carrito no está disponible';
    end if;

    select public.public_local_delivery_choices(v_id) into v_deliveries;

    select (
      public.local_is_owner_managed(v_id)
      and s.storefront_enabled
      and (s.pickup_enabled or s.own_delivery_enabled)
    )
    into v_direct
    from public.local_commerce_settings s
    where s.local_id=v_id;

    v_direct := coalesce(v_direct,false);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'local_id',v_local.id,
      'name',v_local.name,
      'slug',v_local.slug,
      'direct_enabled',v_direct,
      'deliveries',coalesce(v_deliveries,'[]'::jsonb)
    ));
  end loop;

  return jsonb_build_object('locals',v_rows);
end;
$$;

revoke all on function public.public_htpweb_cart_channels(uuid[]) from public;
grant execute on function public.public_htpweb_cart_channels(uuid[]) to anon,authenticated;

