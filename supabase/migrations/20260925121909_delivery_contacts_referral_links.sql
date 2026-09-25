create or replace function public.htp_normalize_contact_phone(p_phone text)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $$
declare v text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if v='' then return null; end if;
  if length(v)=10 and left(v,1)='0' then return substr(v,2); end if;
  if length(v)=12 and left(v,3)='593' then return substr(v,4); end if;
  return v;
end;
$$;

create or replace function public.htp_normalize_contact_email(p_email text)
returns text
language sql
immutable
security definer
set search_path=''
as $$
  select nullif(lower(trim(coalesce(p_email,''))),'');
$$;

revoke execute on function public.htp_normalize_contact_phone(text) from public,anon,authenticated;
revoke execute on function public.htp_normalize_contact_email(text) from public,anon,authenticated;

create table if not exists public.delivery_contacts(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  name text,
  phone text,
  phone_key text,
  email text,
  email_key text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(phone_key is not null or email_key is not null)
);

create unique index if not exists delivery_contacts_phone_uq
  on public.delivery_contacts(delivery_id,phone_key)
  where phone_key is not null;

create unique index if not exists delivery_contacts_email_uq
  on public.delivery_contacts(delivery_id,email_key)
  where email_key is not null;

create index if not exists delivery_contacts_delivery_active_idx
  on public.delivery_contacts(delivery_id,active);

alter table public.delivery_contacts enable row level security;
revoke all on table public.delivery_contacts from anon,authenticated;

create or replace function public.delivery_import_contacts(
  p_delivery_id uuid,
  p_contacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_name text;
  v_phone text;
  v_email text;
  v_phone_key text;
  v_email_key text;
  v_id uuid;
  v_count integer:=0;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'contacts.import') then
    raise exception 'HTPWEB: tu plan no incluye importación de contactos';
  end if;

  if p_contacts is null or jsonb_typeof(p_contacts)<>'array' then
    raise exception 'HTPWEB: contactos inválidos';
  end if;

  if jsonb_array_length(p_contacts)<1 or jsonb_array_length(p_contacts)>500 then
    raise exception 'HTPWEB: importa entre 1 y 500 contactos por lote';
  end if;

  for v_item in select value from jsonb_array_elements(p_contacts) loop
    v_name:=nullif(trim(coalesce(v_item->>'name','')),'');
    v_phone:=nullif(trim(coalesce(v_item->>'phone','')),'');
    v_email:=nullif(trim(coalesce(v_item->>'email','')),'');
    v_phone_key:=public.htp_normalize_contact_phone(v_phone);
    v_email_key:=public.htp_normalize_contact_email(v_email);

    if v_phone_key is null and v_email_key is null then
      raise exception 'HTPWEB: cada contacto necesita teléfono o correo';
    end if;

    v_id:=null;

    if v_phone_key is not null then
      select c.id into v_id
      from public.delivery_contacts c
      where c.delivery_id=p_delivery_id and c.phone_key=v_phone_key
      limit 1;
    end if;

    if v_id is null and v_email_key is not null then
      select c.id into v_id
      from public.delivery_contacts c
      where c.delivery_id=p_delivery_id and c.email_key=v_email_key
      limit 1;
    end if;

    if v_id is null then
      insert into public.delivery_contacts(
        delivery_id,name,phone,phone_key,email,email_key,active,created_by,created_at,updated_at
      )
      values(
        p_delivery_id,v_name,v_phone,v_phone_key,v_email,v_email_key,true,auth.uid(),now(),now()
      );
    else
      update public.delivery_contacts
      set name=coalesce(v_name,name),
          phone=coalesce(v_phone,phone),
          phone_key=coalesce(v_phone_key,phone_key),
          email=coalesce(v_email,email),
          email_key=coalesce(v_email_key,email_key),
          active=true,
          updated_at=now()
      where id=v_id and delivery_id=p_delivery_id;
    end if;

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('delivery_id',p_delivery_id,'processed',v_count);
end;
$$;

create or replace function public.delivery_contacts_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
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
    'id',c.id,
    'name',c.name,
    'phone',c.phone,
    'email',c.email,
    'active',c.active,
    'created_at',c.created_at,
    'updated_at',c.updated_at
  ) order by c.active desc,lower(coalesce(c.name,'')),c.created_at desc),'[]'::jsonb)
  into v
  from public.delivery_contacts c
  where c.delivery_id=p_delivery_id;

  return v;
end;
$$;

create or replace function public.delivery_set_contact_active(
  p_delivery_id uuid,
  p_contact_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if coalesce(p_active,false)
     and not public.delivery_has_capability(p_delivery_id,'contacts.import')
  then
    raise exception 'HTPWEB: tu plan no incluye importación de contactos';
  end if;

  update public.delivery_contacts
  set active=coalesce(p_active,false),updated_at=now()
  where id=p_contact_id and delivery_id=p_delivery_id;

  if not found then
    raise exception 'HTPWEB: contacto inexistente';
  end if;
end;
$$;

revoke execute on function public.delivery_import_contacts(uuid,jsonb) from public,anon;
revoke execute on function public.delivery_contacts_snapshot(uuid) from public,anon;
revoke execute on function public.delivery_set_contact_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.delivery_import_contacts(uuid,jsonb) to authenticated;
grant execute on function public.delivery_contacts_snapshot(uuid) to authenticated;
grant execute on function public.delivery_set_contact_active(uuid,uuid,boolean) to authenticated;

create or replace function public.delivery_save_customer_access_settings(
  p_delivery_id uuid,
  p_default_mode text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_mode text:=upper(trim(coalesce(p_default_mode,'OPEN')));
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: solo DELIVERY_ADMIN puede configurar acceso de clientes';
  end if;

  if v_mode not in ('OPEN','PRIVATE','APPROVAL_REQUIRED') then
    raise exception 'HTPWEB: modo inválido';
  end if;

  if v_mode in ('PRIVATE','APPROVAL_REQUIRED')
     and not public.delivery_has_capability(p_delivery_id,'customers.private_network')
  then
    raise exception 'HTPWEB: tu plan no incluye red privada de clientes';
  end if;

  if v_mode='APPROVAL_REQUIRED'
     and not public.delivery_has_capability(p_delivery_id,'customers.approval')
  then
    raise exception 'HTPWEB: tu plan no incluye aprobación manual de clientes';
  end if;

  insert into public.delivery_customer_access_settings(delivery_id,default_mode,updated_by,updated_at)
  values(p_delivery_id,v_mode,auth.uid(),now())
  on conflict(delivery_id)
  do update set
    default_mode=excluded.default_mode,
    updated_by=excluded.updated_by,
    updated_at=now();

  return jsonb_build_object('delivery_id',p_delivery_id,'default_mode',v_mode);
end;
$$;

create or replace function public.delivery_replace_customer_access_rules(
  p_delivery_id uuid,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v jsonb;
  v_day integer;
  v_start time;
  v_end time;
  v_mode text;
  v_priority integer;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: solo DELIVERY_ADMIN puede configurar horarios';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'customers.access_schedule') then
    raise exception 'HTPWEB: tu plan no incluye horario de acceso de clientes';
  end if;

  if p_rules is null or jsonb_typeof(p_rules)<>'array' then
    raise exception 'HTPWEB: reglas inválidas';
  end if;

  delete from public.delivery_customer_access_rules
  where delivery_id=p_delivery_id;

  for v in select value from jsonb_array_elements(p_rules) loop
    v_day:=(v->>'day_of_week')::integer;
    v_start:=(v->>'start_time')::time;
    v_end:=(v->>'end_time')::time;
    v_mode:=upper(trim(v->>'access_mode'));
    v_priority:=coalesce((v->>'priority')::integer,100);

    if v_day not between 0 and 6
       or v_mode not in ('OPEN','PRIVATE','APPROVAL_REQUIRED')
    then
      raise exception 'HTPWEB: regla de acceso inválida';
    end if;

    if v_mode in ('PRIVATE','APPROVAL_REQUIRED')
       and not public.delivery_has_capability(p_delivery_id,'customers.private_network')
    then
      raise exception 'HTPWEB: tu plan no incluye red privada de clientes';
    end if;

    if v_mode='APPROVAL_REQUIRED'
       and not public.delivery_has_capability(p_delivery_id,'customers.approval')
    then
      raise exception 'HTPWEB: tu plan no incluye aprobación manual de clientes';
    end if;

    insert into public.delivery_customer_access_rules(
      delivery_id,day_of_week,start_time,end_time,access_mode,priority,active
    )
    values(p_delivery_id,v_day,v_start,v_end,v_mode,v_priority,true);
  end loop;

  return jsonb_build_object('delivery_id',p_delivery_id,'rules',p_rules);
end;
$$;

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
    active=true,
    allow_orders=true,
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

create or replace function public.claim_delivery_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return public.claim_delivery_referral(p_code,'REFERRAL_CODE');
end;
$$;

revoke execute on function public.claim_delivery_referral(text,text) from public,anon;
revoke execute on function public.claim_delivery_referral(text) from public,anon;
grant execute on function public.claim_delivery_referral(text,text) to authenticated;
grant execute on function public.claim_delivery_referral(text) to authenticated;

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
      v_allowed:=v_relation.active is true and v_relation.allow_orders is true;
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
      v_allowed:=v_relation.active is true and v_relation.allow_orders is true;
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
