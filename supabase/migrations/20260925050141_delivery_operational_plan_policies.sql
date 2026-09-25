
-- Con plan vigente, el contrato manda; configuración legacy solo sirve cuando no existe contrato comercial.
create or replace function public.delivery_has_capability(p_delivery_id uuid,p_capability_code text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v jsonb; v_has_plan boolean;
begin
 if public.is_master() then return true; end if;
 v:=public.effective_plan_entitlement(p_delivery_id,null,'CAPABILITY',lower(trim(p_capability_code)));
 if v is not null then return (v#>>'{}')::boolean; end if;

 select exists(
   select 1 from public.plan_assignments a
   where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL')
     and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
 ) into v_has_plan;
 if v_has_plan then return false; end if;

 if to_regprocedure('public.delivery_has_capability_legacy(uuid,text)') is not null then
   return coalesce(public.delivery_has_capability_legacy(p_delivery_id,p_capability_code),false);
 end if;
 return false;
end $$;

-- Aplica una sola vez el reset de recursos seleccionables cuando entra un downgrade que reduce capacidad.
create or replace function public.ensure_delivery_plan_transition_applied(p_delivery_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_assignment uuid;
begin
 if not (public.is_master() or exists(
   select 1 from public.user_deliveries ud where ud.user_id=auth.uid() and ud.delivery_id=p_delivery_id and ud.active=true
 )) then raise exception 'HTPWEB: no autorizado'; end if;

 select a.id into v_assignment from public.plan_assignments a
 where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL')
   and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
   and a.selection_reset_required=true and a.transition_applied_at is null
 order by a.starts_at desc,a.created_at desc limit 1;

 if v_assignment is null then return false; end if;

 update public.delivery_zones set active=false where delivery_id=p_delivery_id and active=true;
 update public.plan_assignments set transition_applied_at=now(),updated_at=now() where id=v_assignment;
 return true;
end $$;

-- DELIVERY elige qué zonas usar; MASTER define el catálogo territorial y el plan define la cantidad.
create or replace function public.delivery_set_zone_choice(p_delivery_id uuid,p_zone_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_limit integer; v_count integer; v_city uuid;
begin
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(p_delivery_id) then
   raise exception 'HTPWEB: solo el DELIVERY_ADMIN autorizado puede seleccionar zonas';
 end if;

 perform public.ensure_delivery_plan_transition_applied(p_delivery_id);
 v_limit:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
 if v_limit is null then raise exception 'HTPWEB: el plan no incluye capacidad de zonas'; end if;

 select d.city_id into v_city from public.deliveries d where d.id=p_delivery_id and d.active=true;
 if v_city is null then raise exception 'HTPWEB: el DELIVERY no tiene cantón configurado'; end if;
 if not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true and z.city_id=v_city) then
   raise exception 'HTPWEB: zona inválida para el cantón del DELIVERY';
 end if;

 if coalesce(p_active,false) then
   select count(*) into v_count from public.delivery_zones dz
   where dz.delivery_id=p_delivery_id and dz.active=true and dz.zone_id<>p_zone_id;
   if v_count>=v_limit then
     raise exception 'HTPWEB: límite del plan alcanzado (% zonas activas)',v_limit;
   end if;
 end if;

 insert into public.delivery_zones(delivery_id,zone_id,active,created_at)
 values(p_delivery_id,p_zone_id,coalesce(p_active,false),now())
 on conflict(delivery_id,zone_id) do update set active=excluded.active;

 return jsonb_build_object(
   'delivery_id',p_delivery_id,'zone_id',p_zone_id,'active',coalesce(p_active,false),
   'limit',v_limit,
   'used',(select count(*) from public.delivery_zones where delivery_id=p_delivery_id and active=true)
 );
end $$;

-- Red de clientes y referidos.
alter table public.customer_deliveries
  add column if not exists relationship_source text not null default 'PUBLIC',
  add column if not exists referral_code_id uuid,
  add column if not exists referred_by_customer_id uuid references public.customers(id);

alter table public.customer_deliveries drop constraint if exists customer_deliveries_relationship_source_check;
alter table public.customer_deliveries add constraint customer_deliveries_relationship_source_check
 check(relationship_source in ('PUBLIC','CONTACT','REFERRAL_LINK','REFERRAL_CODE','MANUAL_APPROVAL'));

create table if not exists public.delivery_customer_access_settings(
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  default_mode text not null default 'OPEN' check(default_mode in ('OPEN','PRIVATE','APPROVAL_REQUIRED')),
  timezone text not null default 'America/Guayaquil',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_customer_access_rules(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  day_of_week smallint not null check(day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  access_mode text not null check(access_mode in ('OPEN','PRIVATE','APPROVAL_REQUIRED')),
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_customer_access_rules_lookup_idx
 on public.delivery_customer_access_rules(delivery_id,day_of_week,active,priority);

alter table public.delivery_customer_access_settings enable row level security;
alter table public.delivery_customer_access_rules enable row level security;
revoke all on table public.delivery_customer_access_settings from anon,authenticated;
revoke all on table public.delivery_customer_access_rules from anon,authenticated;

create or replace function public.delivery_customer_access_mode_at(p_delivery_id uuid,p_at timestamptz default now())
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_default text:='OPEN'; v_local timestamp; v_dow integer; v_prev integer; v_time time; v_mode text;
begin
 if not public.delivery_has_capability(p_delivery_id,'customers.private_network') then return 'OPEN'; end if;

 select s.default_mode into v_default from public.delivery_customer_access_settings s where s.delivery_id=p_delivery_id;
 v_default:=coalesce(v_default,'OPEN');

 if not public.delivery_has_capability(p_delivery_id,'customers.access_schedule') then return v_default; end if;

 v_local:=p_at at time zone 'America/Guayaquil';
 v_dow:=extract(dow from v_local)::integer;
 v_prev:=(v_dow+6)%7;
 v_time:=v_local::time;

 select r.access_mode into v_mode
 from public.delivery_customer_access_rules r
 where r.delivery_id=p_delivery_id and r.active=true and (
   (r.start_time<r.end_time and r.day_of_week=v_dow and v_time>=r.start_time and v_time<r.end_time)
   or
   (r.start_time>r.end_time and (
      (r.day_of_week=v_dow and v_time>=r.start_time)
      or (r.day_of_week=v_prev and v_time<r.end_time)
   ))
   or
   (r.start_time=r.end_time and r.day_of_week=v_dow)
 )
 order by r.priority asc,r.created_at asc limit 1;

 return coalesce(v_mode,v_default);
end $$;

create or replace function public.customer_can_order_delivery(p_customer_id uuid,p_delivery_id uuid,p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_mode text;
begin
 if p_customer_id is null or p_delivery_id is null then return false; end if;
 if not public.delivery_service_is_active(p_delivery_id) then return false; end if;
 v_mode:=public.delivery_customer_access_mode_at(p_delivery_id,p_at);
 if v_mode='OPEN' then return true; end if;

 return exists(
   select 1 from public.customer_deliveries cd
   where cd.customer_id=p_customer_id and cd.delivery_id=p_delivery_id
     and cd.active=true and cd.allow_orders=true
 );
end $$;

create or replace function public.delivery_save_customer_access_settings(p_delivery_id uuid,p_default_mode text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_mode text:=upper(trim(coalesce(p_default_mode,'OPEN')));
begin
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(p_delivery_id) then
   raise exception 'HTPWEB: solo DELIVERY_ADMIN puede configurar acceso de clientes';
 end if;
 if v_mode not in ('OPEN','PRIVATE','APPROVAL_REQUIRED') then raise exception 'HTPWEB: modo inválido'; end if;
 if v_mode<>'OPEN' and not public.delivery_has_capability(p_delivery_id,'customers.private_network') then
   raise exception 'HTPWEB: tu plan no incluye red privada de clientes';
 end if;

 insert into public.delivery_customer_access_settings(delivery_id,default_mode,updated_by,updated_at)
 values(p_delivery_id,v_mode,auth.uid(),now())
 on conflict(delivery_id) do update set default_mode=excluded.default_mode,updated_by=excluded.updated_by,updated_at=now();

 return jsonb_build_object('delivery_id',p_delivery_id,'default_mode',v_mode);
end $$;

create or replace function public.delivery_replace_customer_access_rules(p_delivery_id uuid,p_rules jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v jsonb; v_day integer; v_start time; v_end time; v_mode text; v_priority integer;
begin
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(p_delivery_id) then
   raise exception 'HTPWEB: solo DELIVERY_ADMIN puede configurar horarios';
 end if;
 if not public.delivery_has_capability(p_delivery_id,'customers.access_schedule') then
   raise exception 'HTPWEB: tu plan no incluye horario de acceso de clientes';
 end if;
 if p_rules is null or jsonb_typeof(p_rules)<>'array' then raise exception 'HTPWEB: reglas inválidas'; end if;

 delete from public.delivery_customer_access_rules where delivery_id=p_delivery_id;

 for v in select value from jsonb_array_elements(p_rules) loop
   v_day:=(v->>'day_of_week')::integer;
   v_start:=(v->>'start_time')::time;
   v_end:=(v->>'end_time')::time;
   v_mode:=upper(trim(v->>'access_mode'));
   v_priority:=coalesce((v->>'priority')::integer,100);
   if v_day not between 0 and 6 or v_mode not in ('OPEN','PRIVATE','APPROVAL_REQUIRED') then
     raise exception 'HTPWEB: regla de acceso inválida';
   end if;
   insert into public.delivery_customer_access_rules(delivery_id,day_of_week,start_time,end_time,access_mode,priority,active)
   values(p_delivery_id,v_day,v_start,v_end,v_mode,v_priority,true);
 end loop;

 return jsonb_build_object('delivery_id',p_delivery_id,'rules',p_rules);
end $$;

create or replace function public.delivery_customer_access_snapshot(p_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_default text; v_rules jsonb;
begin
 if not (public.is_master() or exists(select 1 from public.user_deliveries ud where ud.user_id=auth.uid() and ud.delivery_id=p_delivery_id and ud.active=true)) then
   raise exception 'HTPWEB: no autorizado';
 end if;
 select default_mode into v_default from public.delivery_customer_access_settings where delivery_id=p_delivery_id;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'day_of_week',day_of_week,'start_time',start_time,'end_time',end_time,'access_mode',access_mode,'priority',priority,'active',active
 ) order by day_of_week,priority,start_time),'[]'::jsonb)
 into v_rules from public.delivery_customer_access_rules where delivery_id=p_delivery_id;
 return jsonb_build_object('default_mode',coalesce(v_default,'OPEN'),'current_mode',public.delivery_customer_access_mode_at(p_delivery_id,now()),'rules',v_rules);
end $$;

-- Referrals: núcleo funcional para códigos de referido.
create table if not exists public.delivery_referral_codes(
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.deliveries(id) on delete cascade,
 code text not null,
 label text,
 active boolean not null default true,
 expires_at timestamptz,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(code)
);
create index if not exists delivery_referral_codes_delivery_idx on public.delivery_referral_codes(delivery_id,active);
alter table public.delivery_referral_codes enable row level security;
revoke all on table public.delivery_referral_codes from anon,authenticated;

alter table public.customer_deliveries
  add constraint customer_deliveries_referral_code_fkey foreign key(referral_code_id)
  references public.delivery_referral_codes(id) on delete set null;

create or replace function public.delivery_create_referral_code(p_delivery_id uuid,p_label text default null,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_code text; v_id uuid;
begin
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(p_delivery_id) then raise exception 'HTPWEB: no autorizado'; end if;
 if not public.delivery_has_capability(p_delivery_id,'referrals.codes') then raise exception 'HTPWEB: tu plan no incluye códigos de referido'; end if;
 loop
   v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
   exit when not exists(select 1 from public.delivery_referral_codes where code=v_code);
 end loop;
 insert into public.delivery_referral_codes(delivery_id,code,label,expires_at,created_by)
 values(p_delivery_id,v_code,nullif(trim(coalesce(p_label,'')),''),p_expires_at,auth.uid())
 returning id into v_id;
 return jsonb_build_object('id',v_id,'code',v_code,'delivery_id',p_delivery_id,'expires_at',p_expires_at);
end $$;

create or replace function public.claim_delivery_referral(p_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_ref record; v_customer uuid;
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 v_customer:=public.current_customer_id();
 if v_customer is null then raise exception 'HTPWEB: primero crea tu perfil de cliente'; end if;

 select r.* into v_ref from public.delivery_referral_codes r
 where r.code=upper(trim(p_code)) and r.active=true and (r.expires_at is null or r.expires_at>now()) limit 1;
 if v_ref.id is null then raise exception 'HTPWEB: código de referido inválido o vencido'; end if;
 if not public.delivery_has_capability(v_ref.delivery_id,'referrals.codes') then raise exception 'HTPWEB: referidos no disponibles para este DELIVERY'; end if;

 insert into public.customer_deliveries(customer_id,delivery_id,active,allow_orders,relationship_source,referral_code_id,created_at,updated_at)
 values(v_customer,v_ref.delivery_id,true,true,'REFERRAL_CODE',v_ref.id,now(),now())
 on conflict(customer_id,delivery_id) do update set active=true,allow_orders=true,relationship_source='REFERRAL_CODE',
 referral_code_id=excluded.referral_code_id,updated_at=now();

 return jsonb_build_object('delivery_id',v_ref.delivery_id,'customer_id',v_customer,'status','AUTHORIZED');
end $$;

-- Modifica auto-vinculación: solo se crea sola si el modo vigente es OPEN.
create or replace function public.ensure_my_customer_delivery(p_delivery_id uuid)
returns table(customer_id uuid,delivery_id uuid,active boolean,allow_orders boolean)
language plpgsql security definer set search_path=''
as $$
declare v_customer uuid; v_existing_active boolean; v_existing_allow boolean; v_mode text;
begin
 if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
 v_customer:=public.current_customer_id();
 if v_customer is null then raise exception 'HTPWEB: primero debe crear su customer'; end if;
 if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then raise exception 'HTPWEB: el delivery no existe o está inactivo'; end if;

 select cd.active,cd.allow_orders into v_existing_active,v_existing_allow
 from public.customer_deliveries cd where cd.customer_id=v_customer and cd.delivery_id=p_delivery_id limit 1;

 if found then
   if v_existing_active is not true or v_existing_allow is not true then raise exception 'HTPWEB: la relación con este delivery está deshabilitada'; end if;
 else
   v_mode:=public.delivery_customer_access_mode_at(p_delivery_id,now());
   if v_mode<>'OPEN' then raise exception 'HTPWEB: este DELIVERY trabaja con una red privada de clientes; necesitas invitación, referido o aprobación'; end if;
   insert into public.customer_deliveries(customer_id,delivery_id,active,allow_orders,relationship_source,created_at,updated_at)
   values(v_customer,p_delivery_id,true,true,'PUBLIC',now(),now());
 end if;

 return query select cd.customer_id,cd.delivery_id,cd.active,cd.allow_orders
 from public.customer_deliveries cd where cd.customer_id=v_customer and cd.delivery_id=p_delivery_id;
end $$;

create or replace function public.validate_order_customer_delivery()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.customers c where c.id=new.customer_id and c.active=true)
    or not exists(select 1 from public.deliveries d where d.id=new.delivery_id and d.active=true)
    or not public.customer_can_order_delivery(new.customer_id,new.delivery_id,coalesce(new.created_at,now())) then
   raise exception 'HTPWEB: el customer no está habilitado para realizar pedidos en este delivery en este horario';
 end if;
 return new;
end $$;

-- Áreas restringidas: permanentes o por horario.
create table if not exists public.delivery_restricted_areas(
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.deliveries(id) on delete cascade,
 zone_id uuid not null references public.zones(id) on delete cascade,
 name text not null,
 reason text,
 boundary jsonb not null,
 restriction_mode text not null default 'PERMANENT' check(restriction_mode in ('PERMANENT','SCHEDULE')),
 active boolean not null default true,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(boundary)='array' and jsonb_array_length(boundary)>=3)
);
create index if not exists delivery_restricted_areas_lookup_idx on public.delivery_restricted_areas(delivery_id,zone_id,active);

create table if not exists public.delivery_restricted_area_rules(
 id uuid primary key default gen_random_uuid(),
 area_id uuid not null references public.delivery_restricted_areas(id) on delete cascade,
 day_of_week smallint not null check(day_of_week between 0 and 6),
 start_time time not null,
 end_time time not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists delivery_restricted_area_rules_lookup_idx on public.delivery_restricted_area_rules(area_id,day_of_week,active);

alter table public.delivery_restricted_areas enable row level security;
alter table public.delivery_restricted_area_rules enable row level security;
revoke all on table public.delivery_restricted_areas from anon,authenticated;
revoke all on table public.delivery_restricted_area_rules from anon,authenticated;

create or replace function public.delivery_save_restricted_area(
 p_area_id uuid,p_delivery_id uuid,p_zone_id uuid,p_name text,p_reason text,p_boundary jsonb,p_restriction_mode text,p_active boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_area_id,gen_random_uuid()); v_mode text:=upper(trim(coalesce(p_restriction_mode,'PERMANENT'))); v_limit integer; v_count integer;
begin
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(p_delivery_id) then raise exception 'HTPWEB: no autorizado'; end if;
 if not public.delivery_has_capability(p_delivery_id,'restricted_areas.manage') then raise exception 'HTPWEB: tu plan no incluye áreas restringidas'; end if;
 if v_mode not in ('PERMANENT','SCHEDULE') then raise exception 'HTPWEB: modo inválido'; end if;
 if v_mode='SCHEDULE' and not public.delivery_has_capability(p_delivery_id,'restricted_areas.schedule') then raise exception 'HTPWEB: tu plan no incluye restricciones por horario'; end if;
 perform public.htp_zone_polygon(p_boundary);
 if not exists(select 1 from public.delivery_zones dz where dz.delivery_id=p_delivery_id and dz.zone_id=p_zone_id and dz.active=true) then
   raise exception 'HTPWEB: solo puedes restringir una zona activa de tu DELIVERY';
 end if;
 v_limit:=public.delivery_limit_value(p_delivery_id,'restricted_areas.active.max');
 if coalesce(p_active,true) and v_limit is not null then
   select count(*) into v_count from public.delivery_restricted_areas a where a.delivery_id=p_delivery_id and a.active=true and a.id<>v_id;
   if v_count>=v_limit then raise exception 'HTPWEB: límite de áreas restringidas alcanzado (%)',v_limit; end if;
 end if;

 insert into public.delivery_restricted_areas(id,delivery_id,zone_id,name,reason,boundary,restriction_mode,active,created_by,created_at,updated_at)
 values(v_id,p_delivery_id,p_zone_id,trim(p_name),nullif(trim(coalesce(p_reason,'')),''),p_boundary,v_mode,coalesce(p_active,true),auth.uid(),now(),now())
 on conflict(id) do update set zone_id=excluded.zone_id,name=excluded.name,reason=excluded.reason,boundary=excluded.boundary,
 restriction_mode=excluded.restriction_mode,active=excluded.active,updated_at=now();
 return v_id;
end $$;

create or replace function public.delivery_replace_restricted_area_rules(p_area_id uuid,p_rules jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_area record; v jsonb; v_count integer:=0;
begin
 select * into v_area from public.delivery_restricted_areas where id=p_area_id;
 if v_area.id is null then raise exception 'HTPWEB: área inexistente'; end if;
 if public.current_role_code()<>'DELIVERY_ADMIN' or not public.user_has_delivery(v_area.delivery_id) then raise exception 'HTPWEB: no autorizado'; end if;
 if not public.delivery_has_capability(v_area.delivery_id,'restricted_areas.schedule') then raise exception 'HTPWEB: tu plan no incluye restricciones por horario'; end if;
 if p_rules is null or jsonb_typeof(p_rules)<>'array' then raise exception 'HTPWEB: reglas inválidas'; end if;

 delete from public.delivery_restricted_area_rules where area_id=p_area_id;
 for v in select value from jsonb_array_elements(p_rules) loop
   insert into public.delivery_restricted_area_rules(area_id,day_of_week,start_time,end_time,active)
   values(p_area_id,(v->>'day_of_week')::integer,(v->>'start_time')::time,(v->>'end_time')::time,true);
   v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function public.delivery_location_is_restricted(
 p_delivery_id uuid,p_latitude numeric,p_longitude numeric,p_at timestamptz default now()
) returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_local timestamp:=p_at at time zone 'America/Guayaquil'; v_dow integer; v_prev integer; v_time time;
begin
 v_dow:=extract(dow from v_local)::integer; v_prev:=(v_dow+6)%7; v_time:=v_local::time;
 return exists(
   select 1 from public.delivery_restricted_areas a
   where a.delivery_id=p_delivery_id and a.active=true
     and public.htp_zone_contains(a.boundary,p_latitude,p_longitude)
     and (
       a.restriction_mode='PERMANENT'
       or (
         a.restriction_mode='SCHEDULE'
         and exists(
           select 1 from public.delivery_restricted_area_rules r
           where r.area_id=a.id and r.active=true and (
             (r.start_time<r.end_time and r.day_of_week=v_dow and v_time>=r.start_time and v_time<r.end_time)
             or (r.start_time>r.end_time and ((r.day_of_week=v_dow and v_time>=r.start_time) or (r.day_of_week=v_prev and v_time<r.end_time)))
             or (r.start_time=r.end_time and r.day_of_week=v_dow)
           )
         )
       )
     )
 );
end $$;

revoke all on function public.ensure_delivery_plan_transition_applied(uuid) from public,anon;
revoke all on function public.delivery_set_zone_choice(uuid,uuid,boolean) from public,anon;
revoke all on function public.delivery_customer_access_mode_at(uuid,timestamptz) from public,anon;
revoke all on function public.customer_can_order_delivery(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.delivery_save_customer_access_settings(uuid,text) from public,anon;
revoke all on function public.delivery_replace_customer_access_rules(uuid,jsonb) from public,anon;
revoke all on function public.delivery_customer_access_snapshot(uuid) from public,anon;
revoke all on function public.delivery_create_referral_code(uuid,text,timestamptz) from public,anon;
revoke all on function public.claim_delivery_referral(text) from public,anon;
revoke all on function public.delivery_save_restricted_area(uuid,uuid,uuid,text,text,jsonb,text,boolean) from public,anon;
revoke all on function public.delivery_replace_restricted_area_rules(uuid,jsonb) from public,anon;
revoke all on function public.delivery_location_is_restricted(uuid,numeric,numeric,timestamptz) from public,anon;

grant execute on function public.delivery_set_zone_choice(uuid,uuid,boolean) to authenticated;
grant execute on function public.delivery_customer_access_mode_at(uuid,timestamptz) to authenticated;
grant execute on function public.customer_can_order_delivery(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.delivery_save_customer_access_settings(uuid,text) to authenticated;
grant execute on function public.delivery_replace_customer_access_rules(uuid,jsonb) to authenticated;
grant execute on function public.delivery_customer_access_snapshot(uuid) to authenticated;
grant execute on function public.delivery_create_referral_code(uuid,text,timestamptz) to authenticated;
grant execute on function public.claim_delivery_referral(text) to authenticated;
grant execute on function public.delivery_save_restricted_area(uuid,uuid,uuid,text,text,jsonb,text,boolean) to authenticated;
grant execute on function public.delivery_replace_restricted_area_rules(uuid,jsonb) to authenticated;
grant execute on function public.delivery_location_is_restricted(uuid,numeric,numeric,timestamptz) to authenticated;
