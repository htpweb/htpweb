create table if not exists private.local_creation_challenges(
  user_id uuid primary key references auth.users(id) on delete cascade,
  challenge_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
revoke all on private.local_creation_challenges from public,anon,authenticated;

create or replace function public.prepare_local_creation_challenge()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  v_code:='HTP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into private.local_creation_challenges(user_id,challenge_code,expires_at,created_at)
  values(auth.uid(),v_code,now()+interval '48 hours',now())
  on conflict(user_id) do update set challenge_code=excluded.challenge_code,expires_at=excluded.expires_at,created_at=excluded.created_at;
  return jsonb_build_object('challenge_code',v_code,'expires_at',now()+interval '48 hours');
end;
$$;
revoke all on function public.prepare_local_creation_challenge() from public;
grant execute on function public.prepare_local_creation_challenge() to authenticated;

create or replace function private.validate_local_creation_payload(p_payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare v_challenge private.local_creation_challenges%rowtype; v_path text; v_key text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select * into v_challenge from private.local_creation_challenges where user_id=auth.uid();
  if not found or v_challenge.expires_at<=now() then raise exception 'HTPWEB: genera un código HTPWEB vigente'; end if;
  if upper(coalesce(p_payload->>'challenge_code',''))<>upper(v_challenge.challenge_code) then raise exception 'HTPWEB: código HTPWEB inválido'; end if;
  if coalesce((p_payload->>'truth_confirmed')::boolean,false) is not true then raise exception 'HTPWEB: confirma la declaración de veracidad'; end if;

  foreach v_key in array array['ruc_pdf_path','identity_pdf_path','exterior_photo_path','interior_photo_path','code_photo_path'] loop
    v_path:=nullif(trim(p_payload->>v_key),'');
    if v_path is null then raise exception 'HTPWEB: falta evidencia obligatoria (%)',v_key; end if;
    if v_path not like auth.uid()::text||'/create-local/%' then raise exception 'HTPWEB: ruta de evidencia inválida'; end if;
  end loop;
  if nullif(trim(coalesce(p_payload->>'latitude','')),'') is null or nullif(trim(coalesce(p_payload->>'longitude','')),'') is null
    then raise exception 'HTPWEB: ubicación capturada requerida'; end if;
  perform (p_payload->>'latitude')::numeric,(p_payload->>'longitude')::numeric;
exception when invalid_text_representation then
  raise exception 'HTPWEB: coordenadas inválidas';
end;
$$;
revoke all on function private.validate_local_creation_payload(jsonb) from public,anon,authenticated;

create or replace function public.submit_my_local_creation_request(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=gen_random_uuid(); v_sector uuid; v_category uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true) then raise exception 'HTPWEB: perfil inválido o inactivo'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then raise exception 'HTPWEB: payload inválido'; end if;
  perform private.validate_local_creation_payload(p_payload);
  v_name:=nullif(trim(p_payload->>'name'),''); if v_name is null then raise exception 'HTPWEB: nombre del LOCAL requerido'; end if;
  begin v_sector:=(p_payload->>'sector_id')::uuid; exception when others then v_sector:=null; end;
  begin v_category:=(p_payload->>'category_id')::uuid; exception when others then v_category:=null; end;
  if v_sector is null or not exists(select 1 from public.business_sectors s where s.id=v_sector and s.active) then raise exception 'HTPWEB: sector de negocio inválido'; end if;
  if v_category is null or not exists(select 1 from public.local_business_categories c where c.id=v_category and c.active and c.sector_id=v_sector) then raise exception 'HTPWEB: categoría inválida para el sector seleccionado'; end if;
  if exists(select 1 from public.local_requests r where r.requested_by=auth.uid() and r.request_type='CREATE_LOCAL' and r.delivery_id is null and r.status in ('PENDING','NEEDS_INFO')) then raise exception 'HTPWEB: ya tienes una solicitud de creación de LOCAL abierta'; end if;

  insert into public.local_requests(id,request_type,delivery_id,local_id,requested_by,status,payload,review_deadline,created_at,updated_at)
  values(v_id,'CREATE_LOCAL',null,null,auth.uid(),'PENDING',p_payload||jsonb_build_object('source','HTPWEB_ACCOUNT','verification_status','PENDING_MASTER_REVIEW'),now()+interval '3 days',now(),now());
  insert into public.local_request_duplicates(request_id,local_id,score,reason,created_at)
  select v_id,l.id,
    case when nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g') then 1.0
      when lower(trim(l.name))=lower(v_name) and lower(trim(coalesce(l.address,'')))=lower(trim(coalesce(p_payload->>'address',''))) then .9 else .7 end,
    case when nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g') then 'PHONE_EXACT'
      when lower(trim(l.name))=lower(v_name) and lower(trim(coalesce(l.address,'')))=lower(trim(coalesce(p_payload->>'address',''))) then 'NAME_ADDRESS_EXACT' else 'NAME_EXACT' end,now()
  from public.locals l where l.active and (lower(trim(l.name))=lower(v_name) or
    (nullif(regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g'),'') is not null and regexp_replace(coalesce(l.phone,''),'\D','','g')=regexp_replace(coalesce(p_payload->>'phone',''),'\D','','g')))
  on conflict(request_id,local_id) do nothing;
  delete from private.local_creation_challenges where user_id=auth.uid();
  return v_id;
end;
$$;
revoke all on function public.submit_my_local_creation_request(jsonb) from public;
grant execute on function public.submit_my_local_creation_request(jsonb) to authenticated;

create or replace function public.update_my_local_creation_request(p_request_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare r public.local_requests%rowtype; v_sector uuid; v_category uuid;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select * into r from public.local_requests where id=p_request_id and requested_by=auth.uid() and request_type='CREATE_LOCAL' and delivery_id is null for update;
  if not found then raise exception 'HTPWEB: solicitud inexistente'; end if;
  if r.status<>'NEEDS_INFO' then raise exception 'HTPWEB: esta solicitud no admite actualización'; end if;
  perform private.validate_local_creation_payload(p_payload);
  begin v_sector:=(p_payload->>'sector_id')::uuid; exception when others then v_sector:=null; end;
  begin v_category:=(p_payload->>'category_id')::uuid; exception when others then v_category:=null; end;
  if v_sector is null or v_category is null or not exists(select 1 from public.local_business_categories c where c.id=v_category and c.active and c.sector_id=v_sector) then raise exception 'HTPWEB: sector/categoría inválidos'; end if;
  update public.local_requests set payload=p_payload||jsonb_build_object('source','HTPWEB_ACCOUNT','verification_status','PENDING_MASTER_REVIEW'),
    status='PENDING',review_note=null,reviewed_by=null,reviewed_at=null,review_deadline=now()+interval '3 days',updated_at=now()
  where id=r.id;
  delete from private.local_creation_challenges where user_id=auth.uid();
  return r.id;
end;
$$;
revoke all on function public.update_my_local_creation_request(uuid,jsonb) from public;
grant execute on function public.update_my_local_creation_request(uuid,jsonb) to authenticated;

