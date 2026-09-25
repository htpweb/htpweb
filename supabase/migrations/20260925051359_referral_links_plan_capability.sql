
create or replace function public.delivery_create_referral_code(
  p_delivery_id uuid,
  p_label text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_code text; v_id uuid;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if not (
    public.delivery_has_capability(p_delivery_id,'referrals.codes')
    or public.delivery_has_capability(p_delivery_id,'referrals.links')
  ) then
    raise exception 'HTPWEB: tu plan no incluye invitaciones o referidos';
  end if;

  loop
    v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    exit when not exists(
      select 1 from public.delivery_referral_codes where code=v_code
    );
  end loop;

  insert into public.delivery_referral_codes(
    delivery_id,code,label,expires_at,created_by
  )
  values(
    p_delivery_id,
    v_code,
    nullif(trim(coalesce(p_label,'')),''),
    p_expires_at,
    auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'code',v_code,
    'delivery_id',p_delivery_id,
    'expires_at',p_expires_at
  );
end;
$$;

create or replace function public.claim_delivery_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_ref record; v_customer uuid;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
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

  if not (
    public.delivery_has_capability(v_ref.delivery_id,'referrals.codes')
    or public.delivery_has_capability(v_ref.delivery_id,'referrals.links')
  ) then
    raise exception 'HTPWEB: referidos no disponibles para este DELIVERY';
  end if;

  insert into public.customer_deliveries(
    customer_id,delivery_id,active,allow_orders,
    relationship_source,referral_code_id,created_at,updated_at
  )
  values(
    v_customer,v_ref.delivery_id,true,true,
    'REFERRAL_CODE',v_ref.id,now(),now()
  )
  on conflict(customer_id,delivery_id)
  do update set
    active=true,
    allow_orders=true,
    relationship_source='REFERRAL_CODE',
    referral_code_id=excluded.referral_code_id,
    updated_at=now();

  return jsonb_build_object(
    'delivery_id',v_ref.delivery_id,
    'customer_id',v_customer,
    'status','AUTHORIZED'
  );
end;
$$;
