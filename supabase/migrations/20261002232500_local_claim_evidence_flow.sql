-- LOCAL claim evidence flow originating from each DELIVERY-visible LOCAL.

create or replace function public.public_local_claim_state(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'claimed',exists(select 1 from public.user_locals ul where ul.local_id=l.id and ul.active=true),
    'pending',exists(
      select 1 from public.local_requests r
      where r.local_id=l.id and r.request_type='CLAIM_LOCAL'
        and r.status in ('PENDING','NEEDS_INFO','APPROVED') and r.applied_at is null
    )
  )
  from public.locals l
  where l.id=p_local_id and l.active=true;
$$;
revoke all on function public.public_local_claim_state(uuid) from public;
grant execute on function public.public_local_claim_state(uuid) to anon,authenticated;

create or replace function public.submit_local_claim(p_local_id uuid,p_evidence jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid;
  v_role text;
  v_local public.locals%rowtype;
  v_challenge text;
  v_declared_whatsapp text;
  v_registered_digits text;
  v_declared_digits text;
  v_method text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;

  select r.code into v_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.active=true and r.active=true;
  if v_role<>'CLIENT' then raise exception 'HTPWEB: la reclamación inicial debe realizarla una cuenta CLIENT'; end if;

  select * into v_local from public.locals l where l.id=p_local_id and l.active=true;
  if not found then raise exception 'HTPWEB: LOCAL inexistente o inactivo'; end if;
  if exists(select 1 from public.user_locals ul where ul.local_id=p_local_id and ul.active=true) then
    raise exception 'HTPWEB: este LOCAL ya está administrado por su propietario';
  end if;
  if exists(
    select 1 from public.local_requests r
    where r.local_id=p_local_id and r.request_type='CLAIM_LOCAL'
      and r.status in ('PENDING','NEEDS_INFO','APPROVED') and r.applied_at is null
  ) then raise exception 'HTPWEB: este LOCAL ya tiene una reclamación en revisión'; end if;

  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>12000 then
    raise exception 'HTPWEB: evidencia inválida';
  end if;
  if nullif(trim(p_evidence->>'responsible_name'),'') is null then raise exception 'HTPWEB: indica el nombre del responsable'; end if;
  if nullif(trim(p_evidence->>'responsible_role'),'') is null then raise exception 'HTPWEB: indica tu relación con el negocio'; end if;
  if nullif(trim(p_evidence->>'declared_whatsapp'),'') is null then raise exception 'HTPWEB: indica tu WhatsApp de contacto'; end if;

  v_method:=upper(trim(coalesce(p_evidence->>'verification_method','')));
  if v_method not in ('REGISTERED_WHATSAPP','SOCIAL','PHYSICAL','DOCUMENT') then
    raise exception 'HTPWEB: método de verificación inválido';
  end if;

  v_challenge:='HTP-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
  v_declared_whatsapp:=trim(p_evidence->>'declared_whatsapp');
  v_registered_digits:=regexp_replace(coalesce(v_local.whatsapp,''),'[^0-9]','','g');
  v_declared_digits:=regexp_replace(v_declared_whatsapp,'[^0-9]','','g');

  insert into public.local_requests(request_type,delivery_id,local_id,requested_by,status,payload,created_at,updated_at)
  values(
    'CLAIM_LOCAL',null,p_local_id,auth.uid(),'PENDING',
    jsonb_strip_nulls(
      p_evidence ||
      jsonb_build_object(
        'challenge_code',v_challenge,
        'registered_whatsapp_masked',
          case when length(v_registered_digits)>=4 then '***'||right(v_registered_digits,4) else null end,
        'declared_whatsapp_matches_registered',
          (v_registered_digits<>'' and right(v_registered_digits,9)=right(v_declared_digits,9)),
        'verification_status','PENDING_MASTER_VERIFICATION',
        'submitted_from','LOCAL_PAGE'
      )
    ),
    now(),now()
  )
  returning id into v_id;

  return v_id;
end $$;

-- MASTER-only expanded claim verification snapshot with canonical contact data.
create or replace function public.master_claim_verification_snapshot(p_request_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when public.is_master() then jsonb_build_object(
    'request_id',r.id,
    'status',r.status,
    'local_id',l.id,
    'local_name',l.name,
    'local_address',l.address,
    'registered_phone',l.phone,
    'registered_whatsapp',l.whatsapp,
    'instagram_url',l.instagram_url,
    'facebook_url',l.facebook_url,
    'tiktok_url',l.tiktok_url,
    'requested_by',r.requested_by,
    'payload',r.payload,
    'created_at',r.created_at
  ) else null end
  from public.local_requests r
  join public.locals l on l.id=r.local_id
  where r.id=p_request_id and r.request_type='CLAIM_LOCAL';
$$;
revoke all on function public.master_claim_verification_snapshot(uuid) from public,anon;
grant execute on function public.master_claim_verification_snapshot(uuid) to authenticated;
