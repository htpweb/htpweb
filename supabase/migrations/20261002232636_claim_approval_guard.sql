-- Require an explicit MASTER verification note before approving a LOCAL ownership claim.

do $$
begin
  if to_regprocedure('public.master_review_local_request(uuid,text,text,uuid)') is not null
     and to_regprocedure('public.master_review_local_request_legacy(uuid,text,text,uuid)') is null then
    alter function public.master_review_local_request(uuid,text,text,uuid)
      rename to master_review_local_request_legacy;
  end if;
end $$;

create or replace function public.master_review_local_request(
  p_request_id uuid,
  p_status text,
  p_review_note text,
  p_possible_duplicate_local_id uuid
) returns void
language plpgsql security definer set search_path=''
as $$
declare
  r public.local_requests%rowtype;
  v_status text:=upper(trim(coalesce(p_status,'')));
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;

  select * into r from public.local_requests where id=p_request_id;
  if not found then raise exception 'HTPWEB: solicitud inexistente'; end if;

  if r.request_type='CLAIM_LOCAL' and v_status='APPROVED' then
    if nullif(trim(coalesce(p_review_note,'')),'') is null then
      raise exception 'HTPWEB: documenta cómo verificaste que el solicitante administra este LOCAL';
    end if;
    if nullif(trim(coalesce(r.payload->>'responsible_name','')),'') is null
       or nullif(trim(coalesce(r.payload->>'challenge_code','')),'') is null then
      raise exception 'HTPWEB: la reclamación no contiene evidencia mínima de propiedad';
    end if;
  end if;

  perform public.master_review_local_request_legacy(
    p_request_id,p_status,p_review_note,p_possible_duplicate_local_id
  );
end $$;

revoke all on function public.master_review_local_request(uuid,text,text,uuid) from public,anon;
grant execute on function public.master_review_local_request(uuid,text,text,uuid) to authenticated;
