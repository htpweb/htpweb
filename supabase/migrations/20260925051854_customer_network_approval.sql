alter table public.customer_deliveries
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id);

create index if not exists customer_deliveries_delivery_approval_idx
  on public.customer_deliveries(delivery_id,active,allow_orders,approved_at);

create or replace function public.customer_can_order_delivery(
  p_customer_id uuid,
  p_delivery_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_mode text;
  v_relation record;
begin
  if p_customer_id is null or p_delivery_id is null then return false; end if;
  if not public.delivery_service_is_active(p_delivery_id) then return false; end if;

  select cd.active,cd.allow_orders,cd.approved_at
  into v_relation
  from public.customer_deliveries cd
  where cd.customer_id=p_customer_id
    and cd.delivery_id=p_delivery_id
  limit 1;

  v_mode:=public.delivery_customer_access_mode_at(p_delivery_id,p_at);

  if v_mode='OPEN' then
    if v_relation.active is not null
       and (v_relation.active is not true or v_relation.allow_orders is not true)
    then
      return false;
    end if;
    return true;
  end if;

  if v_mode='PRIVATE' then
    return v_relation.active is true
      and v_relation.allow_orders is true;
  end if;

  if v_mode='APPROVAL_REQUIRED' then
    return v_relation.active is true
      and v_relation.allow_orders is true
      and v_relation.approved_at is not null;
  end if;

  return false;
end;
$$;

create or replace function public.delivery_customer_network_snapshot(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
    )
  )
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id',c.id,
    'name',c.name,
    'phone',c.phone,
    'email',c.email,
    'relationship_source',cd.relationship_source,
    'active',cd.active,
    'allow_orders',cd.allow_orders,
    'approved_at',cd.approved_at,
    'created_at',cd.created_at
  ) order by lower(coalesce(c.name,'')),cd.created_at desc),'[]'::jsonb)
  into v_result
  from public.customer_deliveries cd
  join public.customers c on c.id=cd.customer_id
  where cd.delivery_id=p_delivery_id;

  return v_result;
end;
$$;

create or replace function public.delivery_set_customer_order_access(
  p_delivery_id uuid,
  p_customer_id uuid,
  p_allow_orders boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_source text;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if not (
    public.delivery_has_capability(p_delivery_id,'customers.private_network')
    or public.delivery_has_capability(p_delivery_id,'customers.approval')
  ) then
    raise exception 'HTPWEB: tu plan no incluye gestión de red privada';
  end if;

  select relationship_source into v_source
  from public.customer_deliveries
  where customer_id=p_customer_id
    and delivery_id=p_delivery_id
  for update;

  if v_source is null then
    raise exception 'HTPWEB: el cliente no pertenece a la red de este DELIVERY';
  end if;

  update public.customer_deliveries
  set active=true,
      allow_orders=coalesce(p_allow_orders,false),
      approved_at=case
        when coalesce(p_allow_orders,false) then now()
        else approved_at
      end,
      approved_by=case
        when coalesce(p_allow_orders,false) then auth.uid()
        else approved_by
      end,
      updated_at=now()
  where customer_id=p_customer_id
    and delivery_id=p_delivery_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'customer_id',p_customer_id,
    'allow_orders',coalesce(p_allow_orders,false),
    'approved',coalesce(p_allow_orders,false)
  );
end;
$$;

revoke all on function public.delivery_customer_network_snapshot(uuid)
  from public,anon;
revoke all on function public.delivery_set_customer_order_access(uuid,uuid,boolean)
  from public,anon;
grant execute on function public.delivery_customer_network_snapshot(uuid)
  to authenticated;
grant execute on function public.delivery_set_customer_order_access(uuid,uuid,boolean)
  to authenticated;
