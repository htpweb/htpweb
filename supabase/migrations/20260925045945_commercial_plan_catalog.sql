-- HTPWEB — catálogo comercial y snapshots contractuales.
alter table public.subscription_plans
  add column if not exists duration_months integer not null default 1,
  add column if not exists plan_version integer not null default 1;
alter table public.subscription_plans drop constraint if exists subscription_plans_duration_months_check;
alter table public.subscription_plans add constraint subscription_plans_duration_months_check check(duration_months between 1 and 120);

alter table public.plan_assignments
  add column if not exists plan_name_snapshot text,
  add column if not exists price_snapshot numeric(12,2),
  add column if not exists currency_snapshot text,
  add column if not exists duration_months_snapshot integer,
  add column if not exists change_type text,
  add column if not exists previous_assignment_id uuid references public.plan_assignments(id),
  add column if not exists selection_reset_required boolean not null default false,
  add column if not exists transition_applied_at timestamptz;
alter table public.plan_assignments drop constraint if exists plan_assignments_change_type_check;
alter table public.plan_assignments add constraint plan_assignments_change_type_check
  check(change_type is null or change_type in ('NEW','RENEW','UPGRADE','DOWNGRADE','MIGRATION'));

create table if not exists public.plan_feature_catalog(
  code text primary key,
  entitlement_type text not null check(entitlement_type in ('CAPABILITY','LIMIT')),
  family text not null,
  label text not null,
  description text,
  stage integer not null default 1 check(stage>=1),
  unit text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan_feature_catalog enable row level security;
revoke all on table public.plan_feature_catalog from anon,authenticated;

insert into public.plan_feature_catalog(code,entitlement_type,family,label,description,stage,unit,display_order) values
('zones.active.max','LIMIT','Capacidad','Zonas activas','Máximo de zonas activas seleccionables.',1,'zonas',10),
('drivers.active.max','LIMIT','Capacidad','Repartidores activos','Máximo de repartidores activos simultáneamente.',2,'repartidores',20),
('operators.active.max','LIMIT','Capacidad','Operadores activos','Máximo de operadores activos simultáneamente.',1,'operadores',30),
('restricted_areas.active.max','LIMIT','Seguridad','Áreas restringidas','Máximo de polígonos de exclusión activos.',2,'áreas',40),
('orders.concurrent_per_driver.max','LIMIT','Despacho','Pedidos simultáneos por repartidor','Máximo de pedidos activos simultáneos por repartidor.',2,'pedidos',50),
('gps_history.days','LIMIT','GPS','Historial GPS','Días de historial GPS.',2,'días',60),
('delivery_fees.fixed','CAPABILITY','Tarifas','Tarifa fija','Permite configurar tarifa fija.',1,null,100),
('delivery_fees.distance','CAPABILITY','Tarifas','Tarifa por distancia','Permite cobrar por distancia.',1,null,110),
('delivery_fees.day_night','CAPABILITY','Tarifas','Tarifa Día/Noche','Permite tarifas distintas según horario.',1,null,120),
('customers.private_network','CAPABILITY','Clientes y referidos','Red privada de clientes','Solo contactos/referidos/autorizados pueden pedir.',1,null,200),
('customers.access_schedule','CAPABILITY','Clientes y referidos','Horario de acceso de clientes','Permite alternar red abierta/privada por día y hora.',1,null,210),
('referrals.links','CAPABILITY','Clientes y referidos','Enlaces de referido','Enlaces privados de invitación.',1,null,220),
('referrals.codes','CAPABILITY','Clientes y referidos','Códigos de referido','Códigos privados de invitación.',1,null,230),
('contacts.import','CAPABILITY','Clientes y referidos','Importar contactos','Importa contactos a la red del DELIVERY.',1,null,240),
('customers.approval','CAPABILITY','Clientes y referidos','Aprobación manual','Exige aprobación antes de permitir pedidos.',1,null,250),
('customers.groups','CAPABILITY','Clientes y referidos','Grupos de clientes','VIP, empresas y convenios.',2,null,260),
('referrals.analytics','CAPABILITY','Clientes y referidos','Analítica de referidos','Métricas de captación y pedidos.',2,null,270),
('restricted_areas.manage','CAPABILITY','Seguridad','Áreas restringidas','Permite polígonos de exclusión.',2,null,300),
('restricted_areas.schedule','CAPABILITY','Seguridad','Restricciones por horario','Activa áreas restringidas por día/hora.',2,null,310),
('safety.sos','CAPABILITY','Seguridad','SOS de repartidor','Alerta interna de emergencia.',2,null,320),
('safety.route_deviation','CAPABILITY','Seguridad','Alerta de desvío','Detecta desviaciones importantes.',2,null,330),
('gps.live','CAPABILITY','GPS','GPS en vivo','Ubicación en tiempo real de repartidores.',2,null,400),
('tracking.customer','CAPABILITY','GPS','Tracking para cliente','Seguimiento del pedido por el cliente.',2,null,410),
('dispatch.manual','CAPABILITY','Despacho','Asignación manual','Operador selecciona repartidor.',2,null,500),
('dispatch.hybrid','CAPABILITY','Despacho','Asignación híbrida','HTPWEB recomienda, operador confirma.',2,null,510),
('dispatch.auto','CAPABILITY','Despacho','Asignación automática','HTPWEB asigna repartidor automáticamente.',2,null,520),
('multi_order','CAPABILITY','Despacho','Multipedido','Agrupa pedidos compatibles.',2,null,530),
('routes.optimize','CAPABILITY','Rutas','Optimización de rutas','Optimiza recogidas y entregas.',2,null,540),
('delivery_proof.pin','CAPABILITY','Entrega','PIN de entrega','Confirma entrega con PIN.',2,null,600),
('delivery_proof.photo','CAPABILITY','Entrega','Foto de entrega','Evidencia fotográfica.',2,null,610),
('delivery_proof.signature','CAPABILITY','Entrega','Firma de entrega','Firma digital de recepción.',2,null,620),
('analytics.advanced','CAPABILITY','Analítica','Analítica avanzada','Métricas avanzadas.',1,null,700),
('exports.enabled','CAPABILITY','Datos','Exportaciones','Exporta reportes autorizados.',1,null,710),
('advertising.manage','CAPABILITY','Publicidad','Publicidad','Gestión de publicidad del DELIVERY.',1,null,720)
on conflict(code) do update set entitlement_type=excluded.entitlement_type,family=excluded.family,label=excluded.label,
 description=excluded.description,stage=excluded.stage,unit=excluded.unit,active=true,display_order=excluded.display_order,updated_at=now();

create table if not exists public.plan_assignment_entitlements(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.plan_assignments(id) on delete cascade,
  entitlement_type text not null check(entitlement_type in ('CAPABILITY','LIMIT')),
  code text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  unique(assignment_id,entitlement_type,code),
  check(jsonb_typeof(value) in ('boolean','number','string'))
);
alter table public.plan_assignment_entitlements enable row level security;
revoke all on table public.plan_assignment_entitlements from anon,authenticated;

update public.plan_assignments a
set plan_name_snapshot=coalesce(a.plan_name_snapshot,p.name),
    price_snapshot=coalesce(a.price_snapshot,p.price),
    currency_snapshot=coalesce(a.currency_snapshot,p.currency),
    duration_months_snapshot=coalesce(a.duration_months_snapshot,p.duration_months),
    change_type=coalesce(a.change_type,'MIGRATION')
from public.subscription_plans p where p.id=a.plan_id;

insert into public.plan_assignment_entitlements(assignment_id,entitlement_type,code,value)
select a.id,e.entitlement_type,e.code,e.value
from public.plan_assignments a join public.plan_entitlements e on e.plan_id=a.plan_id
on conflict(assignment_id,entitlement_type,code) do nothing;

update public.subscription_plans p set active=false,updated_at=now()
where p.code='DELIVERY_MONTHLY'
and not exists(select 1 from public.plan_assignments a where a.plan_id=p.id and a.status in ('ACTIVE','TRIAL') and (a.ends_at is null or a.ends_at>now()));

create or replace function public.master_list_plan_feature_catalog()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'code',f.code,'type',f.entitlement_type,'family',f.family,'label',f.label,'description',f.description,
   'stage',f.stage,'unit',f.unit,'active',f.active,'display_order',f.display_order
 ) order by f.family,f.display_order,f.code),'[]'::jsonb)
 into v from public.plan_feature_catalog f where f.active=true;
 return v;
end $$;

create or replace function public.master_list_commercial_plans()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'code',p.code,'name',p.name,'description',p.description,'target_type',p.target_type,
   'price',p.price,'currency',p.currency,'duration_months',p.duration_months,'billing_interval',p.billing_interval,
   'active',p.active,'display_order',p.display_order,'plan_version',p.plan_version,
   'entitlements',coalesce((select jsonb_agg(jsonb_build_object(
     'type',e.entitlement_type,'code',e.code,'value',e.value,'family',f.family,'label',f.label,'unit',f.unit
   ) order by f.family,f.display_order,e.code)
   from public.plan_entitlements e left join public.plan_feature_catalog f on f.code=e.code where e.plan_id=p.id),'[]'::jsonb)
 ) order by p.display_order,p.name),'[]'::jsonb)
 into v from public.subscription_plans p where p.target_type='DELIVERY';
 return v;
end $$;

create or replace function public.master_save_commercial_plan(
 p_plan_id uuid,p_code text,p_name text,p_description text,p_price numeric,p_duration_months integer,
 p_active boolean,p_display_order integer,p_entitlements jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_plan_id,gen_random_uuid()); v_item jsonb; v_type text; v_code text; v_value jsonb; v_expected text;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then raise exception 'HTPWEB: código y nombre son obligatorios'; end if;
 if p_price is null or p_price<0 then raise exception 'HTPWEB: precio inválido'; end if;
 if p_duration_months is null or p_duration_months<1 or p_duration_months>120 then raise exception 'HTPWEB: duración inválida'; end if;
 if p_entitlements is null or jsonb_typeof(p_entitlements)<>'array' then raise exception 'HTPWEB: prestaciones inválidas'; end if;

 insert into public.subscription_plans(id,code,name,description,target_type,price,currency,billing_interval,duration_months,active,display_order,plan_version,created_at,updated_at)
 values(v_id,upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),'DELIVERY',round(p_price,2),'USD','MONTH',p_duration_months,coalesce(p_active,true),coalesce(p_display_order,0),1,now(),now())
 on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,price=excluded.price,
 duration_months=excluded.duration_months,active=excluded.active,display_order=excluded.display_order,
 plan_version=public.subscription_plans.plan_version+1,updated_at=now();

 delete from public.plan_entitlements where plan_id=v_id;
 for v_item in select value from jsonb_array_elements(p_entitlements) loop
   v_type:=upper(trim(coalesce(v_item->>'type',''))); v_code:=lower(trim(coalesce(v_item->>'code',''))); v_value:=v_item->'value';
   select entitlement_type into v_expected from public.plan_feature_catalog where code=v_code and active=true;
   if v_expected is null then raise exception 'HTPWEB: prestación desconocida %',v_code; end if;
   if v_expected<>v_type then raise exception 'HTPWEB: tipo inválido para %',v_code; end if;
   if v_type='CAPABILITY' and jsonb_typeof(v_value)<>'boolean' then raise exception 'HTPWEB: % debe ser booleano',v_code; end if;
   if v_type='LIMIT' and (jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')::numeric<0) then raise exception 'HTPWEB: % debe ser numérico no negativo',v_code; end if;
   insert into public.plan_entitlements(plan_id,entitlement_type,code,value) values(v_id,v_type,v_code,v_value);
 end loop;
 return v_id;
end $$;

create or replace function public.effective_plan_entitlement(p_delivery_id uuid,p_local_id uuid,p_type text,p_code text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_value jsonb; v_type text:=upper(trim(coalesce(p_type,''))); v_code text:=lower(trim(coalesce(p_code,''))); v_assignment uuid;
begin
 if (p_delivery_id is not null)::integer+(p_local_id is not null)::integer<>1 then return null; end if;
 select o.value into v_value from public.plan_entitlement_overrides o
 where o.delivery_id is not distinct from p_delivery_id and o.local_id is not distinct from p_local_id
 and o.entitlement_type=v_type and o.code=v_code;
 if found then return v_value; end if;

 select a.id into v_assignment from public.plan_assignments a
 where a.status in ('ACTIVE','TRIAL') and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
 and (a.trial_ends_at is null or a.status<>'TRIAL' or a.trial_ends_at>now())
 and a.delivery_id is not distinct from p_delivery_id and a.local_id is not distinct from p_local_id
 order by a.starts_at desc,a.created_at desc limit 1;
 if v_assignment is null then return null; end if;

 select s.value into v_value from public.plan_assignment_entitlements s
 where s.assignment_id=v_assignment and s.entitlement_type=v_type and s.code=v_code;
 if found then return v_value; end if;

 select e.value into v_value from public.plan_assignments a join public.plan_entitlements e on e.plan_id=a.plan_id
 where a.id=v_assignment and e.entitlement_type=v_type and e.code=v_code limit 1;
 return v_value;
end $$;

create or replace function public.delivery_limit_value(p_delivery_id uuid,p_limit_code text)
returns integer language plpgsql stable security definer set search_path=''
as $$
declare v jsonb; v_code text:=lower(trim(coalesce(p_limit_code,'')));
begin
 if v_code='max_zones' then v_code:='zones.active.max'; end if;
 v:=public.effective_plan_entitlement(p_delivery_id,null,'LIMIT',v_code);
 if v is not null then return floor((v#>>'{}')::numeric)::integer; end if;
 if to_regprocedure('public.delivery_limit_value_legacy(uuid,text)') is not null then return public.delivery_limit_value_legacy(p_delivery_id,p_limit_code); end if;
 return null;
end $$;

revoke all on function public.master_list_plan_feature_catalog() from public,anon;
revoke all on function public.master_list_commercial_plans() from public,anon;
revoke all on function public.master_save_commercial_plan(uuid,text,text,text,numeric,integer,boolean,integer,jsonb) from public,anon;
grant execute on function public.master_list_plan_feature_catalog() to authenticated;
grant execute on function public.master_list_commercial_plans() to authenticated;
grant execute on function public.master_save_commercial_plan(uuid,text,text,text,numeric,integer,boolean,integer,jsonb) to authenticated;
