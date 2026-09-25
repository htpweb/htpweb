-- Checkout policy bridge for service-role Edge Function.
-- Keeps PRIVATE/APPROVAL schedules and restricted areas authoritative in PostgreSQL.

create or replace function public.evaluate_customer_order_policy(
  p_customer_id uuid,
  p_delivery_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_mode text;
  v_relation record;
  v_restricted boolean:=false;
  v_allowed boolean:=false;
  v_auto_create boolean:=false;
  v_reason text:=null;
begin
  if p_customer_id is null or p_delivery_id is null then
    return jsonb_build_object('allowed',false,'reason','INVALID_CONTEXT','auto_create',false);
  end if;

  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.active=true) then
    return jsonb_build_object('allowed',false,'reason','CUSTOMER_INACTIVE','auto_create',false);
  end if;

  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then
    return jsonb_build_object('allowed',false,'reason','DELIVERY_INACTIVE','auto_create',false);
  end if;

  if not public.delivery_service_is_active(p_delivery_id) then
    return jsonb_build_object('allowed',false,'reason','PLAN_INACTIVE','auto_create',false);
  end if;

  if not public.delivery_plan_selection_ready(p_delivery_id) then
    return jsonb_build_object('allowed',false,'reason','PLAN_RECONFIGURATION_REQUIRED','auto_create',false);
  end if;

  if p_latitude is not null and p_longitude is not null then
    v_restricted:=public.delivery_location_is_restricted(
      p_delivery_id,p_latitude,p_longitude,coalesce(p_at,now())
    );
    if v_restricted then
      return jsonb_build_object(
        'allowed',false,'reason','RESTRICTED_AREA','auto_create',false,'restricted',true
      );
    end if;
  end if;

  v_mode:=public.delivery_customer_access_mode_at(p_delivery_id,coalesce(p_at,now()));

  select cd.active,cd.allow_orders,cd.approved_at,cd.relationship_source
  into v_relation
  from public.customer_deliveries cd
  where cd.customer_id=p_customer_id and cd.delivery_id=p_delivery_id
  limit 1;

  if v_mode='OPEN' then
    if v_relation.active is not null then
      v_allowed:=v_relation.active is true and v_relation.allow_orders is true;
      v_auto_create:=false;
      if not v_allowed then v_reason:='CUSTOMER_BLOCKED'; end if;
    else
      v_allowed:=true;
      v_auto_create:=true;
    end if;
  elsif v_mode='PRIVATE' then
    v_allowed:=v_relation.active is true and v_relation.allow_orders is true;
    if not v_allowed then v_reason:='PRIVATE_NETWORK_REQUIRED'; end if;
  elsif v_mode='APPROVAL_REQUIRED' then
    v_allowed:=v_relation.active is true
      and v_relation.allow_orders is true
      and v_relation.approved_at is not null;
    if not v_allowed then v_reason:='APPROVAL_REQUIRED'; end if;
  else
    v_reason:='ACCESS_MODE_DENIED';
  end if;

  return jsonb_build_object(
    'allowed',v_allowed,
    'reason',v_reason,
    'auto_create',v_auto_create,
    'access_mode',v_mode,
    'restricted',v_restricted,
    'relationship_source',v_relation.relationship_source
  );
end;
$function$;

revoke all on function public.evaluate_customer_order_policy(uuid,uuid,numeric,numeric,timestamptz)
  from public,anon,authenticated;
grant execute on function public.evaluate_customer_order_policy(uuid,uuid,numeric,numeric,timestamptz)
  to service_role;

create or replace function public.delivery_referral_codes_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
    )
  ) then
    raise exception 'HTPWEB: no autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'code',r.code,'label',r.label,'active',r.active,
    'expires_at',r.expires_at,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_result
  from public.delivery_referral_codes r
  where r.delivery_id=p_delivery_id;

  return v_result;
end;
$function$;

revoke all on function public.delivery_referral_codes_snapshot(uuid) from public,anon;
grant execute on function public.delivery_referral_codes_snapshot(uuid) to authenticated;

create or replace function public.delivery_set_referral_code_active(
  p_delivery_id uuid,
  p_referral_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  update public.delivery_referral_codes
  set active=coalesce(p_active,false),updated_at=now()
  where id=p_referral_id and delivery_id=p_delivery_id;

  return found;
end;
$function$;

revoke all on function public.delivery_set_referral_code_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.delivery_set_referral_code_active(uuid,uuid,boolean) to authenticated;
