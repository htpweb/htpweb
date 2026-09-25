create or replace function public.delivery_limit_value(
  p_delivery_id uuid,
  p_limit_code text
)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb;
  v_code text:=lower(trim(coalesce(p_limit_code,'')));
  v_has_plan boolean;
begin
  if v_code='max_zones' then
    v_code:='zones.active.max';
  end if;

  v:=public.effective_plan_entitlement(
    p_delivery_id,
    null,
    'LIMIT',
    v_code
  );

  if v is not null then
    return floor((v#>>'{}')::numeric)::integer;
  end if;

  select exists(
    select 1
    from public.plan_assignments a
    where a.delivery_id=p_delivery_id
      and a.status in ('ACTIVE','TRIAL')
      and a.starts_at<=now()
      and (a.ends_at is null or a.ends_at>now())
      and (
        a.status<>'TRIAL'
        or a.trial_ends_at is null
        or a.trial_ends_at>now()
      )
  ) into v_has_plan;

  if v_has_plan then
    return null;
  end if;

  if to_regprocedure('public.delivery_limit_value_legacy(uuid,text)') is not null then
    return public.delivery_limit_value_legacy(p_delivery_id,p_limit_code);
  end if;

  return null;
end;
$$;

revoke execute on function public.delivery_limit_value(uuid,text)
  from public,anon,authenticated;
grant execute on function public.delivery_limit_value(uuid,text)
  to service_role;

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
as $$
declare
  v_mode text;
  v_relation record;
  v_customer record;
  v_restricted boolean:=false;
  v_allowed boolean:=false;
  v_auto_create boolean:=false;
  v_reason text:=null;
  v_source text:=null;
  v_contact_match boolean:=false;
  v_zone_limit integer;
  v_zone_count integer:=0;
  v_polygon_zone_count integer:=0;
  v_in_zone boolean:=false;
begin
  if p_customer_id is null or p_delivery_id is null then
    return jsonb_build_object('allowed',false,'reason','INVALID_CONTEXT','auto_create',false);
  end if;

  select c.phone,c.email into v_customer
  from public.customers c
  where c.id=p_customer_id and c.active=true;

  if not found then
    return jsonb_build_object('allowed',false,'reason','CUSTOMER_INACTIVE','auto_create',false);
  end if;

  if not exists(
    select 1 from public.deliveries d
    where d.id=p_delivery_id and d.active=true
  ) then
    return jsonb_build_object('allowed',false,'reason','DELIVERY_INACTIVE','auto_create',false);
  end if;

  if not public.delivery_service_is_active(p_delivery_id) then
    return jsonb_build_object('allowed',false,'reason','PLAN_INACTIVE','auto_create',false);
  end if;

  if not public.delivery_plan_selection_ready(p_delivery_id) then
    return jsonb_build_object(
      'allowed',false,
      'reason','PLAN_RECONFIGURATION_REQUIRED',
      'auto_create',false
    );
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude<-90 or p_latitude>90
     or p_longitude<-180 or p_longitude>180
  then
    return jsonb_build_object(
      'allowed',false,
      'reason','INVALID_LOCATION',
      'auto_create',false
    );
  end if;

  v_zone_limit:=public.delivery_limit_value(
    p_delivery_id,
    'zones.active.max'
  );

  if v_zone_limit is null or v_zone_limit<=0 then
    return jsonb_build_object(
      'allowed',false,
      'reason','COVERAGE_NOT_AVAILABLE',
      'auto_create',false
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where z.boundary is not null)::integer
  into v_zone_count,v_polygon_zone_count
  from public.delivery_zones dz
  join public.zones z on z.id=dz.zone_id
  where dz.delivery_id=p_delivery_id
    and dz.active=true
    and z.active=true;

  if v_zone_count=0 or v_polygon_zone_count<>v_zone_count then
    return jsonb_build_object(
      'allowed',false,
      'reason','COVERAGE_NOT_CONFIGURED',
      'auto_create',false
    );
  end if;

  if v_zone_count>v_zone_limit then
    return jsonb_build_object(
      'allowed',false,
      'reason','PLAN_RECONFIGURATION_REQUIRED',
      'auto_create',false
    );
  end if;

  select exists(
    select 1
    from public.delivery_zones dz
    join public.zones z on z.id=dz.zone_id
    where dz.delivery_id=p_delivery_id
      and dz.active=true
      and z.active=true
      and z.boundary is not null
      and public.htp_zone_contains(
        z.boundary,
        p_latitude,
        p_longitude
      )
  ) into v_in_zone;

  if not v_in_zone then
    return jsonb_build_object(
      'allowed',false,
      'reason','OUTSIDE_COVERAGE',
      'auto_create',false
    );
  end if;

  v_restricted:=public.delivery_location_is_restricted(
    p_delivery_id,p_latitude,p_longitude,coalesce(p_at,now())
  );

  if v_restricted then
    return jsonb_build_object(
      'allowed',false,
      'reason','RESTRICTED_AREA',
      'auto_create',false,
      'restricted',true
    );
  end if;

  v_mode:=public.delivery_customer_access_mode_at(
    p_delivery_id,
    coalesce(p_at,now())
  );

  select cd.active,cd.allow_orders,cd.approved_at,cd.relationship_source
  into v_relation
  from public.customer_deliveries cd
  where cd.customer_id=p_customer_id
    and cd.delivery_id=p_delivery_id
  limit 1;

  if v_relation.active is null
     and v_mode='PRIVATE'
     and public.delivery_has_capability(p_delivery_id,'contacts.import')
  then
    select exists(
      select 1
      from public.delivery_contacts dc
      where dc.delivery_id=p_delivery_id
        and dc.active=true
        and (
          (
            dc.phone_key is not null
            and dc.phone_key=public.htp_normalize_contact_phone(v_customer.phone)
          )
          or
          (
            dc.email_key is not null
            and dc.email_key=public.htp_normalize_contact_email(v_customer.email)
          )
        )
    ) into v_contact_match;
  end if;

  if v_mode='OPEN' then
    if v_relation.active is not null then
      v_allowed:=v_relation.active is true
        and v_relation.allow_orders is true;
      v_auto_create:=false;
      v_source:=v_relation.relationship_source;
      if not v_allowed then v_reason:='CUSTOMER_BLOCKED'; end if;
    else
      v_allowed:=true;
      v_auto_create:=true;
      v_source:='PUBLIC';
    end if;

  elsif v_mode='PRIVATE' then
    if v_relation.active is not null then
      v_allowed:=v_relation.active is true
        and v_relation.allow_orders is true;
      v_auto_create:=false;
      v_source:=v_relation.relationship_source;
      if not v_allowed then v_reason:='CUSTOMER_BLOCKED'; end if;
    elsif v_contact_match then
      v_allowed:=true;
      v_auto_create:=true;
      v_source:='CONTACT';
    else
      v_reason:='PRIVATE_NETWORK_REQUIRED';
    end if;

  elsif v_mode='APPROVAL_REQUIRED' then
    v_allowed:=v_relation.active is true
      and v_relation.allow_orders is true
      and v_relation.approved_at is not null;
    v_source:=v_relation.relationship_source;
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
    'relationship_source',v_source
  );
end;
$$;

revoke execute on function public.evaluate_customer_order_policy(uuid,uuid,numeric,numeric,timestamptz)
  from public,anon,authenticated;
grant execute on function public.evaluate_customer_order_policy(uuid,uuid,numeric,numeric,timestamptz)
  to service_role;
