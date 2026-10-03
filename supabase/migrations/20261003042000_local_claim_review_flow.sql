-- Final LOCAL ownership claim flow: document review, location evidence, private uploads and client tracking.

create schema if not exists private;

create table if not exists private.local_claim_challenges (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  challenge_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id,local_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'local-claim-evidence','local-claim-evidence',false,8388608,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "claim evidence own insert" on storage.objects;
create policy "claim evidence own insert" on storage.objects
for insert to authenticated
with check(
  bucket_id='local-claim-evidence'
  and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "claim evidence own read" on storage.objects;
create policy "claim evidence own read" on storage.objects
for select to authenticated
using(
  bucket_id='local-claim-evidence'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_master())
);

drop policy if exists "claim evidence own update" on storage.objects;
create policy "claim evidence own update" on storage.objects
for update to authenticated
using(
  bucket_id='local-claim-evidence'
  and (storage.foldername(name))[1]=auth.uid()::text
)
with check(
  bucket_id='local-claim-evidence'
  and (storage.foldername(name))[1]=auth.uid()::text
);

create or replace function public.prepare_local_claim_challenge(p_local_id uuid)
returns text
language plpgsql security definer set search_path=''
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  if not exists(select 1 from public.locals where id=p_local_id and active=true) then
    raise exception 'HTPWEB: LOCAL inexistente o inactivo';
  end if;
  if exists(select 1 from public.user_locals where local_id=p_local_id and active=true) then
    raise exception 'HTPWEB: este LOCAL ya está administrado';
  end if;

  select challenge_code into v_code
  from private.local_claim_challenges
  where user_id=auth.uid() and local_id=p_local_id and expires_at>now();

  if v_code is null then
    v_code:='HTP-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
    insert into private.local_claim_challenges(user_id,local_id,challenge_code,expires_at,created_at)
    values(auth.uid(),p_local_id,v_code,now()+interval '48 hours',now())
    on conflict(user_id,local_id) do update set
      challenge_code=excluded.challenge_code,expires_at=excluded.expires_at,created_at=now();
  end if;
  return v_code;
end $$;
create table if not exists public.local_claim_whatsapp_otps (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,local_id)
);
alter table public.local_claim_whatsapp_otps enable row level security;
revoke all on table public.local_claim_whatsapp_otps from anon,authenticated;

create or replace function public.submit_local_claim(p_local_id uuid,p_evidence jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid; v_role text; v_local public.locals%rowtype; v_challenge text;
  v_declared text; v_registered text; v_declared_digits text; v_method text;
  v_lat double precision; v_lon double precision; v_distance double precision;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select r.code into v_role from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.active=true and r.active=true;
  if v_role<>'CLIENT' then raise exception 'HTPWEB: la reclamación inicial debe realizarla una cuenta CLIENT'; end if;

  select * into v_local from public.locals where id=p_local_id and active=true;
  if not found then raise exception 'HTPWEB: LOCAL inexistente o inactivo'; end if;
  if exists(select 1 from public.user_locals where local_id=p_local_id and active=true) then
    raise exception 'HTPWEB: este LOCAL ya está administrado por su propietario';
  end if;
  if exists(select 1 from public.local_requests where local_id=p_local_id and request_type='CLAIM_LOCAL'
    and status in ('PENDING','NEEDS_INFO','APPROVED') and applied_at is null) then
    raise exception 'HTPWEB: este LOCAL ya tiene una reclamación en revisión';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>24000 then
    raise exception 'HTPWEB: evidencia inválida';
  end if;
  if nullif(trim(p_evidence->>'responsible_name'),'') is null then raise exception 'HTPWEB: indica el nombre del responsable'; end if;
  if nullif(trim(p_evidence->>'responsible_role'),'') is null then raise exception 'HTPWEB: indica tu relación con el negocio'; end if;
  if nullif(trim(p_evidence->>'declared_whatsapp'),'') is null then raise exception 'HTPWEB: indica tu WhatsApp de contacto'; end if;

  v_method:=upper(trim(coalesce(p_evidence->>'verification_method','')));
  if v_method not in ('REGISTERED_WHATSAPP','DOCUMENT_LOCATION') then
    raise exception 'HTPWEB: método de verificación inválido';
  end if;
  if v_method='REGISTERED_WHATSAPP' and not exists(
    select 1 from public.local_claim_whatsapp_otps o
    where o.user_id=auth.uid() and o.local_id=p_local_id
      and o.verified_at is not null and o.verified_at>now()-interval '30 minutes'
  ) then
    raise exception 'HTPWEB: verifica primero el código enviado al WhatsApp registrado';
  end if;
  v_declared:=trim(p_evidence->>'declared_whatsapp');
  v_registered:=regexp_replace(coalesce(v_local.whatsapp,''),'[^0-9]','','g');
  v_declared_digits:=regexp_replace(v_declared,'[^0-9]','','g');

  if v_method='DOCUMENT_LOCATION' then
    v_prefix:=auth.uid()::text||'/'||p_local_id::text||'/';
    if nullif(p_evidence->>'ruc_pdf_path','') is null
      or nullif(p_evidence->>'identity_pdf_path','') is null
      or nullif(p_evidence->>'exterior_photo_path','') is null
      or nullif(p_evidence->>'interior_photo_path','') is null
      or nullif(p_evidence->>'code_photo_path','') is null then
      raise exception 'HTPWEB: carga RUC/RIMPE, identificación y las tres fotografías requeridas';
    end if;
    if left(p_evidence->>'ruc_pdf_path',length(v_prefix))<>v_prefix
      or left(p_evidence->>'identity_pdf_path',length(v_prefix))<>v_prefix
      or left(p_evidence->>'exterior_photo_path',length(v_prefix))<>v_prefix
      or left(p_evidence->>'interior_photo_path',length(v_prefix))<>v_prefix
      or left(p_evidence->>'code_photo_path',length(v_prefix))<>v_prefix then
      raise exception 'HTPWEB: ruta de evidencia inválida';
    end if;

    select challenge_code into v_challenge
    from private.local_claim_challenges
    where user_id=auth.uid() and local_id=p_local_id and expires_at>now();
    if v_challenge is null then raise exception 'HTPWEB: genera primero el código de evidencia'; end if;

    begin
      v_lat:=(p_evidence->>'location_latitude')::double precision;
      v_lon:=(p_evidence->>'location_longitude')::double precision;
    exception when others then
      raise exception 'HTPWEB: comparte una ubicación válida desde el establecimiento';
    end;
    if v_lat not between -90 and 90 or v_lon not between -180 and 180 then
      raise exception 'HTPWEB: ubicación inválida';
    end if;

    if v_local.latitude is not null and v_local.longitude is not null then
      v_distance:=6371000*2*asin(sqrt(
        power(sin(radians((v_lat-v_local.latitude)::double precision)/2),2)+
        cos(radians(v_local.latitude::double precision))*cos(radians(v_lat))*
        power(sin(radians((v_lon-v_local.longitude)::double precision)/2),2)
      ));
    end if;
  else
    v_challenge:='HTP-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
  end if;
  insert into public.local_requests(request_type,delivery_id,local_id,requested_by,status,payload,created_at,updated_at)
  values(
    'CLAIM_LOCAL',null,p_local_id,auth.uid(),'PENDING',
    jsonb_strip_nulls(
      p_evidence || jsonb_build_object(
        'challenge_code',v_challenge,
        'registered_whatsapp_masked',case when length(v_registered)>=4 then '***'||right(v_registered,4) else null end,
        'declared_whatsapp_matches_registered',(v_registered<>'' and right(v_registered,9)=right(v_declared_digits,9)),
        'location_distance_m',case when v_distance is null then null else round(v_distance::numeric,1) end,
        'verification_status',case when v_method='REGISTERED_WHATSAPP' then 'AWAITING_WHATSAPP_OTP' else 'PENDING_MASTER_REVIEW' end,
        'submitted_from','LOCAL_PAGE',
        'submitted_at',now(),
        'review_deadline',now()+interval '3 days'
      )
    ),now(),now()
  ) returning id into v_id;

  return v_id;
end $$;

create or replace function public.my_local_claims()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'local_id',r.local_id,'local_name',l.name,'local_logo_url',l.logo_url,
    'status',r.status,'payload',r.payload,'review_note',r.review_note,
    'created_at',r.created_at,'updated_at',r.updated_at,'applied_at',r.applied_at
  ) order by r.created_at desc),'[]'::jsonb)
  from public.local_requests r
  join public.locals l on l.id=r.local_id
  where r.request_type='CLAIM_LOCAL' and r.requested_by=auth.uid();
$$;
create or replace function public.master_claim_verification_snapshot(p_request_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when public.is_master() then jsonb_build_object(
    'request_id',r.id,'status',r.status,'local_id',l.id,'local_name',l.name,
    'local_address',l.address,'local_latitude',l.latitude,'local_longitude',l.longitude,
    'registered_phone',l.phone,'registered_whatsapp',l.whatsapp,
    'requested_by',r.requested_by,'payload',r.payload,'created_at',r.created_at
  ) else null end
  from public.local_requests r join public.locals l on l.id=r.local_id
  where r.id=p_request_id and r.request_type='CLAIM_LOCAL';
$$;

revoke all on function public.prepare_local_claim_challenge(uuid) from public,anon;
revoke all on function public.my_local_claims() from public,anon;
grant execute on function public.prepare_local_claim_challenge(uuid) to authenticated;
grant execute on function public.my_local_claims() to authenticated;
revoke all on function public.submit_local_claim(uuid,jsonb) from public,anon;
grant execute on function public.submit_local_claim(uuid,jsonb) to authenticated;
revoke all on function public.master_claim_verification_snapshot(uuid) from public,anon;
grant execute on function public.master_claim_verification_snapshot(uuid) to authenticated;
create or replace function public.update_local_claim_evidence(p_request_id uuid,p_evidence jsonb)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  r public.local_requests%rowtype; v_local public.locals%rowtype; v_method text;
  v_lat double precision; v_lon double precision; v_distance double precision; v_prefix text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select * into r from public.local_requests where id=p_request_id and request_type='CLAIM_LOCAL' for update;
  if not found or r.requested_by<>auth.uid() then raise exception 'HTPWEB: reclamación no disponible'; end if;
  if r.status<>'NEEDS_INFO' or r.applied_at is not null then raise exception 'HTPWEB: esta reclamación no admite actualización'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>24000 then raise exception 'HTPWEB: evidencia inválida'; end if;
  if nullif(trim(p_evidence->>'responsible_name'),'') is null then raise exception 'HTPWEB: indica el nombre del responsable'; end if;
  if nullif(trim(p_evidence->>'responsible_role'),'') is null then raise exception 'HTPWEB: indica tu relación con el negocio'; end if;
  if nullif(trim(p_evidence->>'declared_whatsapp'),'') is null then raise exception 'HTPWEB: indica tu WhatsApp'; end if;
  v_method:=upper(trim(coalesce(p_evidence->>'verification_method','')));
  if v_method<>'DOCUMENT_LOCATION' then raise exception 'HTPWEB: la información adicional debe enviarse por la vía documental'; end if;
  select * into v_local from public.locals where id=r.local_id;
  v_prefix:=auth.uid()::text||'/'||r.local_id::text||'/';
  if nullif(p_evidence->>'ruc_pdf_path','') is null or nullif(p_evidence->>'identity_pdf_path','') is null
    or nullif(p_evidence->>'exterior_photo_path','') is null or nullif(p_evidence->>'interior_photo_path','') is null
    or nullif(p_evidence->>'code_photo_path','') is null then
    raise exception 'HTPWEB: carga todos los documentos y fotografías requeridos';
  end if;
  if left(p_evidence->>'ruc_pdf_path',length(v_prefix))<>v_prefix
    or left(p_evidence->>'identity_pdf_path',length(v_prefix))<>v_prefix
    or left(p_evidence->>'exterior_photo_path',length(v_prefix))<>v_prefix
    or left(p_evidence->>'interior_photo_path',length(v_prefix))<>v_prefix
    or left(p_evidence->>'code_photo_path',length(v_prefix))<>v_prefix then
    raise exception 'HTPWEB: ruta de evidencia inválida';
  end if;
  begin
    v_lat:=(p_evidence->>'location_latitude')::double precision;
    v_lon:=(p_evidence->>'location_longitude')::double precision;
  exception when others then raise exception 'HTPWEB: comparte una ubicación válida'; end;
  if v_local.latitude is not null and v_local.longitude is not null then
    v_distance:=6371000*2*asin(sqrt(
      power(sin(radians((v_lat-v_local.latitude)::double precision)/2),2)+
      cos(radians(v_local.latitude::double precision))*cos(radians(v_lat))*
      power(sin(radians((v_lon-v_local.longitude)::double precision)/2),2)
    ));
  end if;
  update public.local_requests set
    payload=jsonb_strip_nulls((r.payload-'verification_status')||p_evidence||jsonb_build_object(
      'location_distance_m',case when v_distance is null then null else round(v_distance::numeric,1) end,
      'verification_status','PENDING_MASTER_REVIEW','evidence_updated_at',now(),'review_deadline',now()+interval '3 days'
    )),
    status='PENDING',review_note=null,updated_at=now()
  where id=p_request_id;
end $$;

revoke all on function public.update_local_claim_evidence(uuid,jsonb) from public,anon;
grant execute on function public.update_local_claim_evidence(uuid,jsonb) to authenticated;
