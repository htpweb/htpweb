-- Runtime enforcement for pending downgrades and restricted delivery locations.

create or replace function public.delivery_plan_selection_ready(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select not exists(
    select 1
    from public.plan_assignments a
    where a.delivery_id=p_delivery_id
      and a.status in ('ACTIVE','TRIAL')
      and a.starts_at<=now()
      and (a.ends_at is null or a.ends_at>now())
      and a.selection_reset_required=true
      and a.transition_applied_at is null
  );
$$;

revoke all on function public.delivery_plan_selection_ready(uuid) from public,anon,authenticated;

create or replace function public.htp_delivery_covers_local(p_delivery uuid,p_local uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.delivery_service_is_active(p_delivery)
    and public.delivery_plan_selection_ready(p_delivery)
    and exists(
      select 1
      from public.locals l
      join public.zones z on z.id=l.zone_id and z.active
      join public.delivery_zones dz on dz.zone_id=z.id and dz.active
      join public.deliveries d on d.id=dz.delivery_id and d.active
      where l.id=p_local and l.active and d.id=p_delivery
    );
$$;

revoke all on function public.ensure_delivery_plan_transition_applied(uuid) from public,anon;
grant execute on function public.ensure_delivery_plan_transition_applied(uuid) to authenticated;

create or replace function public.validate_order_customer_delivery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.customers c
    where c.id=new.customer_id and c.active=true
  )
  or not exists(
    select 1 from public.deliveries d
    where d.id=new.delivery_id and d.active=true
  )
  or not public.customer_can_order_delivery(
    new.customer_id,
    new.delivery_id,
    coalesce(new.created_at,now())
  )
  then
    raise exception 'HTPWEB: el customer no está habilitado para realizar pedidos en este delivery en este horario';
  end if;

  if new.latitude is not null
     and new.longitude is not null
     and public.delivery_location_is_restricted(
       new.delivery_id,
       new.latitude,
       new.longitude,
       coalesce(new.created_at,now())
     )
  then
    raise exception 'HTPWEB: la ubicación de entrega está restringida para este DELIVERY en este horario';
  end if;

  return new;
end;
$$;

create or replace function public.delivery_zone_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_city record;
  v_current integer;
  v_limit integer;
  v_zones jsonb;
  v_reset_pending boolean;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select d.id,d.name,d.active,d.city_id
  into v_delivery
  from public.deliveries d
  where d.id=p_delivery_id;

  if not found then raise exception 'HTPWEB: DELIVERY inexistente'; end if;

  if not public.is_master() then
    if not public.has_permission('zones.view') then
      raise exception 'HTPWEB: no tiene permiso zones.view';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  if v_delivery.city_id is not null then
    select c.id,c.name,c.province,c.country,c.active
    into v_city
    from public.cities c
    where c.id=v_delivery.city_id;
  end if;

  select count(*)::integer into v_current
  from public.delivery_zones dz
  where dz.delivery_id=p_delivery_id and dz.active=true;

  v_limit:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
  v_reset_pending:=not public.delivery_plan_selection_ready(p_delivery_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,'code',z.code,'name',z.name,'city_id',z.city_id,'city_name',c.name,
    'province',c.province,'active',z.active,'assigned',coalesce(dz.active,false),
    'local_count',(select count(*) from public.locals l where l.zone_id=z.id and l.active=true)
  ) order by z.code,lower(z.name),z.id),'[]'::jsonb)
  into v_zones
  from public.zones z
  join public.cities c on c.id=z.city_id
  left join public.delivery_zones dz on dz.delivery_id=p_delivery_id and dz.zone_id=z.id
  where z.active=true
    and v_delivery.city_id is not null
    and z.city_id=v_delivery.city_id;

  return jsonb_build_object(
    'delivery',jsonb_build_object(
      'id',v_delivery.id,'name',v_delivery.name,'active',v_delivery.active,'city_id',v_delivery.city_id
    ),
    'city',case when v_city.id is null then null else jsonb_build_object(
      'id',v_city.id,'name',v_city.name,'province',v_city.province,'country',v_city.country,'active',v_city.active
    ) end,
    'current_zones',coalesce(v_current,0),
    'max_zones',v_limit,
    'selection_reset_pending',v_reset_pending,
    'zones',coalesce(v_zones,'[]'::jsonb)
  );
end;
$$;
