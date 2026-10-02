-- Safe self-service LOCAL claim submission. MASTER still reviews and applies the claim.

create or replace function public.submit_local_claim(p_local_id uuid,p_evidence jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_role text;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select r.code into v_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.active=true and r.active=true;
  if v_role<>'CLIENT' then raise exception 'HTPWEB: la reclamación inicial debe realizarla una cuenta CLIENT'; end if;

  if not exists(select 1 from public.locals l where l.id=p_local_id and l.active=true) then
    raise exception 'HTPWEB: LOCAL inexistente o inactivo';
  end if;
  if exists(select 1 from public.user_locals ul where ul.local_id=p_local_id and ul.active=true) then
    raise exception 'HTPWEB: este LOCAL ya tiene administrador';
  end if;
  if exists(
    select 1 from public.local_requests r
    where r.local_id=p_local_id and r.request_type='CLAIM_LOCAL'
      and r.status in ('PENDING','NEEDS_INFO','APPROVED') and r.applied_at is null
  ) then raise exception 'HTPWEB: este LOCAL ya tiene una reclamación en revisión'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>8192 then
    raise exception 'HTPWEB: evidencia inválida';
  end if;

  insert into public.local_requests(request_type,delivery_id,local_id,requested_by,status,payload,created_at,updated_at)
  values('CLAIM_LOCAL',null,p_local_id,auth.uid(),'PENDING',p_evidence,now(),now())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_local_claim(uuid,jsonb) from public,anon;
grant execute on function public.submit_local_claim(uuid,jsonb) to authenticated;
