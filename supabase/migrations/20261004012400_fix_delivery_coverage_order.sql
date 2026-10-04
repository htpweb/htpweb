-- Fix DELIVERY self-service transaction order:
-- plan must be active before delivery_zones triggers refresh LOCAL coverage.

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
 v_city_id uuid;
 v_name text:=nullif(trim(p_name),'');
 v_slug text;
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 if v_name is null then raise exception 'HTPWEB: nombre del DELIVERY requerido'; end if;
 if p_zone_id is null or not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true)
   then raise exception 'HTPWEB: selecciona una zona disponible'; end if;

 select z.city_id into v_city_id from public.zones z where z.id=p_zone_id;
 select p.id into v_plan_id from public.subscription_plans p
 where p.code='DELIVERY_TRIAL' and p.active=true limit 1;
 if v_plan_id is null then raise exception 'HTPWEB: plan de evaluación no disponible'; end if;

 v_slug=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
 if v_slug='' then v_slug='delivery'; end if;
 v_slug=left(v_slug,48)||'-'||substr(replace(v_delivery_id::text,'-',''),1,6);

 insert into public.deliveries(id,name,slug,description,phone,whatsapp,active,city_id,theme_key,created_at,updated_at)
 values(v_delivery_id,v_name,v_slug,nullif(trim(coalesce(p_description,'')),''),
   nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
   true,v_city_id,'HTPWEB',now(),now());

 insert into public.account_delivery_roles(user_id,delivery_id,role_code,active,created_at,updated_at)
 values(auth.uid(),v_delivery_id,'DELIVERY_ADMIN',true,now(),now())
 on conflict(user_id,delivery_id) do update
 set role_code='DELIVERY_ADMIN',active=true,updated_at=now();

 insert into public.user_deliveries(user_id,delivery_id,active,driver_mode)
 values(auth.uid(),v_delivery_id,true,'REGULAR')
 on conflict(user_id,delivery_id) do update set active=true,driver_mode='REGULAR';

 -- IMPORTANT: activate plan before inserting the zone.
 insert into public.plan_assignments(
   plan_id,delivery_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata,
   plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,
   change_type,selection_reset_required,plan_version_snapshot,created_at,updated_at
 ) select
   p.id,v_delivery_id,'TRIAL',now(),now()+interval '15 days',now()+interval '15 days',auth.uid(),
   jsonb_build_object('source','SELF_SERVICE','zone_limit',1,'selected_zone_id',p_zone_id),
   p.name,p.price,p.currency,p.duration_months,'INITIAL',false,p.plan_version,now(),now()
 from public.subscription_plans p where p.id=v_plan_id;

 -- delivery_zones refresh trigger now sees an active DELIVERY plan.
 insert into public.delivery_zones(delivery_id,zone_id,active,created_at)
 values(v_delivery_id,p_zone_id,true,now())
 on conflict(delivery_id,zone_id) do update set active=true;

 return v_delivery_id;
end $$;
