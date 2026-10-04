-- Assign a short root public path to self-service DELIVERY accounts.
-- Reviewed against deliveries_public_share_path_uq before applying.

do $$
declare
  r record;
  v_base text;
  v_path text;
begin
  for r in
    select id,name from public.deliveries
    where public_share_path is null
    order by created_at,id
  loop
    v_base:=regexp_replace(
      translate(coalesce(r.name,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),
      '[^A-Za-z0-9]','','g'
    );
    if length(v_base)<3 then
      v_base:='Delivery'||substr(replace(r.id::text,'-',''),1,6);
    end if;
    v_base:=left(v_base,36);
    v_path:=v_base;
    if exists(
      select 1 from public.deliveries d
      where d.id<>r.id
        and d.public_share_path is not null
        and lower(d.public_share_path)=lower(v_path)
    ) then
      v_path:=left(v_base,33)||substr(replace(r.id::text,'-',''),1,6);
    end if;
    update public.deliveries set public_share_path=v_path,updated_at=now() where id=r.id;
  end loop;
end $$;

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
 v_public_base text;
 v_public_path text;
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

 v_public_base:=regexp_replace(
   translate(v_name,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),
   '[^A-Za-z0-9]','','g'
 );
 if length(v_public_base)<3 then
   v_public_base:='Delivery'||substr(replace(v_delivery_id::text,'-',''),1,6);
 end if;
 v_public_base:=left(v_public_base,36);
 v_public_path:=v_public_base;
 if exists(
   select 1 from public.deliveries d
   where d.public_share_path is not null
     and lower(d.public_share_path)=lower(v_public_path)
 ) then
   v_public_path:=left(v_public_base,33)||substr(replace(v_delivery_id::text,'-',''),1,6);
 end if;

 begin
   insert into public.deliveries(id,name,slug,public_share_path,description,phone,whatsapp,active,city_id,theme_key,created_at,updated_at)
   values(v_delivery_id,v_name,v_slug,v_public_path,nullif(trim(coalesce(p_description,'')),''),
     nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
     true,v_city_id,'HTPWEB',now(),now());
 exception when unique_violation then
   v_public_path:=left(v_public_base,33)||substr(replace(v_delivery_id::text,'-',''),1,6);
   insert into public.deliveries(id,name,slug,public_share_path,description,phone,whatsapp,active,city_id,theme_key,created_at,updated_at)
   values(v_delivery_id,v_name,v_slug,v_public_path,nullif(trim(coalesce(p_description,'')),''),
     nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
     true,v_city_id,'HTPWEB',now(),now());
 end;

 insert into public.account_delivery_roles(user_id,delivery_id,role_code,active,created_at,updated_at)
 values(auth.uid(),v_delivery_id,'DELIVERY_ADMIN',true,now(),now())
 on conflict(user_id,delivery_id) do update
 set role_code='DELIVERY_ADMIN',active=true,updated_at=now();

 insert into public.user_deliveries(user_id,delivery_id,active,driver_mode)
 values(auth.uid(),v_delivery_id,true,'REGULAR')
 on conflict(user_id,delivery_id) do update set active=true,driver_mode='REGULAR';

 insert into public.plan_assignments(
   plan_id,delivery_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata,
   plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,
   change_type,selection_reset_required,plan_version_snapshot,created_at,updated_at
 ) select
   p.id,v_delivery_id,'TRIAL',now(),now()+interval '15 days',now()+interval '15 days',auth.uid(),
   jsonb_build_object('source','SELF_SERVICE','zone_limit',1,'selected_zone_id',p_zone_id),
   p.name,p.price,p.currency,p.duration_months,'NEW',false,p.plan_version,now(),now()
 from public.subscription_plans p where p.id=v_plan_id;

 insert into public.delivery_zones(delivery_id,zone_id,active,created_at)
 values(v_delivery_id,p_zone_id,true,now())
 on conflict(delivery_id,zone_id) do update set active=true;

 return v_delivery_id;
end $$;
