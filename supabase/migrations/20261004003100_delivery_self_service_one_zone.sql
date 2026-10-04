-- HTPWEB self-service DELIVERY onboarding: one-zone evaluation plan.

insert into public.subscription_plans(code,name,description,target_type,price,currency,billing_interval,duration_months,active,display_order,plan_version)
values('DELIVERY_TRIAL','Prueba 1 zona','Evalúa HTPWEB con un DELIVERY operativo en una zona durante 15 días.','DELIVERY',0,'USD','ONE_TIME',1,true,0,1)
on conflict(code) do update set
 name=excluded.name,description=excluded.description,target_type=excluded.target_type,price=excluded.price,
 currency=excluded.currency,billing_interval=excluded.billing_interval,duration_months=excluded.duration_months,
 active=true,display_order=excluded.display_order,updated_at=now();

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'LIMIT','zones.active.max','1'::jsonb from public.subscription_plans p where p.code='DELIVERY_TRIAL'
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value,updated_at=now();

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'CAPABILITY','dispatch.manual','true'::jsonb from public.subscription_plans p where p.code='DELIVERY_TRIAL'
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value,updated_at=now();

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'LIMIT','drivers.active.max','1'::jsonb from public.subscription_plans p where p.code='DELIVERY_TRIAL'
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value,updated_at=now();

create or replace function public.available_delivery_zones()
returns jsonb
language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',z.id,'name',z.name,'city',z.city,'province',z.province,'country',z.country,
   'color',z.color,'boundary',z.boundary
 ) order by z.province,z.city,z.name),'[]'::jsonb)
 from public.zones z
 where z.active=true and z.boundary is not null;
$$;

create or replace function public.create_my_delivery(
 p_name text,
 p_description text,
 p_phone text,
 p_whatsapp text,
 p_zone_id uuid
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_delivery_id uuid:=gen_random_uuid();
 v_plan_id uuid;
 v_plan_name text;
 v_city_id uuid;
 v_name text:=nullif(trim(p_name),'');
 v_slug text;
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 if v_name is null then raise exception 'HTPWEB: nombre del DELIVERY requerido'; end if;
 if p_zone_id is null or not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true)
   then raise exception 'HTPWEB: selecciona una zona disponible'; end if;

 select z.city_id into v_city_id from public.zones z where z.id=p_zone_id;
 select p.id,p.name into v_plan_id,v_plan_name from public.subscription_plans p
 where p.code='DELIVERY_TRIAL' and p.active=true limit 1;
 if v_plan_id is null then raise exception 'HTPWEB: plan de evaluación no disponible'; end if;

 v_slug=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
 if v_slug='' then v_slug='delivery'; end if;
 v_slug=left(v_slug,48)||'-'||substr(replace(v_delivery_id::text,'-',''),1,6);

 insert into public.deliveries(id,name,slug,description,phone,whatsapp,active,city_id,theme_key,created_at,updated_at)
 values(v_delivery_id,v_name,v_slug,nullif(trim(coalesce(p_description,'')),''),
   nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
   true,v_city_id,'default',now(),now());

 insert into public.user_deliveries(user_id,delivery_id,active,driver_mode)
 values(auth.uid(),v_delivery_id,true,'REGULAR')
 on conflict(user_id,delivery_id) do update set active=true,driver_mode='REGULAR';

 insert into public.account_delivery_roles(user_id,delivery_id,role_code,active,created_at,updated_at)
 values(auth.uid(),v_delivery_id,'DELIVERY_ADMIN',true,now(),now())
 on conflict(user_id,delivery_id) do update set role_code='DELIVERY_ADMIN',active=true,updated_at=now();

 insert into public.delivery_zones(delivery_id,zone_id,active,created_at)
 values(v_delivery_id,p_zone_id,true,now())
 on conflict(delivery_id,zone_id) do update set active=true;

 insert into public.plan_assignments(
   plan_id,delivery_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata,
   plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,
   change_type,selection_reset_required,plan_version_snapshot,created_at,updated_at
 ) select
   p.id,v_delivery_id,'TRIAL',now(),now()+interval '15 days',now()+interval '15 days',auth.uid(),
   jsonb_build_object('source','SELF_SERVICE','zone_limit',1,'selected_zone_id',p_zone_id),
   p.name,p.price,p.currency,p.duration_months,'INITIAL',false,p.plan_version,now(),now()
 from public.subscription_plans p where p.id=v_plan_id;

 return v_delivery_id;
end $$;

create or replace function public.my_plans_and_subscriptions()
returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'deliveries',coalesce((
     select jsonb_agg(jsonb_build_object(
       'delivery_id',d.id,'delivery_name',d.name,'delivery_slug',d.slug,
       'assignment_id',pa.id,'status',pa.status,'starts_at',pa.starts_at,'ends_at',pa.ends_at,'trial_ends_at',pa.trial_ends_at,
       'plan_id',sp.id,'plan_code',sp.code,'plan_name',sp.name,'price',sp.price,'currency',sp.currency,
       'zones_max',coalesce((select (pe.value #>> '{}')::int from public.plan_entitlements pe where pe.plan_id=sp.id and pe.code='zones.active.max' limit 1),0),
       'zones_active',(select count(*) from public.delivery_zones dz where dz.delivery_id=d.id and dz.active)
     ) order by lower(d.name))
     from public.user_deliveries ud
     join public.deliveries d on d.id=ud.delivery_id and ud.active
     left join lateral (
       select * from public.plan_assignments x where x.delivery_id=d.id and x.status in ('ACTIVE','TRIAL','PAST_DUE')
       order by x.starts_at desc limit 1
     ) pa on true
     left join public.subscription_plans sp on sp.id=pa.plan_id
     where ud.user_id=auth.uid()
   ),'[]'::jsonb),
   'available_delivery_plans',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',sp.id,'code',sp.code,'name',sp.name,'description',sp.description,'price',sp.price,'currency',sp.currency,
       'zones_max',coalesce((select (pe.value #>> '{}')::int from public.plan_entitlements pe where pe.plan_id=sp.id and pe.code='zones.active.max' limit 1),0)
     ) order by sp.display_order,sp.name)
     from public.subscription_plans sp where sp.target_type='DELIVERY' and sp.active and sp.code<>'DELIVERY_TRIAL'
   ),'[]'::jsonb)
 );
$$;

revoke all on function public.available_delivery_zones() from public;
grant execute on function public.available_delivery_zones() to authenticated;
revoke all on function public.create_my_delivery(text,text,text,text,uuid) from public,anon;
grant execute on function public.create_my_delivery(text,text,text,text,uuid) to authenticated;
revoke all on function public.my_plans_and_subscriptions() from public,anon;
grant execute on function public.my_plans_and_subscriptions() to authenticated;
