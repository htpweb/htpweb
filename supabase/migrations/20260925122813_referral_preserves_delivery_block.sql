create or replace function public.claim_delivery_referral(
  p_code text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ref record;
  v_customer uuid;
  v_existing record;
  v_source text:=upper(trim(coalesce(p_source,'REFERRAL_CODE')));
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if v_source not in ('REFERRAL_CODE','REFERRAL_LINK') then
    raise exception 'HTPWEB: origen de referido inválido';
  end if;

  v_customer:=public.current_customer_id();
  if v_customer is null then
    raise exception 'HTPWEB: primero crea tu perfil de cliente';
  end if;

  select r.* into v_ref
  from public.delivery_referral_codes r
  where r.code=upper(trim(p_code))
    and r.active=true
    and (r.expires_at is null or r.expires_at>now())
  limit 1;

  if v_ref.id is null then
    raise exception 'HTPWEB: código de referido inválido o vencido';
  end if;

  if v_source='REFERRAL_LINK'
     and not public.delivery_has_capability(v_ref.delivery_id,'referrals.links')
  then
    raise exception 'HTPWEB: el plan no incluye enlaces de referido';
  end if;

  if v_source='REFERRAL_CODE'
     and not public.delivery_has_capability(v_ref.delivery_id,'referrals.codes')
  then
    raise exception 'HTPWEB: el plan no incluye códigos de referido';
  end if;

  select cd.active,cd.allow_orders,cd.relationship_source
  into v_existing
  from public.customer_deliveries cd
  where cd.customer_id=v_customer
    and cd.delivery_id=v_ref.delivery_id
  for update;

  if found and (
    v_existing.active is distinct from true
    or v_existing.allow_orders is distinct from true
  ) then
    raise exception 'HTPWEB: este DELIVERY bloqueó tu acceso; un referido no puede reactivarlo';
  end if;

  insert into public.customer_deliveries(
    customer_id,delivery_id,active,allow_orders,
    relationship_source,referral_code_id,created_at,updated_at
  )
  values(
    v_customer,v_ref.delivery_id,true,true,
    v_source,v_ref.id,now(),now()
  )
  on conflict(customer_id,delivery_id)
  do update set
    relationship_source=v_source,
    referral_code_id=excluded.referral_code_id,
    updated_at=now();

  return jsonb_build_object(
    'delivery_id',v_ref.delivery_id,
    'customer_id',v_customer,
    'relationship_source',v_source,
    'status','AUTHORIZED'
  );
end;
$$;

revoke execute on function public.claim_delivery_referral(text,text) from public,anon;
grant execute on function public.claim_delivery_referral(text,text) to authenticated;
