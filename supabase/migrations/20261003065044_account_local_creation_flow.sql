-- Allow any authenticated HTPWEB account to request creation of its own LOCAL.
alter table public.local_requests
  add column if not exists review_deadline timestamptz;

create or replace function public.submit_my_local_creation_request(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=gen_random_uuid(); v_sector uuid; v_category uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true)
    then raise exception 'HTPWEB: perfil inválido o inactivo'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object'
    then raise exception 'HTPWEB: payload inválido'; end if;
  v_name:=nullif(trim(p_payload->>'name'),'');
  if v_name is null then raise exception 'HTPWEB: nombre del LOCAL requerido'; end if;
  begin v_sector:=(p_payload->>'sector_id')::uuid; exception when others then v_sector:=null; end;
  begin v_category:=(p_payload->>'category_id')::uuid; exception when others then v_category:=null; end;
  if v_sector is null or not exists(select 1 from public.business_sectors s where s.id=v_sector and s.active)
    then raise exception 'HTPWEB: sector de negocio inválido'; end if;
  if v_category is null or not exists(select 1 from public.local_business_categories c where c.id=v_category and c.active and c.sector_id=v_sector)
    then raise exception 'HTPWEB: categoría inválida para el sector seleccionado'; end if;
  if exists(select 1 from public.local_requests r where r.requested_by=auth.uid() and r.request_type='CREATE_LOCAL'
    and r.delivery_id is null and r.status in ('PENDING','NEEDS_INFO'))
    then raise exception 'HTPWEB: ya tienes una solicitud de creación de LOCAL abierta'; end if;
  insert into public.local_requests(id,request_type,delivery_id,local_id,requested_by,status,payload,review_deadline,created_at,updated_at)
  values(v_id,'CREATE_LOCAL',null,null,auth.uid(),'PENDING',
    coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('source','HTPWEB_ACCOUNT'),
    now()+interval '3 days',now(),now());
  insert into public.local_request_duplicates(request_id,local_id,score,reason,created_at)
  select v_id,l.id,
    case when nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null
      and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g') then 1.0
      when lower(trim(l.name))=lower(v_name) and lower(trim(coalesce(l.address,'')))=lower(trim(coalesce(p_payload->>'address',''))) then .9
      else .7 end,
    case when nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null
      and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g') then 'PHONE_EXACT'
      when lower(trim(l.name))=lower(v_name) and lower(trim(coalesce(l.address,'')))=lower(trim(coalesce(p_payload->>'address',''))) then 'NAME_ADDRESS_EXACT'
      else 'NAME_EXACT' end,now()
  from public.locals l where l.active and (
    lower(trim(l.name))=lower(v_name) or
    (nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'))
  ) on conflict(request_id,local_id) do nothing;
  return v_id;
end;
$$;
revoke all on function public.submit_my_local_creation_request(jsonb) from public;
grant execute on function public.submit_my_local_creation_request(jsonb) to authenticated;

create or replace function public.my_local_creation_requests()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'status',r.status,'payload',r.payload,'review_note',r.review_note,
   'review_deadline',r.review_deadline,'created_at',r.created_at,'updated_at',r.updated_at,
   'result_local_id',r.result_local_id,'applied_at',r.applied_at,
   'possible_duplicate_local_id',r.possible_duplicate_local_id
 ) order by r.created_at desc),'[]'::jsonb)
 from public.local_requests r
 where r.requested_by=auth.uid() and r.request_type='CREATE_LOCAL' and r.delivery_id is null;
$$;
revoke all on function public.my_local_creation_requests() from public;
grant execute on function public.my_local_creation_requests() to authenticated;

alter function public.master_apply_local_request(uuid,boolean)
  rename to master_apply_local_request_delivery_legacy;

create or replace function public.master_apply_local_request(p_request_id uuid,p_convert_customer_to_local_admin boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare r public.local_requests%rowtype; v_local uuid; v_name text; v_slug text; v_category uuid; v_sector uuid;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 select * into r from public.local_requests where id=p_request_id for update;
 if not found then raise exception 'HTPWEB: solicitud inexistente'; end if;
 if not (r.request_type='CREATE_LOCAL' and r.delivery_id is null) then
   return public.master_apply_local_request_delivery_legacy(p_request_id,p_convert_customer_to_local_admin);
 end if;
 if r.status<>'APPROVED' then raise exception 'HTPWEB: solamente se pueden aplicar solicitudes APPROVED'; end if;
 if r.applied_at is not null then raise exception 'HTPWEB: la solicitud ya fue aplicada'; end if;
 if r.possible_duplicate_local_id is not null then
   v_local:=r.possible_duplicate_local_id;
   if not exists(select 1 from public.locals l where l.id=v_local and l.active)
     then raise exception 'HTPWEB: LOCAL duplicado inexistente o inactivo'; end if;
 else
   v_name:=nullif(trim(r.payload->>'name'),'');
   begin v_category:=(r.payload->>'category_id')::uuid; exception when others then v_category:=null; end;
   begin v_sector:=(r.payload->>'sector_id')::uuid; exception when others then v_sector:=null; end;
   if v_name is null or v_category is null or v_sector is null then raise exception 'HTPWEB: solicitud incompleta'; end if;
   if not exists(select 1 from public.local_business_categories c where c.id=v_category and c.sector_id=v_sector and c.active)
     then raise exception 'HTPWEB: categoría/sector inválidos'; end if;
   v_local:=gen_random_uuid();
   v_slug:=regexp_replace(lower(v_name),'[^a-z0-9]+','-','g');
   v_slug:=trim(both '-' from v_slug);
   if v_slug='' then v_slug:='local'; end if;
   v_slug:=v_slug||'-'||substr(replace(v_local::text,'-',''),1,8);

   insert into public.locals(id,name,slug,description,address,latitude,longitude,phone,whatsapp,active,business_category_id,created_at,updated_at)
   values(v_local,v_name,v_slug,nullif(trim(r.payload->>'description'),''),
     nullif(trim(r.payload->>'address'),''),
     nullif(trim(r.payload->>'latitude'),'')::numeric,nullif(trim(r.payload->>'longitude'),'')::numeric,
     nullif(trim(r.payload->>'phone'),''),nullif(trim(r.payload->>'whatsapp'),''),true,v_category,now(),now());
   insert into public.local_business_category_assignments(local_id,category_id,position,created_at)
   values(v_local,v_category,1,now()) on conflict(local_id,category_id) do update set position=1;
   insert into public.local_commerce_settings(local_id,storefront_enabled,preset_code,order_mode,pickup_enabled,own_delivery_enabled,htpweb_delivery_enabled,updated_by)
   values(v_local,false,
     case when (select code from public.business_sectors where id=v_sector)='RESTAURANTS' then 'FOOD_VISUAL' else 'GENERAL_MODERN' end,
     'WHATSAPP_ONLY',true,false,true,auth.uid())
   on conflict(local_id) do nothing;
 end if;
 insert into public.user_locals(user_id,local_id,active,created_at)
 values(r.requested_by,v_local,true,now())
 on conflict(user_id,local_id) do update set active=true;
 update public.local_requests set result_local_id=v_local,applied_by=auth.uid(),applied_at=now(),
   application_summary=jsonb_build_object('action',case when r.possible_duplicate_local_id is null then 'CREATED_NEW_LOCAL' else 'CLAIMED_EXISTING_LOCAL' end,
     'result_local_id',v_local,'owner_user_id',r.requested_by),
   updated_at=now()
 where id=r.id;
 return v_local;
end;
$$;
revoke all on function public.master_apply_local_request(uuid,boolean) from public;
grant execute on function public.master_apply_local_request(uuid,boolean) to authenticated;

