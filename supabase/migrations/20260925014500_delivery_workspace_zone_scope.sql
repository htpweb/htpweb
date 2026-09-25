-- HTPWEB DELIVERY workspace + strict zone scoping
-- 2026-09-24

create or replace function public.local_is_public(p_local_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.locals l
    join public.zones z
      on z.id = l.zone_id
     and z.active = true
    join public.delivery_zones dz
      on dz.zone_id = z.id
     and dz.active = true
    join public.deliveries d
      on d.id = dz.delivery_id
     and d.active = true
    where l.id = p_local_id
      and l.active = true
  );
$$;

create or replace function public.local_delivery_is_public(p_local_id uuid, p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.htp_delivery_covers_local(p_delivery_id, p_local_id);
$$;

create or replace function public.user_can_access_local(p_local_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_local_id is not null
    and (
      public.is_master()
      or (
        public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
        and exists (
          select 1
          from public.user_deliveries ud
          join public.deliveries d
            on d.id = ud.delivery_id
           and d.active = true
          where ud.user_id = auth.uid()
            and ud.active = true
            and public.htp_delivery_covers_local(ud.delivery_id, p_local_id)
        )
      )
      or (
        public.current_role_code() = 'LOCAL_ADMIN'
        and exists (
          select 1
          from public.user_locals ul
          join public.locals l
            on l.id = ul.local_id
           and l.active = true
          where ul.user_id = auth.uid()
            and ul.local_id = p_local_id
            and ul.active = true
        )
      )
    );
$$;

create or replace function public.htp_delivery_scope(p_local uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then public.user_can_access_local(p_local)
    else true
  end;
$$;

create or replace function public.delivery_zone_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery record;
  v_city record;
  v_current integer;
  v_limit integer;
  v_capability boolean;
  v_zones jsonb;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select d.id,d.name,d.active,d.city_id
  into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id;

  if not found then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

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
    where c.id = v_delivery.city_id;
  end if;

  select count(*)::integer
  into v_current
  from public.delivery_zones dz
  where dz.delivery_id = p_delivery_id
    and dz.active = true;

  v_limit := public.delivery_limit_value(p_delivery_id,'max_zones');
  v_capability := public.delivery_has_capability(p_delivery_id,'zones.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,
    'code',z.code,
    'name',z.name,
    'city_id',z.city_id,
    'city_name',c.name,
    'province',c.province,
    'active',z.active,
    'assigned',coalesce(dz.active,false),
    'local_count',(
      select count(*)
      from public.locals l
      where l.zone_id = z.id
        and l.active = true
    )
  ) order by z.code,lower(z.name),z.id),'[]'::jsonb)
  into v_zones
  from public.zones z
  join public.cities c on c.id = z.city_id
  left join public.delivery_zones dz
    on dz.delivery_id = p_delivery_id
   and dz.zone_id = z.id
  where z.active = true
    and v_delivery.city_id is not null
    and z.city_id = v_delivery.city_id;

  return jsonb_build_object(
    'delivery',jsonb_build_object(
      'id',v_delivery.id,
      'name',v_delivery.name,
      'active',v_delivery.active,
      'city_id',v_delivery.city_id
    ),
    'city',case when v_city.id is null then null else jsonb_build_object(
      'id',v_city.id,
      'name',v_city.name,
      'province',v_city.province,
      'country',v_city.country,
      'active',v_city.active
    ) end,
    'current_zones',coalesce(v_current,0),
    'max_zones',v_limit,
    'zones_manage_enabled',coalesce(v_capability,false),
    'zones',coalesce(v_zones,'[]'::jsonb)
  );
end;
$$;

create or replace function public.validate_delivery_zone_row_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_active boolean;
  v_delivery_city uuid;
  v_zone_active boolean;
  v_zone_city uuid;
begin
  if new.active is not true then
    return new;
  end if;

  select d.active,d.city_id
  into v_delivery_active,v_delivery_city
  from public.deliveries d
  where d.id = new.delivery_id;

  if not found then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select z.active,z.city_id
  into v_zone_active,v_zone_city
  from public.zones z
  where z.id = new.zone_id;

  if not found then
    raise exception 'HTPWEB: zona inexistente';
  end if;

  if v_delivery_active is not true then
    raise exception 'HTPWEB: DELIVERY inactivo';
  end if;

  if v_zone_active is not true then
    raise exception 'HTPWEB: zona inactiva';
  end if;

  if v_delivery_city is null then
    raise exception 'HTPWEB: asigne una ciudad al DELIVERY antes de asignar zonas';
  end if;

  if v_zone_city is distinct from v_delivery_city then
    raise exception 'HTPWEB: el DELIVERY solo puede operar en zonas de su ciudad';
  end if;

  return new;
end;
$$;

create or replace function public.htp_validate_local_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active is true
     and not public.htp_delivery_covers_local(new.delivery_id,new.local_id)
  then
    raise exception 'HTPWEB: un DELIVERY solo puede vincularse a LOCAL de sus zonas activas';
  end if;
  return new;
end;
$$;

drop trigger if exists htp_validate_local_delivery_zone on public.local_deliveries;
create trigger htp_validate_local_delivery_zone
before insert or update of local_id,delivery_id,active
on public.local_deliveries
for each row
execute function public.htp_validate_local_delivery_zone();

create or replace function public.delivery_local_request_options(p_delivery_id uuid, p_mode text)
returns table(id uuid, name text, address text, phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: se requiere autenticación';
  end if;

  if p_delivery_id is null then
    raise exception 'HTPWEB: se requiere delivery_id';
  end if;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
      and d.active = true
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  if not public.is_master() then
    if not public.has_permission('locals.request') then
      raise exception 'HTPWEB: no tiene permiso locals.request';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece al DELIVERY';
    end if;
  end if;

  v_mode := upper(trim(coalesce(p_mode,'')));

  if v_mode = 'LINK_EXISTING' then
    return query
    select l.id,l.name,l.address,l.phone
    from public.locals l
    where l.active = true
      and public.htp_delivery_covers_local(p_delivery_id,l.id)
      and not exists (
        select 1
        from public.local_deliveries ld
        where ld.delivery_id = p_delivery_id
          and ld.local_id = l.id
          and ld.active = true
      )
    order by lower(l.name),l.id;
    return;
  end if;

  if v_mode = 'RELATED' then
    return query
    select l.id,l.name,l.address,l.phone
    from public.locals l
    where l.active = true
      and public.htp_delivery_covers_local(p_delivery_id,l.id)
    order by lower(l.name),l.id;
    return;
  end if;

  raise exception 'HTPWEB: modo inválido para opciones de LOCAL';
end;
$$;

drop policy if exists htp_local_zone_scope on public.locals;
drop policy if exists htp_category_zone_scope on public.categories;
drop policy if exists htp_product_zone_scope on public.products;
drop policy if exists htp_relation_zone_scope on public.local_deliveries;

drop policy if exists locals_select_authenticated on public.locals;
create policy locals_select_authenticated
on public.locals for select to authenticated
using (
  case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then public.user_can_access_local(id)
    else public.local_is_public(id) or public.user_can_access_local(id)
  end
);

drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated
on public.categories for select to authenticated
using (
  case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then public.user_can_access_local(local_id)
    else (active = true and public.local_is_public(local_id))
         or public.user_can_access_local(local_id)
  end
);

drop policy if exists products_select_authenticated on public.products;
create policy products_select_authenticated
on public.products for select to authenticated
using (
  case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then public.user_can_access_local(local_id)
    else (active = true and public.local_is_public(local_id))
         or public.user_can_access_local(local_id)
  end
);

drop policy if exists product_variants_select_authenticated on public.product_variants;
create policy product_variants_select_authenticated
on public.product_variants for select to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_variants.product_id
      and (
        case
          when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
            then public.user_can_access_local(p.local_id)
          else (
            (product_variants.active = true and p.active = true and public.local_is_public(p.local_id))
            or public.user_can_access_local(p.local_id)
          )
        end
      )
  )
);

drop policy if exists local_schedules_select_authenticated on public.local_schedules;
create policy local_schedules_select_authenticated
on public.local_schedules for select to authenticated
using (
  case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then public.user_can_access_local(local_id)
    else public.local_is_public(local_id) or public.user_can_access_local(local_id)
  end
);

drop policy if exists local_deliveries_select_authenticated on public.local_deliveries;
create policy local_deliveries_select_authenticated
on public.local_deliveries for select to authenticated
using (
  case
    when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      then exists (
        select 1
        from public.user_deliveries ud
        where ud.user_id = auth.uid()
          and ud.delivery_id = local_deliveries.delivery_id
          and ud.active = true
          and public.htp_delivery_covers_local(local_deliveries.delivery_id,local_deliveries.local_id)
      )
    else public.local_delivery_is_public(local_id,delivery_id)
         or public.user_can_access_local(local_id)
  end
);

create or replace function public.master_save_delivery_workspace(
  p_delivery_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_phone text,
  p_whatsapp text,
  p_city_id uuid,
  p_active boolean,
  p_admin_user_id uuid,
  p_convert_customer boolean,
  p_zone_ids uuid[],
  p_fee_mode text,
  p_fixed_fee numeric,
  p_day_start_time time,
  p_night_start_time time,
  p_day_rate numeric,
  p_night_rate numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_zone uuid;
  v_existing record;
  v_mode text := upper(trim(coalesce(p_fee_mode,'FIXED')));
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_city_id is null then
    raise exception 'HTPWEB: seleccione la ciudad del DELIVERY';
  end if;

  if not exists (
    select 1 from public.cities c
    where c.id = p_city_id and c.active = true
  ) then
    raise exception 'HTPWEB: ciudad inexistente o inactiva';
  end if;

  if v_mode not in ('FIXED','DISTANCE') then
    raise exception 'HTPWEB: modo de tarifa inválido';
  end if;

  if coalesce(p_fixed_fee,0) < 0
     or coalesce(p_day_rate,0) < 0
     or coalesce(p_night_rate,0) < 0 then
    raise exception 'HTPWEB: las tarifas no pueden ser negativas';
  end if;

  if p_day_start_time is null or p_night_start_time is null
     or p_day_start_time >= p_night_start_time then
    raise exception 'HTPWEB: horario Día/Noche inválido';
  end if;

  foreach v_zone in array coalesce(p_zone_ids,'{}'::uuid[])
  loop
    if not exists (
      select 1 from public.zones z
      where z.id = v_zone
        and z.active = true
        and z.city_id = p_city_id
    ) then
      raise exception 'HTPWEB: todas las zonas deben pertenecer a la ciudad del DELIVERY';
    end if;
  end loop;

  v_delivery_id := public.master_save_delivery(
    p_delivery_id,
    p_name,
    p_slug,
    p_description,
    null,
    p_phone,
    p_whatsapp,
    p_city_id,
    coalesce(p_active,true)
  );

  perform public.master_set_delivery_capability(v_delivery_id,'delivery.info.manage',true);
  perform public.master_set_delivery_capability(v_delivery_id,'zones.manage',true);
  perform public.master_set_delivery_capability(v_delivery_id,'delivery_fees.manage',true);

  if p_admin_user_id is not null then
    perform public.master_assign_delivery_user(
      p_admin_user_id,
      v_delivery_id,
      'DELIVERY_ADMIN',
      coalesce(p_convert_customer,false)
    );
  end if;

  for v_existing in
    select dz.zone_id
    from public.delivery_zones dz
    where dz.delivery_id = v_delivery_id
      and dz.active = true
      and not (dz.zone_id = any(coalesce(p_zone_ids,'{}'::uuid[])))
  loop
    perform public.set_delivery_zone(v_delivery_id,v_existing.zone_id,false);
  end loop;

  foreach v_zone in array coalesce(p_zone_ids,'{}'::uuid[])
  loop
    perform public.set_delivery_zone(v_delivery_id,v_zone,true);
  end loop;

  perform public.save_delivery_fee_config(
    v_delivery_id,
    v_mode,
    case when v_mode='FIXED' then coalesce(p_fixed_fee,0) else 0 end,
    true
  );

  perform public.save_delivery_fee_schedule(
    v_delivery_id,
    p_day_start_time,
    p_night_start_time
  );

  if v_mode = 'DISTANCE' then
    perform public.save_delivery_distance_rate(v_delivery_id,'DAY',coalesce(p_day_rate,0),true);
    perform public.save_delivery_distance_rate(v_delivery_id,'NIGHT',coalesce(p_night_rate,0),true);
  end if;

  return v_delivery_id;
end;
$$;

grant execute on function public.master_save_delivery_workspace(
  uuid,text,text,text,text,text,uuid,boolean,uuid,boolean,uuid[],text,numeric,time,time,numeric,numeric
) to authenticated;

select public.htp_refresh_zone_links();
