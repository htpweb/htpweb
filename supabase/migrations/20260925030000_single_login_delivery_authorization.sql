-- HTPWEB — acceso único + autorización previa de representantes DELIVERY.
-- Objetivos:
-- 1) Todo registro público nace como CLIENT.
-- 2) Solo MASTER puede preautorizar acceso DELIVERY.
-- 3) El usuario reclama el acceso únicamente con su propio correo autenticado y confirmado.
-- 4) CUSTOMER puede coexistir con un rol administrativo para mantener una sola cuenta.
-- 5) La cédula no se guarda en texto plano: se conserva SHA-256 + últimos 4 dígitos.

create table if not exists public.delivery_access_authorizations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id),
  representative_name text not null,
  email text not null,
  phone text,
  national_id_hash text not null,
  national_id_last4 text not null,
  role_code text not null default 'DELIVERY_ADMIN',
  status text not null default 'PENDING',
  expires_at timestamptz not null default (now() + interval '14 days'),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_access_authorizations_role_check
    check (role_code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')),
  constraint delivery_access_authorizations_status_check
    check (status in ('PENDING','CLAIMED','REVOKED','EXPIRED')),
  constraint delivery_access_authorizations_last4_check
    check (national_id_last4 ~ '^[0-9]{4}$')
);

create unique index if not exists delivery_access_pending_email_uidx
  on public.delivery_access_authorizations(delivery_id, lower(email))
  where status='PENDING';

create index if not exists delivery_access_claim_lookup_idx
  on public.delivery_access_authorizations(lower(email), status, expires_at);

create index if not exists delivery_access_claimed_by_idx
  on public.delivery_access_authorizations(claimed_by)
  where claimed_by is not null;

alter table public.delivery_access_authorizations enable row level security;
revoke all on table public.delivery_access_authorizations from anon, authenticated;

-- CUSTOMER deja de ser excluyente: un usuario administrativo puede seguir comprando.
create or replace function public.validate_customer_profile_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_active boolean;
  v_profile_active boolean;
begin
  if new.profile_id is null then
    return new;
  end if;

  select r.active, p.active
  into v_role_active, v_profile_active
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = new.profile_id;

  if not found then
    raise exception 'HTPWEB: el profile indicado no existe';
  end if;

  if v_role_active is not true then
    raise exception 'HTPWEB: el rol del profile está inactivo';
  end if;

  if new.active is true and v_profile_active is not true then
    raise exception 'HTPWEB: un customer activo no puede utilizar un profile inactivo';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_profile_customer_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_active boolean;
  v_active_customer_count bigint;
begin
  select r.active
  into v_role_active
  from public.roles r
  where r.id = new.role_id;

  select count(*)
  into v_active_customer_count
  from public.customers c
  where c.profile_id = new.id
    and c.active = true;

  if v_active_customer_count = 0 then
    return new;
  end if;

  if new.active is not true then
    raise exception 'HTPWEB: primero debe desactivar el CUSTOMER antes de desactivar su profile';
  end if;

  if v_role_active is not true then
    raise exception 'HTPWEB: un profile con CUSTOMER activo debe mantener un rol activo';
  end if;

  return new;
end;
$function$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id
  from public.customers c
  join public.profiles p on p.id = c.profile_id
  join public.roles r on r.id = p.role_id
  where c.profile_id = auth.uid()
    and c.active = true
    and p.active = true
    and r.active = true
  limit 1;
$function$;

create or replace function public.upsert_my_customer(
  p_name text,
  p_phone text,
  p_email text,
  p_marketing_consent boolean
)
returns table (
  id uuid,
  name text,
  phone text,
  email text,
  active boolean,
  marketing_consent boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_customer_active boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'HTPWEB: se requiere autenticación';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = v_user_id
      and p.active = true
      and r.active = true
  ) then
    raise exception 'HTPWEB: profile inexistente, inactivo o sin rol activo';
  end if;

  if nullif(trim(p_phone),'') is null then
    raise exception 'HTPWEB: el teléfono es obligatorio';
  end if;

  select c.id, c.active
  into v_customer_id, v_customer_active
  from public.customers c
  where c.profile_id = v_user_id
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      id, profile_id, name, phone, email, active,
      marketing_consent, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      v_user_id,
      nullif(trim(p_name),''),
      trim(p_phone),
      nullif(lower(trim(p_email)),''),
      true,
      coalesce(p_marketing_consent,false),
      now(),
      now()
    )
    returning customers.id into v_customer_id;
  else
    if v_customer_active is not true then
      raise exception 'HTPWEB: el customer está inactivo';
    end if;

    update public.customers c
    set name = nullif(trim(p_name),''),
        phone = trim(p_phone),
        email = nullif(lower(trim(p_email)),''),
        marketing_consent = coalesce(p_marketing_consent,false),
        updated_at = now()
    where c.id = v_customer_id;
  end if;

  return query
  select c.id,c.name,c.phone,c.email,c.active,c.marketing_consent,c.updated_at
  from public.customers c
  where c.id = v_customer_id;
end;
$function$;

create or replace function public.user_can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_customer_id is not null
    and (
      public.is_master()
      or exists (
        select 1
        from public.customers c
        join public.profiles p on p.id = c.profile_id
        join public.roles r on r.id = p.role_id
        where c.id = p_customer_id
          and c.profile_id = auth.uid()
          and c.active = true
          and p.active = true
          and r.active = true
      )
      or (
        public.has_permission('customers.view')
        and exists (
          select 1
          from public.customer_deliveries cd
          where cd.customer_id = p_customer_id
            and cd.active = true
            and public.user_has_delivery(cd.delivery_id)
        )
      )
    );
$function$;

create or replace function public.user_can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        public.is_master()
        or exists (
          select 1
          from public.customers c
          join public.profiles p on p.id = c.profile_id
          join public.roles r on r.id = p.role_id
          where c.id = o.customer_id
            and c.profile_id = auth.uid()
            and c.active = true
            and p.active = true
            and r.active = true
        )
        or (
          public.has_permission('orders.view')
          and public.user_has_delivery(o.delivery_id)
        )
        or (
          public.has_permission('orders.view')
          and exists (
            select 1
            from public.order_locals ol
            where ol.order_id = o.id
              and public.user_can_access_local(ol.local_id)
          )
        )
      )
  );
$function$;

-- Mantiene la firma anterior para no romper llamadas existentes.
-- p_convert_customer se conserva por compatibilidad, pero CUSTOMER ya puede coexistir.
create or replace function public.convert_profile_to_delivery_role(
  p_user_id uuid,
  p_role_code text,
  p_convert_customer boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_role text;
  v_target_role text;
  v_target_role_id uuid;
begin
  v_target_role := upper(trim(coalesce(p_role_code,'')));

  if v_target_role not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR') then
    raise exception 'HTPWEB: role_code debe ser DELIVERY_ADMIN o DELIVERY_OPERATOR';
  end if;

  select r.code
  into v_current_role
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_user_id
    and p.active = true;

  if v_current_role is null then
    raise exception 'HTPWEB: profile inexistente o inactivo';
  end if;

  if v_current_role = 'MASTER' then
    raise exception 'HTPWEB: una cuenta MASTER no se convierte a DELIVERY';
  end if;

  if v_current_role = 'LOCAL_ADMIN' then
    raise exception 'HTPWEB: esta cuenta administra LOCAL; usa otra cuenta o migra su acceso antes de asignarla a DELIVERY';
  end if;

  -- DELIVERY_ADMIN prevalece sobre DELIVERY_OPERATOR.
  if v_current_role = 'DELIVERY_ADMIN' then
    return;
  end if;

  if v_current_role = v_target_role then
    return;
  end if;

  select r.id
  into v_target_role_id
  from public.roles r
  where r.code = v_target_role
    and r.active = true
  limit 1;

  if v_target_role_id is null then
    raise exception 'HTPWEB: rol destino inexistente o inactivo';
  end if;

  update public.profiles p
  set role_id = v_target_role_id,
      updated_at = now()
  where p.id = p_user_id;
end;
$function$;

create or replace function public.master_unassign_delivery_user(
  p_user_id uuid,
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_client_role_id uuid;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  update public.user_deliveries ud
  set active = false
  where ud.user_id = p_user_id
    and ud.delivery_id = p_delivery_id
    and ud.active = true;

  if not exists (
    select 1 from public.user_deliveries ud
    where ud.user_id = p_user_id and ud.active = true
  ) and exists (
    select 1
    from public.profiles p
    join public.roles r on r.id=p.role_id
    where p.id=p_user_id
      and r.code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
  ) then
    select r.id into v_client_role_id
    from public.roles r
    where r.code='CLIENT' and r.active=true
    limit 1;

    if v_client_role_id is null then
      raise exception 'HTPWEB: no existe rol CLIENT activo';
    end if;

    update public.profiles
    set role_id=v_client_role_id, updated_at=now()
    where id=p_user_id;
  end if;
end;
$function$;

create or replace function public.master_authorize_delivery_representative(
  p_delivery_id uuid,
  p_representative_name text,
  p_national_id text,
  p_email text,
  p_phone text,
  p_role_code text default 'DELIVERY_ADMIN'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_name text := trim(coalesce(p_representative_name,''));
  v_phone text := nullif(trim(coalesce(p_phone,'')),'');
  v_national_id text := regexp_replace(coalesce(p_national_id,''),'[^0-9]','','g');
  v_role text := upper(trim(coalesce(p_role_code,'DELIVERY_ADMIN')));
  v_authorization_id uuid;
  v_user_id uuid;
  v_email_confirmed boolean := false;
  v_existing_role text;
  v_status text := 'PENDING';
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists (
    select 1 from public.deliveries d
    where d.id=p_delivery_id and d.active=true
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  if v_name='' then
    raise exception 'HTPWEB: escribe el nombre del representante';
  end if;

  if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'HTPWEB: correo inválido';
  end if;

  if v_national_id !~ '^[0-9]{10}$' then
    raise exception 'HTPWEB: la cédula debe contener 10 dígitos';
  end if;

  if v_role not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR') then
    raise exception 'HTPWEB: rol de DELIVERY inválido';
  end if;

  update public.delivery_access_authorizations a
  set status='EXPIRED', updated_at=now()
  where a.status='PENDING' and a.expires_at<=now();

  select a.id
  into v_authorization_id
  from public.delivery_access_authorizations a
  where a.delivery_id=p_delivery_id
    and lower(a.email)=v_email
    and a.status='PENDING'
  limit 1
  for update;

  if v_authorization_id is null then
    insert into public.delivery_access_authorizations (
      delivery_id, representative_name, email, phone,
      national_id_hash, national_id_last4, role_code, status,
      expires_at, created_by, created_at, updated_at
    )
    values (
      p_delivery_id, v_name, v_email, v_phone,
      pg_catalog.encode(extensions.digest(v_national_id,'sha256'),'hex'),
      right(v_national_id,4),
      v_role, 'PENDING',
      now()+interval '14 days',
      auth.uid(), now(), now()
    )
    returning id into v_authorization_id;
  else
    update public.delivery_access_authorizations a
    set representative_name=v_name,
        phone=v_phone,
        national_id_hash=pg_catalog.encode(extensions.digest(v_national_id,'sha256'),'hex'),
        national_id_last4=right(v_national_id,4),
        role_code=v_role,
        expires_at=now()+interval '14 days',
        updated_at=now()
    where a.id=v_authorization_id;
  end if;

  select u.id, (u.email_confirmed_at is not null)
  into v_user_id, v_email_confirmed
  from auth.users u
  where lower(u.email)=v_email
  limit 1;

  if v_user_id is not null then
    select r.code
    into v_existing_role
    from public.profiles p
    join public.roles r on r.id=p.role_id
    where p.id=v_user_id;

    if v_existing_role='MASTER' then
      raise exception 'HTPWEB: ese correo pertenece a una cuenta MASTER';
    end if;

    if v_existing_role='LOCAL_ADMIN' then
      raise exception 'HTPWEB: ese correo ya administra un LOCAL; usa otra cuenta o migra primero su acceso';
    end if;
  end if;

  if v_user_id is not null and v_email_confirmed then
    perform public.convert_profile_to_delivery_role(v_user_id,v_role,true);

    insert into public.user_deliveries(user_id,delivery_id,active,created_at)
    values(v_user_id,p_delivery_id,true,now())
    on conflict(user_id,delivery_id)
    do update set active=true;

    update public.delivery_access_authorizations a
    set status='CLAIMED',
        claimed_by=v_user_id,
        claimed_at=now(),
        updated_at=now()
    where a.id=v_authorization_id;

    v_status := 'CLAIMED';
  end if;

  return jsonb_build_object(
    'id',v_authorization_id,
    'status',v_status,
    'email',v_email,
    'representative_name',v_name,
    'national_id_last4',right(v_national_id,4),
    'role_code',v_role,
    'existing_account',(v_user_id is not null),
    'email_confirmed',coalesce(v_email_confirmed,false),
    'expires_at',(select a.expires_at from public.delivery_access_authorizations a where a.id=v_authorization_id)
  );
end;
$function$;

create or replace function public.master_list_delivery_authorizations(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  update public.delivery_access_authorizations a
  set status='EXPIRED', updated_at=now()
  where a.status='PENDING' and a.expires_at<=now();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'delivery_id',a.delivery_id,
        'representative_name',a.representative_name,
        'email',a.email,
        'phone',a.phone,
        'national_id_last4',a.national_id_last4,
        'role_code',a.role_code,
        'status',a.status,
        'expires_at',a.expires_at,
        'claimed_by',a.claimed_by,
        'claimed_at',a.claimed_at,
        'created_at',a.created_at,
        'active_access',case
          when a.claimed_by is null then false
          else exists (
            select 1 from public.user_deliveries ud
            where ud.user_id=a.claimed_by
              and ud.delivery_id=a.delivery_id
              and ud.active=true
          )
        end
      )
      order by a.created_at desc
    )
    from public.delivery_access_authorizations a
    where a.delivery_id=p_delivery_id
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.master_revoke_delivery_authorization(
  p_authorization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery_id uuid;
  v_user_id uuid;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  select a.delivery_id,a.claimed_by
  into v_delivery_id,v_user_id
  from public.delivery_access_authorizations a
  where a.id=p_authorization_id
  for update;

  if not found then
    raise exception 'HTPWEB: autorización inexistente';
  end if;

  update public.delivery_access_authorizations a
  set status='REVOKED',
      revoked_by=auth.uid(),
      revoked_at=now(),
      updated_at=now()
  where a.id=p_authorization_id;

  if v_user_id is not null and not exists (
    select 1
    from public.delivery_access_authorizations a
    where a.id<>p_authorization_id
      and a.delivery_id=v_delivery_id
      and a.claimed_by=v_user_id
      and a.status='CLAIMED'
  ) then
    perform public.master_unassign_delivery_user(v_user_id,v_delivery_id);
  end if;
end;
$function$;

create or replace function public.claim_my_delivery_authorizations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed boolean;
  v_current_role text;
  v_target_role text;
  v_claimed integer := 0;
  rec record;
begin
  if v_user_id is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select lower(u.email), (u.email_confirmed_at is not null)
  into v_email,v_email_confirmed
  from auth.users u
  where u.id=v_user_id;

  if v_email is null then
    raise exception 'HTPWEB: la cuenta no tiene correo';
  end if;

  if v_email_confirmed is not true then
    return jsonb_build_object(
      'claimed',0,
      'status','EMAIL_UNCONFIRMED',
      'role',public.current_role_code()
    );
  end if;

  update public.delivery_access_authorizations a
  set status='EXPIRED', updated_at=now()
  where a.status='PENDING' and a.expires_at<=now();

  select r.code
  into v_current_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=v_user_id and p.active=true;

  if v_current_role is null then
    raise exception 'HTPWEB: profile inexistente o inactivo';
  end if;

  if v_current_role='MASTER' then
    return jsonb_build_object(
      'claimed',0,
      'status','MASTER',
      'role',v_current_role
    );
  end if;

  if v_current_role='LOCAL_ADMIN' and exists (
    select 1
    from public.delivery_access_authorizations a
    where lower(a.email)=v_email
      and a.status='PENDING'
      and a.expires_at>now()
  ) then
    return jsonb_build_object(
      'claimed',0,
      'status','ROLE_CONFLICT',
      'role',v_current_role
    );
  end if;

  select case
    when exists (
      select 1 from public.delivery_access_authorizations a
      join public.deliveries d on d.id=a.delivery_id and d.active=true
      where lower(a.email)=v_email
        and a.status='PENDING'
        and a.expires_at>now()
        and a.role_code='DELIVERY_ADMIN'
    ) then 'DELIVERY_ADMIN'
    when exists (
      select 1 from public.delivery_access_authorizations a
      join public.deliveries d on d.id=a.delivery_id and d.active=true
      where lower(a.email)=v_email
        and a.status='PENDING'
        and a.expires_at>now()
        and a.role_code='DELIVERY_OPERATOR'
    ) then 'DELIVERY_OPERATOR'
    else null
  end
  into v_target_role;

  if v_target_role is null then
    return jsonb_build_object(
      'claimed',0,
      'status','NO_PENDING_AUTHORIZATION',
      'role',v_current_role
    );
  end if;

  perform public.convert_profile_to_delivery_role(v_user_id,v_target_role,true);

  for rec in
    select a.id,a.delivery_id
    from public.delivery_access_authorizations a
    join public.deliveries d on d.id=a.delivery_id and d.active=true
    where lower(a.email)=v_email
      and a.status='PENDING'
      and a.expires_at>now()
    order by a.created_at
    for update of a
  loop
    insert into public.user_deliveries(user_id,delivery_id,active,created_at)
    values(v_user_id,rec.delivery_id,true,now())
    on conflict(user_id,delivery_id)
    do update set active=true;

    update public.delivery_access_authorizations a
    set status='CLAIMED',
        claimed_by=v_user_id,
        claimed_at=now(),
        updated_at=now()
    where a.id=rec.id;

    v_claimed := v_claimed + 1;
  end loop;

  return jsonb_build_object(
    'claimed',v_claimed,
    'status','CLAIMED',
    'role',public.current_role_code()
  );
end;
$function$;

revoke all on function public.master_authorize_delivery_representative(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.master_list_delivery_authorizations(uuid) from public, anon;
revoke all on function public.master_revoke_delivery_authorization(uuid) from public, anon;
revoke all on function public.claim_my_delivery_authorizations() from public, anon;

grant execute on function public.master_authorize_delivery_representative(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.master_list_delivery_authorizations(uuid) to authenticated;
grant execute on function public.master_revoke_delivery_authorization(uuid) to authenticated;
grant execute on function public.claim_my_delivery_authorizations() to authenticated;
