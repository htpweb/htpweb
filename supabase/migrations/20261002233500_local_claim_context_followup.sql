-- Specific LOCAL claim context and evidence follow-up.

create or replace function public.claim_local_context(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id',l.id,
    'name',l.name,
    'address',l.address,
    'logo_url',l.logo_url,
    'phone_masked',case
      when length(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'))>=4
      then '***'||right(regexp_replace(l.phone,'[^0-9]','','g'),4) else null end,
    'whatsapp_masked',case
      when length(regexp_replace(coalesce(l.whatsapp,''),'[^0-9]','','g'))>=4
      then '***'||right(regexp_replace(l.whatsapp,'[^0-9]','','g'),4) else null end,
    'claimed',exists(select 1 from public.user_locals ul where ul.local_id=l.id and ul.active=true),
    'request',(
      select jsonb_build_object(
        'id',r.id,'status',r.status,'payload',r.payload,'review_note',r.review_note,
        'created_at',r.created_at,'applied_at',r.applied_at
      )
      from public.local_requests r
      where r.local_id=l.id and r.request_type='CLAIM_LOCAL' and r.requested_by=auth.uid()
      order by r.created_at desc limit 1
    )
  ) end
  from public.locals l
  where l.id=p_local_id and l.active=true;
$$;

create or replace function public.update_local_claim_evidence(p_request_id uuid,p_evidence jsonb)
returns void
language plpgsql security definer set search_path=''
as $$
declare r public.local_requests%rowtype; v_local public.locals%rowtype; v_declared text; v_registered text; v_declared_digits text; v_method text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select * into r from public.local_requests where id=p_request_id and request_type='CLAIM_LOCAL' for update;
  if not found or r.requested_by<>auth.uid() then raise exception 'HTPWEB: reclamación no disponible'; end if;
  if r.status<>'NEEDS_INFO' or r.applied_at is not null then raise exception 'HTPWEB: esta reclamación no admite actualización de evidencia'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>12000 then raise exception 'HTPWEB: evidencia inválida'; end if;
  if nullif(trim(p_evidence->>'responsible_name'),'') is null then raise exception 'HTPWEB: indica el nombre del responsable'; end if;
  if nullif(trim(p_evidence->>'responsible_role'),'') is null then raise exception 'HTPWEB: indica tu relación con el negocio'; end if;
  if nullif(trim(p_evidence->>'declared_whatsapp'),'') is null then raise exception 'HTPWEB: indica tu WhatsApp de contacto'; end if;

  v_method:=upper(trim(coalesce(p_evidence->>'verification_method','')));
  if v_method not in ('REGISTERED_WHATSAPP','SOCIAL','PHYSICAL','DOCUMENT') then raise exception 'HTPWEB: método de verificación inválido'; end if;
  select * into v_local from public.locals where id=r.local_id;
  v_declared:=trim(p_evidence->>'declared_whatsapp');
  v_registered:=regexp_replace(coalesce(v_local.whatsapp,''),'[^0-9]','','g');
  v_declared_digits:=regexp_replace(v_declared,'[^0-9]','','g');

  update public.local_requests
  set payload=jsonb_strip_nulls(
      (r.payload - 'verification_status' - 'declared_whatsapp_matches_registered') ||
      p_evidence ||
      jsonb_build_object(
        'declared_whatsapp_matches_registered',
          (v_registered<>'' and right(v_registered,9)=right(v_declared_digits,9)),
        'verification_status','PENDING_MASTER_VERIFICATION',
        'evidence_updated_at',now()
      )
    ),
    status='PENDING',
    review_note=null,
    updated_at=now()
  where id=p_request_id;
end $$;

revoke all on function public.claim_local_context(uuid) from public,anon;
revoke all on function public.update_local_claim_evidence(uuid,jsonb) from public,anon;
grant execute on function public.claim_local_context(uuid) to authenticated;
grant execute on function public.update_local_claim_evidence(uuid,jsonb) to authenticated;
