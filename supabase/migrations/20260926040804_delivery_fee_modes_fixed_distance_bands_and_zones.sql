
insert into public.capabilities(code,name,description,scope,active)
values('delivery_fees.zone','Tarifa por zonas','Permite cobrar según la relación entre la zona del LOCAL y la zona del destino.','DELIVERY',true)
on conflict(code) do update set name=excluded.name,description=excluded.description,scope=excluded.scope,active=true;

insert into public.plan_feature_catalog(code,entitlement_type,family,label,description,stage,unit,active,display_order,created_at,updated_at)
values('delivery_fees.zone','CAPABILITY','Tarifas','Tarifa por zonas','Permite tarifa simple por misma/otra zona o detallada por combinación de zonas.',1,null,true,115,now(),now())
on conflict(code) do update set entitlement_type=excluded.entitlement_type,family=excluded.family,label=excluded.label,description=excluded.description,stage=excluded.stage,unit=excluded.unit,active=true,display_order=excluded.display_order,updated_at=now();

insert into public.plan_entitlements(plan_id,entitlement_type,code,value,created_at,updated_at)
select sp.id,'CAPABILITY','delivery_fees.zone','true'::jsonb,now(),now()
from public.subscription_plans sp where sp.code='PLA_02'
on conflict(plan_id,entitlement_type,code) do update set value='true'::jsonb,updated_at=now();

insert into public.plan_assignment_entitlements(assignment_id,entitlement_type,code,value,created_at)
select pa.id,'CAPABILITY','delivery_fees.zone','true'::jsonb,now()
from public.plan_assignments pa join public.subscription_plans sp on sp.id=pa.plan_id
where sp.code='PLA_02' and pa.status='ACTIVE'
on conflict(assignment_id,entitlement_type,code) do update set value='true'::jsonb;

update public.subscription_plans set plan_version=plan_version+1,updated_at=now() where code='PLA_02';
update public.plan_assignments pa set plan_version_snapshot=sp.plan_version,updated_at=now()
from public.subscription_plans sp
where pa.plan_id=sp.id and sp.code='PLA_02' and pa.status='ACTIVE';

alter table public.delivery_fee_configs
  add column if not exists fixed_day_fee numeric(12,2),
  add column if not exists fixed_night_fee numeric(12,2),
  add column if not exists zone_pricing_mode text not null default 'SIMPLE';

update public.delivery_fee_configs
set fixed_day_fee=coalesce(fixed_day_fee,fixed_fee),
    fixed_night_fee=coalesce(fixed_night_fee,fixed_fee)
where fixed_day_fee is null or fixed_night_fee is null;

alter table public.delivery_fee_configs
  alter column fixed_day_fee set default 0,
  alter column fixed_day_fee set not null,
  alter column fixed_night_fee set default 0,
  alter column fixed_night_fee set not null;

alter table public.delivery_fee_configs drop constraint if exists delivery_fee_mode_check;
alter table public.delivery_fee_configs add constraint delivery_fee_mode_check check(mode in ('FIXED','DISTANCE','ZONE'));
alter table public.delivery_fee_configs drop constraint if exists delivery_fee_fixed_day_check;
alter table public.delivery_fee_configs add constraint delivery_fee_fixed_day_check check(fixed_day_fee>=0);
alter table public.delivery_fee_configs drop constraint if exists delivery_fee_fixed_night_check;
alter table public.delivery_fee_configs add constraint delivery_fee_fixed_night_check check(fixed_night_fee>=0);
alter table public.delivery_fee_configs drop constraint if exists delivery_fee_zone_pricing_mode_check;
alter table public.delivery_fee_configs add constraint delivery_fee_zone_pricing_mode_check check(zone_pricing_mode in ('SIMPLE','DETAILED'));

alter table public.orders drop constraint if exists orders_delivery_fee_mode_check;
alter table public.orders add constraint orders_delivery_fee_mode_check check(delivery_fee_mode is null or delivery_fee_mode in ('FIXED','DISTANCE','ZONE','MIXED'));
alter table public.order_locals drop constraint if exists order_locals_delivery_fee_mode_check;
alter table public.order_locals add constraint order_locals_delivery_fee_mode_check check(delivery_fee_mode is null or delivery_fee_mode in ('FIXED','DISTANCE','ZONE'));

create table if not exists public.delivery_fee_distance_bands(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  position integer not null,
  max_distance_km numeric(10,2),
  day_fee numeric(12,2) not null,
  night_fee numeric(12,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_distance_bands_position_check check(position>=1),
  constraint delivery_fee_distance_bands_max_check check(max_distance_km is null or max_distance_km>0),
  constraint delivery_fee_distance_bands_day_check check(day_fee>=0),
  constraint delivery_fee_distance_bands_night_check check(night_fee>=0),
  constraint delivery_fee_distance_bands_delivery_position_key unique(delivery_id,position)
);
create unique index if not exists delivery_fee_distance_bands_one_infinite on public.delivery_fee_distance_bands(delivery_id) where max_distance_km is null and active=true;

create table if not exists public.delivery_fee_zone_simple(
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  same_zone_day_fee numeric(12,2),
  same_zone_night_fee numeric(12,2),
  other_zone_day_fee numeric(12,2),
  other_zone_night_fee numeric(12,2),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_zone_simple_same_day_check check(same_zone_day_fee is null or same_zone_day_fee>=0),
  constraint delivery_fee_zone_simple_same_night_check check(same_zone_night_fee is null or same_zone_night_fee>=0),
  constraint delivery_fee_zone_simple_other_day_check check(other_zone_day_fee is null or other_zone_day_fee>=0),
  constraint delivery_fee_zone_simple_other_night_check check(other_zone_night_fee is null or other_zone_night_fee>=0)
);

create table if not exists public.delivery_fee_zone_rates(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  origin_zone_id uuid not null references public.zones(id) on delete cascade,
  destination_zone_id uuid not null references public.zones(id) on delete cascade,
  day_fee numeric(12,2) not null,
  night_fee numeric(12,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_zone_rates_day_check check(day_fee>=0),
  constraint delivery_fee_zone_rates_night_check check(night_fee>=0),
  constraint delivery_fee_zone_rates_pair_key unique(delivery_id,origin_zone_id,destination_zone_id)
);

alter table public.delivery_fee_distance_bands enable row level security;
alter table public.delivery_fee_zone_simple enable row level security;
alter table public.delivery_fee_zone_rates enable row level security;

drop policy if exists delivery_fee_distance_bands_select_authorized on public.delivery_fee_distance_bands;
create policy delivery_fee_distance_bands_select_authorized on public.delivery_fee_distance_bands for select
using(public.is_master() or (public.has_permission('delivery_fees.manage') and public.user_has_delivery(delivery_id)));

drop policy if exists delivery_fee_zone_simple_select_authorized on public.delivery_fee_zone_simple;
create policy delivery_fee_zone_simple_select_authorized on public.delivery_fee_zone_simple for select
using(public.is_master() or (public.has_permission('delivery_fees.manage') and public.user_has_delivery(delivery_id)));

drop policy if exists delivery_fee_zone_rates_select_authorized on public.delivery_fee_zone_rates;
create policy delivery_fee_zone_rates_select_authorized on public.delivery_fee_zone_rates for select
using(public.is_master() or (public.has_permission('delivery_fees.manage') and public.user_has_delivery(delivery_id)));

create or replace function public.delivery_fee_mode_enabled(p_delivery_id uuid,p_mode text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_code text;
begin
  v_code:=case upper(trim(coalesce(p_mode,'')))
    when 'FIXED' then 'delivery_fees.fixed'
    when 'DISTANCE' then 'delivery_fees.distance'
    when 'ZONE' then 'delivery_fees.zone'
    else null end;
  if v_code is null then return false; end if;
  return public.delivery_has_capability(p_delivery_id,v_code);
end; $$;

create or replace function public.delivery_fee_capability_status(p_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
  if not (public.is_master() or public.user_has_delivery(p_delivery_id)) then
    raise exception 'HTPWEB: no autorizado para consultar las modalidades de tarifa';
  end if;
  return jsonb_build_object(
    'fixed',public.delivery_has_capability(p_delivery_id,'delivery_fees.fixed'),
    'distance',public.delivery_has_capability(p_delivery_id,'delivery_fees.distance'),
    'zone',public.delivery_has_capability(p_delivery_id,'delivery_fees.zone'),
    'day_night',public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night')
  );
end; $$;

create or replace function public.delivery_fee_workspace(p_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_config jsonb;
begin
  if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
  if not (public.is_master() or (public.user_has_delivery(p_delivery_id) and public.has_permission('delivery_fees.manage'))) then
    raise exception 'HTPWEB: no autorizado para consultar tarifas';
  end if;

  select jsonb_build_object(
    'mode',c.mode,'fixed_day_fee',c.fixed_day_fee,'fixed_night_fee',c.fixed_night_fee,
    'day_start_time',c.day_start_time,'night_start_time',c.night_start_time,
    'zone_pricing_mode',c.zone_pricing_mode,'active',c.active
  ) into v_config
  from public.delivery_fee_configs c where c.delivery_id=p_delivery_id;

  return jsonb_build_object(
    'capabilities',public.delivery_fee_capability_status(p_delivery_id),
    'config',v_config,
    'distance_bands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'position',b.position,'max_distance_km',b.max_distance_km,
        'day_fee',b.day_fee,'night_fee',b.night_fee
      ) order by b.position)
      from public.delivery_fee_distance_bands b
      where b.delivery_id=p_delivery_id and b.active=true
    ),'[]'::jsonb),
    'zone_simple',(
      select jsonb_build_object(
        'same_zone_day_fee',s.same_zone_day_fee,'same_zone_night_fee',s.same_zone_night_fee,
        'other_zone_day_fee',s.other_zone_day_fee,'other_zone_night_fee',s.other_zone_night_fee
      )
      from public.delivery_fee_zone_simple s where s.delivery_id=p_delivery_id
    ),
    'zone_rates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'origin_zone_id',r.origin_zone_id,'destination_zone_id',r.destination_zone_id,
        'day_fee',r.day_fee,'night_fee',r.night_fee
      ) order by oz.code,dz.code)
      from public.delivery_fee_zone_rates r
      join public.zones oz on oz.id=r.origin_zone_id
      join public.zones dz on dz.id=r.destination_zone_id
      where r.delivery_id=p_delivery_id and r.active=true
    ),'[]'::jsonb),
    'zones',coalesce((
      select jsonb_agg(jsonb_build_object('id',z.id,'code',z.code,'name',z.name) order by z.code,z.name)
      from public.delivery_zones ddz
      join public.zones z on z.id=ddz.zone_id
      where ddz.delivery_id=p_delivery_id and ddz.active=true and z.active=true
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.save_delivery_fixed_fees(p_delivery_id uuid,p_day_fee numeric,p_night_fee numeric)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'FIXED');
  if p_day_fee is null or p_day_fee<0 or p_night_fee is null or p_night_fee<0 then
    raise exception 'HTPWEB: las tarifas Día y Noche deben ser iguales o mayores a 0';
  end if;
  insert into public.delivery_fee_configs(delivery_id,mode,fixed_fee,fixed_day_fee,fixed_night_fee,active,created_at,updated_at)
  values(p_delivery_id,'FIXED',round(p_day_fee,2),round(p_day_fee,2),round(p_night_fee,2),false,now(),now())
  on conflict(delivery_id) do update set fixed_fee=excluded.fixed_fee,fixed_day_fee=excluded.fixed_day_fee,fixed_night_fee=excluded.fixed_night_fee,updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.save_delivery_fee_schedule(p_delivery_id uuid,p_day_start_time time without time zone,p_night_start_time time without time zone)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_mode text;
begin
  if public.current_role_code() is distinct from 'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('delivery_fees.manage')
     or not public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night')
  then raise exception 'HTPWEB: tu plan no permite configurar tarifas Día/Noche'; end if;

  if p_day_start_time is null or p_night_start_time is null then raise exception 'HTPWEB: debe indicar inicio de tarifa diurna y nocturna'; end if;
  if p_day_start_time>=p_night_start_time then raise exception 'HTPWEB: el inicio diurno debe ser anterior al inicio nocturno'; end if;

  select c.mode into v_mode from public.delivery_fee_configs c where c.delivery_id=p_delivery_id;
  if v_mode is null then
    v_mode:=case
      when public.delivery_has_capability(p_delivery_id,'delivery_fees.fixed') then 'FIXED'
      when public.delivery_has_capability(p_delivery_id,'delivery_fees.distance') then 'DISTANCE'
      else 'ZONE' end;
    insert into public.delivery_fee_configs(delivery_id,mode,fixed_fee,fixed_day_fee,fixed_night_fee,day_start_time,night_start_time,active)
    values(p_delivery_id,v_mode,0,0,0,p_day_start_time,p_night_start_time,false)
    returning id into v_id;
  else
    update public.delivery_fee_configs set day_start_time=p_day_start_time,night_start_time=p_night_start_time,updated_at=now()
    where delivery_id=p_delivery_id returning id into v_id;
  end if;
  return v_id;
end; $$;

create or replace function public.delivery_replace_distance_bands(p_delivery_id uuid,p_bands jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare v jsonb; v_idx integer:=0; v_len integer; v_max numeric; v_prev numeric:=0; v_day numeric; v_night numeric;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'DISTANCE');
  if p_bands is null or jsonb_typeof(p_bands)<>'array' then raise exception 'HTPWEB: rangos de distancia inválidos'; end if;
  v_len:=jsonb_array_length(p_bands);
  if v_len<1 then raise exception 'HTPWEB: configura al menos un rango de distancia'; end if;

  for v in select value from jsonb_array_elements(p_bands) loop
    v_idx:=v_idx+1;
    v_max:=nullif(v->>'max_distance_km','')::numeric;
    v_day:=nullif(v->>'day_fee','')::numeric;
    v_night:=nullif(v->>'night_fee','')::numeric;
    if v_day is null or v_day<0 or v_night is null or v_night<0 then raise exception 'HTPWEB: cada rango debe tener precio Día y Noche'; end if;
    if v_idx<v_len and v_max is null then raise exception 'HTPWEB: solo el último rango puede ser Sin límite'; end if;
    if v_idx=v_len and v_max is not null then raise exception 'HTPWEB: el último rango debe ser Sin límite'; end if;
    if v_max is not null and v_max<=v_prev then raise exception 'HTPWEB: los límites de distancia deben aumentar en cada fila'; end if;
    if v_max is not null then v_prev:=v_max; end if;
  end loop;

  insert into public.delivery_fee_configs(delivery_id,mode,fixed_fee,fixed_day_fee,fixed_night_fee,active)
  values(p_delivery_id,'DISTANCE',0,0,0,false) on conflict(delivery_id) do nothing;

  delete from public.delivery_fee_distance_bands where delivery_id=p_delivery_id;
  v_idx:=0;
  for v in select value from jsonb_array_elements(p_bands) loop
    v_idx:=v_idx+1;
    insert into public.delivery_fee_distance_bands(delivery_id,position,max_distance_km,day_fee,night_fee,active)
    values(p_delivery_id,v_idx,nullif(v->>'max_distance_km','')::numeric,round((v->>'day_fee')::numeric,2),round((v->>'night_fee')::numeric,2),true);
  end loop;
  return v_len;
end; $$;

create or replace function public.save_delivery_zone_simple(p_delivery_id uuid,p_same_day numeric,p_same_night numeric,p_other_day numeric,p_other_night numeric)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'ZONE');
  if p_same_day is null or p_same_day<0 or p_same_night is null or p_same_night<0 or p_other_day is null or p_other_day<0 or p_other_night is null or p_other_night<0
  then raise exception 'HTPWEB: completa los cuatro precios de tarifa por zonas'; end if;

  insert into public.delivery_fee_configs(delivery_id,mode,fixed_fee,fixed_day_fee,fixed_night_fee,zone_pricing_mode,active)
  values(p_delivery_id,'ZONE',0,0,0,'SIMPLE',false)
  on conflict(delivery_id) do update set zone_pricing_mode='SIMPLE',updated_at=now()
  returning id into v_id;

  insert into public.delivery_fee_zone_simple(delivery_id,same_zone_day_fee,same_zone_night_fee,other_zone_day_fee,other_zone_night_fee,updated_at)
  values(p_delivery_id,round(p_same_day,2),round(p_same_night,2),round(p_other_day,2),round(p_other_night,2),now())
  on conflict(delivery_id) do update set same_zone_day_fee=excluded.same_zone_day_fee,same_zone_night_fee=excluded.same_zone_night_fee,other_zone_day_fee=excluded.other_zone_day_fee,other_zone_night_fee=excluded.other_zone_night_fee,updated_at=now();
  return v_id;
end; $$;

create or replace function public.delivery_replace_zone_rates(p_delivery_id uuid,p_rates jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare v jsonb; v_origin uuid; v_destination uuid; v_day numeric; v_night numeric; v_zone_count integer; v_required integer; v_count integer:=0;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'ZONE');
  if p_rates is null or jsonb_typeof(p_rates)<>'array' then raise exception 'HTPWEB: matriz de zonas inválida'; end if;

  select count(*)::integer into v_zone_count
  from public.delivery_zones dz join public.zones z on z.id=dz.zone_id
  where dz.delivery_id=p_delivery_id and dz.active=true and z.active=true;
  v_required:=v_zone_count*v_zone_count;

  if v_required<=0 then raise exception 'HTPWEB: no existen zonas activas para configurar'; end if;
  if jsonb_array_length(p_rates)<>v_required then raise exception 'HTPWEB: completa todas las combinaciones de zonas antes de guardar'; end if;

  delete from public.delivery_fee_zone_rates where delivery_id=p_delivery_id;

  for v in select value from jsonb_array_elements(p_rates) loop
    v_origin:=(v->>'origin_zone_id')::uuid;
    v_destination:=(v->>'destination_zone_id')::uuid;
    v_day:=nullif(v->>'day_fee','')::numeric;
    v_night:=nullif(v->>'night_fee','')::numeric;
    if v_day is null or v_day<0 or v_night is null or v_night<0 then raise exception 'HTPWEB: completa precio Día y Noche para todas las combinaciones'; end if;

    if not exists(select 1 from public.delivery_zones dz join public.zones z on z.id=dz.zone_id where dz.delivery_id=p_delivery_id and dz.zone_id=v_origin and dz.active=true and z.active=true)
       or not exists(select 1 from public.delivery_zones dz join public.zones z on z.id=dz.zone_id where dz.delivery_id=p_delivery_id and dz.zone_id=v_destination and dz.active=true and z.active=true)
    then raise exception 'HTPWEB: la matriz contiene una zona que no está activa para este DELIVERY'; end if;

    insert into public.delivery_fee_zone_rates(delivery_id,origin_zone_id,destination_zone_id,day_fee,night_fee,active)
    values(p_delivery_id,v_origin,v_destination,round(v_day,2),round(v_night,2),true);
    v_count:=v_count+1;
  end loop;

  update public.delivery_fee_configs set zone_pricing_mode='DETAILED',updated_at=now() where delivery_id=p_delivery_id;
  if not found then
    insert into public.delivery_fee_configs(delivery_id,mode,fixed_fee,fixed_day_fee,fixed_night_fee,zone_pricing_mode,active)
    values(p_delivery_id,'ZONE',0,0,0,'DETAILED',false);
  end if;
  return v_count;
end; $$;

create or replace function public.delivery_activate_fee_mode(p_delivery_id uuid,p_mode text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_mode text:=upper(trim(coalesce(p_mode,''))); v_config record; v_zone_count integer; v_required integer; v_configured integer;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,v_mode);
  select * into v_config from public.delivery_fee_configs where delivery_id=p_delivery_id;
  if v_config.id is null then raise exception 'HTPWEB: primero configura esta modalidad de tarifa'; end if;

  if v_mode='FIXED' then
    if v_config.fixed_day_fee is null or v_config.fixed_night_fee is null then raise exception 'HTPWEB: primero configura la tarifa fija Día y Noche'; end if;
  elsif v_mode='DISTANCE' then
    if not exists(select 1 from public.delivery_fee_distance_bands b where b.delivery_id=p_delivery_id and b.active=true)
       or not exists(select 1 from public.delivery_fee_distance_bands b where b.delivery_id=p_delivery_id and b.active=true and b.max_distance_km is null)
    then raise exception 'HTPWEB: configura los rangos por distancia y finaliza con Sin límite'; end if;
  elsif v_mode='ZONE' then
    if v_config.zone_pricing_mode='SIMPLE' then
      if not exists(select 1 from public.delivery_fee_zone_simple s where s.delivery_id=p_delivery_id and s.same_zone_day_fee is not null and s.same_zone_night_fee is not null and s.other_zone_day_fee is not null and s.other_zone_night_fee is not null)
      then raise exception 'HTPWEB: completa la tarifa simple por zonas'; end if;
    else
      select count(*)::integer into v_zone_count
      from public.delivery_zones dz join public.zones z on z.id=dz.zone_id
      where dz.delivery_id=p_delivery_id and dz.active=true and z.active=true;
      v_required:=v_zone_count*v_zone_count;

      select count(*)::integer into v_configured
      from public.delivery_fee_zone_rates r
      where r.delivery_id=p_delivery_id and r.active=true
        and exists(select 1 from public.delivery_zones d1 join public.zones z1 on z1.id=d1.zone_id where d1.delivery_id=p_delivery_id and d1.zone_id=r.origin_zone_id and d1.active=true and z1.active=true)
        and exists(select 1 from public.delivery_zones d2 join public.zones z2 on z2.id=d2.zone_id where d2.delivery_id=p_delivery_id and d2.zone_id=r.destination_zone_id and d2.active=true and z2.active=true);

      if v_required<=0 or v_configured<>v_required then raise exception 'HTPWEB: completa toda la matriz de zonas antes de activarla'; end if;
    end if;
  end if;

  update public.delivery_fee_configs set mode=v_mode,active=true,updated_at=now() where delivery_id=p_delivery_id;
  return v_mode;
end; $$;

create or replace function public.calculate_delivery_fee_at(p_delivery_id uuid,p_distance_km numeric,p_at timestamptz)
returns numeric language plpgsql security definer set search_path=''
as $$
declare v_config record; v_now time; v_period text; v_fee numeric;
begin
  if p_delivery_id is null then raise exception 'delivery_id es obligatorio'; end if;
  if p_distance_km is null or p_distance_km<0 then raise exception 'La distancia debe ser mayor o igual a 0 km'; end if;
  if p_at is null then raise exception 'La fecha/hora de cálculo es obligatoria'; end if;

  select * into v_config from public.delivery_fee_configs where delivery_id=p_delivery_id and active=true limit 1;
  if v_config.id is null then raise exception 'El delivery no tiene una configuración de tarifa activa'; end if;
  if not public.delivery_fee_mode_enabled(p_delivery_id,v_config.mode) then raise exception 'La modalidad de tarifa % no está habilitada por el plan para este DELIVERY',v_config.mode; end if;

  v_now:=(p_at at time zone 'America/Guayaquil')::time;
  v_period:=case when public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night') and not (v_now>=v_config.day_start_time and v_now<v_config.night_start_time) then 'NIGHT' else 'DAY' end;

  if v_config.mode='FIXED' then
    return (case when v_period='NIGHT' then v_config.fixed_night_fee else v_config.fixed_day_fee end)::numeric(12,2);
  elsif v_config.mode='DISTANCE' then
    select case when v_period='NIGHT' then b.night_fee else b.day_fee end into v_fee
    from public.delivery_fee_distance_bands b
    where b.delivery_id=p_delivery_id and b.active=true and (b.max_distance_km is null or p_distance_km<=b.max_distance_km)
    order by b.max_distance_km nulls last,b.position limit 1;
    if v_fee is null then raise exception 'No existe un rango de tarifa para la distancia indicada'; end if;
    return round(v_fee,2)::numeric(12,2);
  elsif v_config.mode='ZONE' then
    raise exception 'La tarifa por zonas requiere LOCAL y ubicación de destino';
  end if;
  raise exception 'Modo de tarifa no válido para el delivery: %',v_config.mode;
end; $$;

create or replace function public.calculate_delivery_fee_for_order(
  p_delivery_id uuid,p_local_id uuid,p_distance_km numeric,p_latitude numeric,p_longitude numeric,p_at timestamptz default now()
)
returns numeric language plpgsql security definer set search_path=''
as $$
declare v_config record; v_origin_zone uuid; v_destination_zone uuid; v_now time; v_period text; v_fee numeric;
begin
  if p_local_id is null then raise exception 'local_id es obligatorio'; end if;
  if p_latitude is null or p_longitude is null then raise exception 'La ubicación del destino es obligatoria'; end if;

  select * into v_config from public.delivery_fee_configs where delivery_id=p_delivery_id and active=true limit 1;
  if v_config.id is null then raise exception 'El delivery no tiene una configuración de tarifa activa'; end if;

  if v_config.mode<>'ZONE' then
    return public.calculate_delivery_fee_at(p_delivery_id,p_distance_km,p_at);
  end if;
  if not public.delivery_fee_mode_enabled(p_delivery_id,'ZONE') then raise exception 'La tarifa por zonas no está habilitada por el plan para este DELIVERY'; end if;

  v_now:=(p_at at time zone 'America/Guayaquil')::time;
  v_period:=case when public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night') and not (v_now>=v_config.day_start_time and v_now<v_config.night_start_time) then 'NIGHT' else 'DAY' end;

  select l.zone_id into v_origin_zone from public.locals l where l.id=p_local_id and l.active=true;
  if v_origin_zone is null then raise exception 'HTPWEB: el LOCAL no tiene una zona válida'; end if;

  select z.id into v_destination_zone
  from public.delivery_zones dz join public.zones z on z.id=dz.zone_id
  where dz.delivery_id=p_delivery_id and dz.active=true and z.active=true and z.boundary is not null
    and public.htp_zone_contains(z.boundary,p_latitude,p_longitude)
  order by case when z.id=v_origin_zone then 0 else 1 end,z.code
  limit 1;
  if v_destination_zone is null then raise exception 'HTPWEB: el destino no pertenece a una zona activa del DELIVERY'; end if;

  if v_config.zone_pricing_mode='SIMPLE' then
    select case
      when v_origin_zone=v_destination_zone and v_period='NIGHT' then s.same_zone_night_fee
      when v_origin_zone=v_destination_zone then s.same_zone_day_fee
      when v_period='NIGHT' then s.other_zone_night_fee
      else s.other_zone_day_fee end
    into v_fee from public.delivery_fee_zone_simple s where s.delivery_id=p_delivery_id;
  else
    select case when v_period='NIGHT' then r.night_fee else r.day_fee end into v_fee
    from public.delivery_fee_zone_rates r
    where r.delivery_id=p_delivery_id and r.origin_zone_id=v_origin_zone and r.destination_zone_id=v_destination_zone and r.active=true
    limit 1;
  end if;

  if v_fee is null then raise exception 'HTPWEB: no existe una tarifa configurada para esta combinación de zonas'; end if;
  return round(v_fee,2)::numeric(12,2);
end; $$;

CREATE OR REPLACE FUNCTION public.create_order_transaction(p_delivery_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_delivery_address text, p_latitude numeric, p_longitude numeric, p_address_reference text, p_requires_invoice boolean, p_document_type text, p_document_number text, p_invoice_email text, p_notes text, p_locals jsonb, p_items jsonb)
 RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_order_id uuid;
    v_delivery_active boolean;

    v_subtotal numeric(12,2) := 0;
    v_delivery_fee numeric(12,2) := 0;
    v_total numeric(12,2) := 0;

    v_local jsonb;
    v_item jsonb;

    v_local_id uuid;
    v_distance_km numeric(10,2);
    v_local_subtotal numeric(12,2);
    v_local_delivery_fee numeric(12,2);
    v_fee_mode text;

    v_product_id uuid;
    v_variant_id uuid;
    v_quantity integer;

    v_product_name text;
    v_variant_name text;

    v_product_price numeric(12,2);
    v_variant_price numeric(12,2);
    v_unit_price numeric(12,2);
    v_item_subtotal numeric(12,2);

    v_product_local_id uuid;
    v_product_active boolean;

    v_variant_active boolean;
    v_variant_product_id uuid;

    v_config_mode text;
    v_item_local_exists boolean;
BEGIN
    IF p_delivery_id IS NULL THEN
        RAISE EXCEPTION 'delivery_id es obligatorio';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_id es obligatorio';
    END IF;

    IF NULLIF(trim(p_customer_phone), '') IS NULL THEN
        RAISE EXCEPTION 'El teléfono del cliente es obligatorio';
    END IF;

    IF NULLIF(trim(p_delivery_address), '') IS NULL THEN
        RAISE EXCEPTION 'La dirección de entrega es obligatoria';
    END IF;

    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RAISE EXCEPTION 'La ubicación del cliente es obligatoria';
    END IF;

    IF p_latitude < -90 OR p_latitude > 90 THEN
        RAISE EXCEPTION 'Latitud inválida';
    END IF;

    IF p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'Longitud inválida';
    END IF;

    IF p_locals IS NULL
       OR jsonb_typeof(p_locals) <> 'array'
       OR jsonb_array_length(p_locals) = 0
    THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un local';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
    THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto';
    END IF;

    SELECT d.active
    INTO v_delivery_active
    FROM public.deliveries AS d
    WHERE d.id = p_delivery_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El delivery no existe';
    END IF;

    IF v_delivery_active IS NOT TRUE THEN
        RAISE EXCEPTION 'El delivery no está activo';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers AS c
        WHERE c.id = p_customer_id
          AND c.active = true
    ) THEN
        RAISE EXCEPTION 'El cliente no existe o está inactivo';
    END IF;

    INSERT INTO public.orders (
        delivery_id,
        customer_id,
        status,
        subtotal,
        delivery_fee,
        total,
        customer_name,
        customer_phone,
        delivery_address,
        latitude,
        longitude,
        address_reference,
        requires_invoice,
        document_type,
        document_number,
        invoice_email,
        notes
    )
    VALUES (
        p_delivery_id,
        p_customer_id,
        'PENDING',
        0,
        0,
        0,
        NULLIF(trim(p_customer_name), ''),
        trim(p_customer_phone),
        trim(p_delivery_address),
        p_latitude,
        p_longitude,
        NULLIF(trim(p_address_reference), ''),
        COALESCE(p_requires_invoice, false),
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_document_type), '')
            ELSE NULL
        END,
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_document_number), '')
            ELSE NULL
        END,
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_invoice_email), '')
            ELSE NULL
        END,
        NULLIF(trim(p_notes), '')
    )
    RETURNING public.orders.id
    INTO v_order_id;

    FOR v_local IN
        SELECT value
        FROM jsonb_array_elements(p_locals)
    LOOP
        v_local_id := (v_local->>'local_id')::uuid;

        v_distance_km := round(
            (v_local->>'distance_km')::numeric,
            2
        );

        IF v_local_id IS NULL THEN
            RAISE EXCEPTION 'Existe un local sin local_id';
        END IF;

        IF v_distance_km IS NULL OR v_distance_km < 0 THEN
            RAISE EXCEPTION
                'Distancia inválida para el local %',
                v_local_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.locals AS l
            INNER JOIN public.local_deliveries AS ld
                ON ld.local_id = l.id
               AND ld.delivery_id = p_delivery_id
               AND ld.active = true
            WHERE l.id = v_local_id
              AND l.active = true
        ) THEN
            RAISE EXCEPTION
                'El local % no está activo o no tiene una relación activa con el delivery',
                v_local_id;
        END IF;

        SELECT dfc.mode
        INTO v_config_mode
        FROM public.delivery_fee_configs AS dfc
        WHERE dfc.delivery_id = p_delivery_id
          AND dfc.active = true
        LIMIT 1;

        IF v_config_mode IS NULL THEN
            RAISE EXCEPTION
                'El delivery no tiene una configuración de tarifa activa';
        END IF;

        v_local_delivery_fee :=
            public.calculate_delivery_fee_for_order(
                p_delivery_id,
                v_local_id,
                v_distance_km,
                p_latitude,
                p_longitude,
                now()
            );

        v_local_subtotal := 0;

        INSERT INTO public.order_locals (
            order_id,
            local_id,
            subtotal,
            delivery_distance_km,
            delivery_fee,
            delivery_fee_mode
        )
        VALUES (
            v_order_id,
            v_local_id,
            0,
            v_distance_km,
            v_local_delivery_fee,
            v_config_mode
        );

        v_delivery_fee :=
            v_delivery_fee + v_local_delivery_fee;
    END LOOP;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id :=
            (v_item->>'product_id')::uuid;

        v_variant_id :=
            NULLIF(v_item->>'variant_id', '')::uuid;

        v_quantity :=
            (v_item->>'quantity')::integer;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Producto inválido';
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION
                'La cantidad del producto debe ser mayor a 0';
        END IF;

        SELECT
            p.name,
            p.price,
            p.local_id,
            p.active
        INTO
            v_product_name,
            v_product_price,
            v_product_local_id,
            v_product_active
        FROM public.products AS p
        WHERE p.id = v_product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'El producto % no existe',
                v_product_id;
        END IF;

        IF v_product_active IS NOT TRUE THEN
            RAISE EXCEPTION
                'El producto % está inactivo',
                v_product_name;
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM public.order_locals AS ol
            WHERE ol.order_id = v_order_id
              AND ol.local_id = v_product_local_id
        )
        INTO v_item_local_exists;

        IF NOT v_item_local_exists THEN
            RAISE EXCEPTION
                'El producto % pertenece a un local que no está incluido en el pedido',
                v_product_name;
        END IF;

        v_variant_name := NULL;
        v_unit_price := v_product_price;

        IF v_variant_id IS NOT NULL THEN
            SELECT
                pv.name,
                pv.price,
                pv.active,
                pv.product_id
            INTO
                v_variant_name,
                v_variant_price,
                v_variant_active,
                v_variant_product_id
            FROM public.product_variants AS pv
            WHERE pv.id = v_variant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'La variante no existe';
            END IF;

            IF v_variant_active IS NOT TRUE THEN
                RAISE EXCEPTION
                    'La variante % está inactiva',
                    v_variant_name;
            END IF;

            IF v_variant_product_id <> v_product_id THEN
                RAISE EXCEPTION
                    'La variante no pertenece al producto';
            END IF;

            v_unit_price := v_variant_price;
        END IF;

        v_item_subtotal :=
            ROUND(v_unit_price * v_quantity, 2);

        INSERT INTO public.order_items (
            order_id,
            local_id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            unit_price,
            quantity,
            subtotal
        )
        VALUES (
            v_order_id,
            v_product_local_id,
            v_product_id,
            v_variant_id,
            v_product_name,
            v_variant_name,
            v_unit_price,
            v_quantity,
            v_item_subtotal
        );

        v_subtotal :=
            v_subtotal + v_item_subtotal;

        UPDATE public.order_locals AS ol
        SET
            subtotal = ol.subtotal + v_item_subtotal,
            updated_at = now()
        WHERE ol.order_id = v_order_id
          AND ol.local_id = v_product_local_id;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.order_locals AS ol
        WHERE ol.order_id = v_order_id
          AND ol.subtotal <= 0
    ) THEN
        RAISE EXCEPTION
            'Existe un local sin productos válidos en el pedido';
    END IF;

    v_subtotal := ROUND(v_subtotal, 2);
    v_delivery_fee := ROUND(v_delivery_fee, 2);
    v_total := ROUND(v_subtotal + v_delivery_fee, 2);

    UPDATE public.orders AS o
    SET
        subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        delivery_distance_km = (
            SELECT ROUND(
                COALESCE(SUM(ol_distance.delivery_distance_km), 0),
                2
            )
            FROM public.order_locals AS ol_distance
            WHERE ol_distance.order_id = v_order_id
        ),
        delivery_fee_mode = CASE
            WHEN (
                SELECT COUNT(DISTINCT ol_mode.delivery_fee_mode)
                FROM public.order_locals AS ol_mode
                WHERE ol_mode.order_id = v_order_id
            ) = 1
            THEN (
                SELECT MIN(ol_mode_value.delivery_fee_mode)
                FROM public.order_locals AS ol_mode_value
                WHERE ol_mode_value.order_id = v_order_id
            )
            ELSE 'MIXED'
        END,
        updated_at = now()
    WHERE o.id = v_order_id;

    RETURN QUERY
    SELECT
        o.id,
        o.subtotal,
        o.delivery_fee,
        o.total
    FROM public.orders AS o
    WHERE o.id = v_order_id;
END;
$function$
;

revoke execute on function public.delivery_fee_workspace(uuid) from public;
revoke execute on function public.save_delivery_fixed_fees(uuid,numeric,numeric) from public;
revoke execute on function public.delivery_replace_distance_bands(uuid,jsonb) from public;
revoke execute on function public.save_delivery_zone_simple(uuid,numeric,numeric,numeric,numeric) from public;
revoke execute on function public.delivery_replace_zone_rates(uuid,jsonb) from public;
revoke execute on function public.delivery_activate_fee_mode(uuid,text) from public;

grant execute on function public.delivery_fee_workspace(uuid) to authenticated,service_role;
grant execute on function public.save_delivery_fixed_fees(uuid,numeric,numeric) to authenticated,service_role;
grant execute on function public.delivery_replace_distance_bands(uuid,jsonb) to authenticated,service_role;
grant execute on function public.save_delivery_zone_simple(uuid,numeric,numeric,numeric,numeric) to authenticated,service_role;
grant execute on function public.delivery_replace_zone_rates(uuid,jsonb) to authenticated,service_role;
grant execute on function public.delivery_activate_fee_mode(uuid,text) to authenticated,service_role;
