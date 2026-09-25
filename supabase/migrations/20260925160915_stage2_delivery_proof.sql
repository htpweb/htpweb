create table if not exists private.delivery_proof_settings(
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  require_pin boolean not null default false,
  require_photo boolean not null default false,
  require_signature boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.delivery_proof_settings enable row level security;
revoke all on table private.delivery_proof_settings from public,anon,authenticated;

drop policy if exists delivery_proof_settings_deny_all on private.delivery_proof_settings;
create policy delivery_proof_settings_deny_all
on private.delivery_proof_settings
for all
to public
using (false)
with check (false);

create table if not exists private.order_delivery_proofs(
  order_id uuid primary key references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  require_pin boolean not null default false,
  require_photo boolean not null default false,
  require_signature boolean not null default false,
  pin_code text,
  pin_verified_at timestamptz,
  pin_attempts integer not null default 0 check(pin_attempts>=0),
  pin_last_attempt_at timestamptz,
  photo_path text,
  photo_uploaded_at timestamptz,
  signature_path text,
  signature_uploaded_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(pin_code is null or pin_code ~ '^[0-9]{6}$')
);

create index if not exists order_delivery_proofs_delivery_idx
  on private.order_delivery_proofs(delivery_id,created_at desc);
create index if not exists order_delivery_proofs_driver_idx
  on private.order_delivery_proofs(driver_user_id,created_at desc);

alter table private.order_delivery_proofs enable row level security;
revoke all on table private.order_delivery_proofs from public,anon,authenticated;

drop policy if exists order_delivery_proofs_deny_all on private.order_delivery_proofs;
create policy order_delivery_proofs_deny_all
on private.order_delivery_proofs
for all
to public
using (false)
with check (false);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'delivery-proofs',
  'delivery-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.generate_delivery_pin()
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_bytes bytea;
  v_num bigint;
begin
  v_bytes:=extensions.gen_random_bytes(4);
  v_num:=
    pg_catalog.get_byte(v_bytes,0)::bigint*16777216
    +pg_catalog.get_byte(v_bytes,1)::bigint*65536
    +pg_catalog.get_byte(v_bytes,2)::bigint*256
    +pg_catalog.get_byte(v_bytes,3)::bigint;

  return (100000+(v_num%900000))::text;
end;
$$;

revoke execute on function private.generate_delivery_pin() from public,anon,authenticated;

create or replace function private.delivery_proof_requirements(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pin boolean:=false;
  v_photo boolean:=false;
  v_signature boolean:=false;
  v_available_pin boolean;
  v_available_photo boolean;
  v_available_signature boolean;
begin
  select
    coalesce(s.require_pin,false),
    coalesce(s.require_photo,false),
    coalesce(s.require_signature,false)
  into v_pin,v_photo,v_signature
  from private.delivery_proof_settings s
  where s.delivery_id=p_delivery_id;

  v_available_pin:=public.delivery_has_capability(p_delivery_id,'delivery_proof.pin');
  v_available_photo:=public.delivery_has_capability(p_delivery_id,'delivery_proof.photo');
  v_available_signature:=public.delivery_has_capability(p_delivery_id,'delivery_proof.signature');

  return jsonb_build_object(
    'available_pin',v_available_pin,
    'available_photo',v_available_photo,
    'available_signature',v_available_signature,
    'configured_pin',coalesce(v_pin,false),
    'configured_photo',coalesce(v_photo,false),
    'configured_signature',coalesce(v_signature,false),
    'require_pin',coalesce(v_pin,false) and v_available_pin,
    'require_photo',coalesce(v_photo,false) and v_available_photo,
    'require_signature',coalesce(v_signature,false) and v_available_signature
  );
end;
$$;

revoke execute on function private.delivery_proof_requirements(uuid) from public,anon,authenticated;

create or replace function public.delivery_proof_settings_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then
    raise exception 'HTPWEB: no autorizado para consultar prueba de entrega';
  end if;

  return private.delivery_proof_requirements(p_delivery_id)
    || jsonb_build_object('delivery_id',p_delivery_id);
end;
$$;

revoke execute on function public.delivery_proof_settings_snapshot(uuid) from public,anon;
grant execute on function public.delivery_proof_settings_snapshot(uuid) to authenticated;

create or replace function public.delivery_save_proof_settings(
  p_delivery_id uuid,
  p_require_pin boolean,
  p_require_photo boolean,
  p_require_signature boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: solo DELIVERY_ADMIN puede configurar prueba de entrega';
  end if;

  if coalesce(p_require_pin,false)
     and not public.delivery_has_capability(p_delivery_id,'delivery_proof.pin')
  then
    raise exception 'HTPWEB: el plan no incluye PIN de entrega';
  end if;

  if coalesce(p_require_photo,false)
     and not public.delivery_has_capability(p_delivery_id,'delivery_proof.photo')
  then
    raise exception 'HTPWEB: el plan no incluye foto de entrega';
  end if;

  if coalesce(p_require_signature,false)
     and not public.delivery_has_capability(p_delivery_id,'delivery_proof.signature')
  then
    raise exception 'HTPWEB: el plan no incluye firma de entrega';
  end if;

  insert into private.delivery_proof_settings(
    delivery_id,require_pin,require_photo,require_signature,updated_by,updated_at
  )
  values(
    p_delivery_id,
    coalesce(p_require_pin,false),
    coalesce(p_require_photo,false),
    coalesce(p_require_signature,false),
    auth.uid(),
    now()
  )
  on conflict(delivery_id) do update set
    require_pin=excluded.require_pin,
    require_photo=excluded.require_photo,
    require_signature=excluded.require_signature,
    updated_by=excluded.updated_by,
    updated_at=now();

  return public.delivery_proof_settings_snapshot(p_delivery_id);
end;
$$;

revoke execute on function public.delivery_save_proof_settings(uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.delivery_save_proof_settings(uuid,boolean,boolean,boolean) to authenticated;

create or replace function private.ensure_order_delivery_proof(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order record;
  v_driver uuid;
  v_req jsonb;
  v_require_pin boolean;
  v_require_photo boolean;
  v_require_signature boolean;
begin
  select o.id,o.delivery_id,o.status
  into v_order
  from public.orders o
  where o.id=p_order_id;

  if v_order.id is null or v_order.status<>'EN_ROUTE' then
    return null;
  end if;

  v_req:=private.delivery_proof_requirements(v_order.delivery_id);
  v_require_pin:=coalesce((v_req->>'require_pin')::boolean,false);
  v_require_photo:=coalesce((v_req->>'require_photo')::boolean,false);
  v_require_signature:=coalesce((v_req->>'require_signature')::boolean,false);

  if not (v_require_pin or v_require_photo or v_require_signature) then
    return null;
  end if;

  select a.driver_user_id
  into v_driver
  from public.order_driver_assignments a
  where a.order_id=p_order_id
    and a.delivery_id=v_order.delivery_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
  order by a.assigned_at desc
  limit 1;

  if v_driver is null then
    raise exception 'HTPWEB: la prueba de entrega requiere un repartidor asignado';
  end if;

  insert into private.order_delivery_proofs(
    order_id,delivery_id,driver_user_id,
    require_pin,require_photo,require_signature,
    pin_code,created_at,updated_at
  )
  values(
    p_order_id,v_order.delivery_id,v_driver,
    v_require_pin,v_require_photo,v_require_signature,
    case when v_require_pin then private.generate_delivery_pin() else null end,
    now(),now()
  )
  on conflict(order_id) do nothing;

  return p_order_id;
end;
$$;

revoke execute on function private.ensure_order_delivery_proof(uuid) from public,anon,authenticated;

create or replace function private.delivery_proof_ready(p_order_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v record;
begin
  select *
  into v
  from private.order_delivery_proofs p
  where p.order_id=p_order_id;

  if v.order_id is null then
    return true;
  end if;

  return
    (not v.require_pin or v.pin_verified_at is not null)
    and
    (not v.require_photo or v.photo_uploaded_at is not null)
    and
    (not v.require_signature or v.signature_uploaded_at is not null);
end;
$$;

revoke execute on function private.delivery_proof_ready(uuid) from public,anon,authenticated;

create or replace function public.enforce_delivery_proof_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_req jsonb;
  v_needs_proof boolean:=false;
  v_proof record;
begin
  if old.status='READY' and new.status='EN_ROUTE' then
    v_req:=private.delivery_proof_requirements(new.delivery_id);
    v_needs_proof:=
      coalesce((v_req->>'require_pin')::boolean,false)
      or coalesce((v_req->>'require_photo')::boolean,false)
      or coalesce((v_req->>'require_signature')::boolean,false);

    if v_needs_proof
       and not exists(
         select 1
         from public.order_driver_assignments a
         where a.order_id=new.id
           and a.delivery_id=new.delivery_id
           and a.status='ACTIVE'
           and a.unassigned_at is null
       )
    then
      raise exception 'HTPWEB: la prueba de entrega requiere un repartidor asignado';
    end if;
  end if;

  if old.status='EN_ROUTE' and new.status='DELIVERED' then
    select *
    into v_proof
    from private.order_delivery_proofs p
    where p.order_id=new.id;

    if v_proof.order_id is not null then
      if v_proof.require_pin and v_proof.pin_verified_at is null then
        raise exception 'HTPWEB: falta verificar el PIN de entrega';
      end if;
      if v_proof.require_photo and v_proof.photo_uploaded_at is null then
        raise exception 'HTPWEB: falta cargar la foto de entrega';
      end if;
      if v_proof.require_signature and v_proof.signature_uploaded_at is null then
        raise exception 'HTPWEB: falta registrar la firma de entrega';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_delivery_proof_transition() from public,anon,authenticated;

drop trigger if exists trg_orders_delivery_proof_guard on public.orders;
create trigger trg_orders_delivery_proof_guard
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.enforce_delivery_proof_transition();

create or replace function private.order_delivery_proof_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='READY' and new.status='EN_ROUTE' then
    perform private.ensure_order_delivery_proof(new.id);
  elsif old.status='EN_ROUTE' and new.status='DELIVERED' then
    update private.order_delivery_proofs
    set completed_at=coalesce(completed_at,now()),updated_at=now()
    where order_id=new.id;
  elsif new.status='CANCELLED' and old.status is distinct from new.status then
    update private.order_delivery_proofs
    set cancelled_at=coalesce(cancelled_at,now()),updated_at=now()
    where order_id=new.id;
  end if;

  return new;
end;
$$;

revoke execute on function private.order_delivery_proof_lifecycle() from public,anon,authenticated;

drop trigger if exists trg_orders_delivery_proof_lifecycle on public.orders;
create trigger trg_orders_delivery_proof_lifecycle
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.order_delivery_proof_lifecycle();

create or replace function public.driver_delivery_proof_snapshot(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_order record;
  v_proof record;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select o.id,o.delivery_id,o.status
  into v_order
  from public.orders o
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=auth.uid()
  where o.id=p_order_id
    and (
      (a.status='ACTIVE' and a.unassigned_at is null)
      or (a.status='COMPLETED' and a.unassigned_at>=now()-interval '7 days')
    )
  order by a.assigned_at desc
  limit 1;

  if v_order.id is null then
    raise exception 'HTPWEB: pedido no asignado a este repartidor';
  end if;

  select *
  into v_proof
  from private.order_delivery_proofs p
  where p.order_id=p_order_id
    and p.driver_user_id=auth.uid();

  if v_proof.order_id is null then
    return jsonb_build_object(
      'enabled',false,
      'status',v_order.status,
      'reason',case when v_order.status='EN_ROUTE' then 'NOT_REQUIRED' else 'NOT_EN_ROUTE' end,
      'ready',true
    );
  end if;

  return jsonb_build_object(
    'enabled',true,
    'status',v_order.status,
    'require_pin',v_proof.require_pin,
    'pin_verified',v_proof.pin_verified_at is not null,
    'pin_attempts',v_proof.pin_attempts,
    'require_photo',v_proof.require_photo,
    'photo_uploaded',v_proof.photo_uploaded_at is not null,
    'require_signature',v_proof.require_signature,
    'signature_uploaded',v_proof.signature_uploaded_at is not null,
    'ready',private.delivery_proof_ready(p_order_id),
    'completed_at',v_proof.completed_at,
    'cancelled_at',v_proof.cancelled_at
  );
end;
$$;

revoke execute on function public.driver_delivery_proof_snapshot(uuid) from public,anon;
grant execute on function public.driver_delivery_proof_snapshot(uuid) to authenticated;

create or replace function public.driver_verify_delivery_pin(p_order_id uuid,p_pin text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_proof private.order_delivery_proofs%rowtype;
  v_input text:=trim(coalesce(p_pin,''));
  v_verified boolean:=false;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_input !~ '^[0-9]{6}$' then
    raise exception 'HTPWEB: el PIN debe tener 6 dígitos';
  end if;

  select p.*
  into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id and o.status='EN_ROUTE'
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=auth.uid()
   and a.status='ACTIVE'
   and a.unassigned_at is null
  where p.order_id=p_order_id
    and p.driver_user_id=auth.uid()
  for update of p;

  if v_proof.order_id is null then
    raise exception 'HTPWEB: prueba de entrega no disponible';
  end if;

  if not v_proof.require_pin then
    raise exception 'HTPWEB: este pedido no requiere PIN';
  end if;

  if v_proof.pin_verified_at is not null then
    return jsonb_build_object(
      'verified',true,
      'proof',public.driver_delivery_proof_snapshot(p_order_id)
    );
  end if;

  if v_proof.pin_last_attempt_at is not null
     and v_proof.pin_last_attempt_at>now()-interval '2 seconds'
  then
    raise exception 'HTPWEB: espera unos segundos antes de intentar otro PIN';
  end if;

  v_verified:=v_proof.pin_code=v_input;

  update private.order_delivery_proofs
  set
    pin_attempts=pin_attempts+1,
    pin_last_attempt_at=now(),
    pin_verified_at=case when v_verified then now() else pin_verified_at end,
    updated_at=now()
  where order_id=p_order_id;

  return jsonb_build_object(
    'verified',v_verified,
    'proof',public.driver_delivery_proof_snapshot(p_order_id)
  );
end;
$$;

revoke execute on function public.driver_verify_delivery_pin(uuid,text) from public,anon;
grant execute on function public.driver_verify_delivery_pin(uuid,text) to authenticated;

create or replace function public.driver_delivery_proof_upload_context(
  p_order_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_proof record;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_kind not in ('PHOTO','SIGNATURE') then
    raise exception 'HTPWEB: tipo de evidencia inválido';
  end if;

  select p.*
  into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id and o.status='EN_ROUTE'
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=auth.uid()
   and a.status='ACTIVE'
   and a.unassigned_at is null
  where p.order_id=p_order_id
    and p.driver_user_id=auth.uid();

  if v_proof.order_id is null then
    raise exception 'HTPWEB: prueba de entrega no disponible';
  end if;

  if v_kind='PHOTO' and not v_proof.require_photo then
    raise exception 'HTPWEB: este pedido no requiere foto';
  end if;

  if v_kind='SIGNATURE' and not v_proof.require_signature then
    raise exception 'HTPWEB: este pedido no requiere firma';
  end if;

  return jsonb_build_object(
    'bucket','delivery-proofs',
    'delivery_id',v_proof.delivery_id,
    'order_id',v_proof.order_id,
    'kind',lower(v_kind),
    'existing_path',case when v_kind='PHOTO' then v_proof.photo_path else v_proof.signature_path end
  );
end;
$$;

revoke execute on function public.driver_delivery_proof_upload_context(uuid,text) from public,anon;
grant execute on function public.driver_delivery_proof_upload_context(uuid,text) to authenticated;

create or replace function public.driver_register_delivery_proof_media(
  p_order_id uuid,
  p_kind text,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_proof record;
  v_prefix text;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_kind not in ('PHOTO','SIGNATURE') then
    raise exception 'HTPWEB: tipo de evidencia inválido';
  end if;

  select p.*
  into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id and o.status='EN_ROUTE'
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=auth.uid()
   and a.status='ACTIVE'
   and a.unassigned_at is null
  where p.order_id=p_order_id
    and p.driver_user_id=auth.uid()
  for update of p;

  if v_proof.order_id is null then
    raise exception 'HTPWEB: prueba de entrega no disponible';
  end if;

  if v_kind='PHOTO' and not v_proof.require_photo then
    raise exception 'HTPWEB: este pedido no requiere foto';
  end if;

  if v_kind='SIGNATURE' and not v_proof.require_signature then
    raise exception 'HTPWEB: este pedido no requiere firma';
  end if;

  v_prefix:=v_proof.delivery_id::text||'/'||p_order_id::text||'/'||lower(v_kind)||'/';

  if p_path is null or p_path not like v_prefix||'%' then
    raise exception 'HTPWEB: ruta de evidencia inválida';
  end if;

  if v_kind='PHOTO' then
    update private.order_delivery_proofs
    set photo_path=p_path,photo_uploaded_at=now(),updated_at=now()
    where order_id=p_order_id;
  else
    update private.order_delivery_proofs
    set signature_path=p_path,signature_uploaded_at=now(),updated_at=now()
    where order_id=p_order_id;
  end if;

  return public.driver_delivery_proof_snapshot(p_order_id);
end;
$$;

revoke execute on function public.driver_register_delivery_proof_media(uuid,text,text) from public,anon;
grant execute on function public.driver_register_delivery_proof_media(uuid,text,text) to authenticated;

create or replace function public.customer_order_delivery_proof_snapshot(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_customer_id uuid:=public.current_customer_id();
  v_order record;
  v_proof record;
begin
  if v_customer_id is null then
    raise exception 'HTPWEB: perfil CLIENT requerido';
  end if;

  select o.id,o.delivery_id,o.status
  into v_order
  from public.orders o
  where o.id=p_order_id
    and o.customer_id=v_customer_id;

  if v_order.id is null then
    raise exception 'HTPWEB: pedido no disponible para esta cuenta';
  end if;

  select *
  into v_proof
  from private.order_delivery_proofs p
  where p.order_id=p_order_id;

  if v_proof.order_id is null then
    return jsonb_build_object(
      'enabled',false,
      'status',v_order.status,
      'reason','NOT_REQUIRED'
    );
  end if;

  return jsonb_build_object(
    'enabled',true,
    'status',v_order.status,
    'require_pin',v_proof.require_pin,
    'pin',case
      when v_proof.require_pin
       and v_order.status='EN_ROUTE'
       and v_proof.pin_verified_at is null
      then v_proof.pin_code
      else null
    end,
    'pin_verified',v_proof.pin_verified_at is not null,
    'require_photo',v_proof.require_photo,
    'photo_uploaded',v_proof.photo_uploaded_at is not null,
    'require_signature',v_proof.require_signature,
    'signature_uploaded',v_proof.signature_uploaded_at is not null,
    'ready',private.delivery_proof_ready(p_order_id),
    'completed_at',v_proof.completed_at
  );
end;
$$;

revoke execute on function public.customer_order_delivery_proof_snapshot(uuid) from public,anon;
grant execute on function public.customer_order_delivery_proof_snapshot(uuid) to authenticated;

create or replace function public.delivery_order_proof_snapshot(
  p_delivery_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_proof record;
  v_status text;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      and public.user_has_delivery(p_delivery_id)
      and public.has_permission('orders.view')
    )
  ) then
    raise exception 'HTPWEB: no autorizado para consultar la prueba de entrega';
  end if;

  select o.status
  into v_status
  from public.orders o
  where o.id=p_order_id
    and o.delivery_id=p_delivery_id;

  if v_status is null then
    raise exception 'HTPWEB: pedido inexistente en este DELIVERY';
  end if;

  select *
  into v_proof
  from private.order_delivery_proofs p
  where p.order_id=p_order_id
    and p.delivery_id=p_delivery_id;

  if v_proof.order_id is null then
    return jsonb_build_object('enabled',false,'status',v_status,'reason','NOT_REQUIRED');
  end if;

  return jsonb_build_object(
    'enabled',true,
    'status',v_status,
    'require_pin',v_proof.require_pin,
    'pin_verified',v_proof.pin_verified_at is not null,
    'pin_attempts',v_proof.pin_attempts,
    'require_photo',v_proof.require_photo,
    'photo_uploaded',v_proof.photo_uploaded_at is not null,
    'require_signature',v_proof.require_signature,
    'signature_uploaded',v_proof.signature_uploaded_at is not null,
    'ready',private.delivery_proof_ready(p_order_id),
    'completed_at',v_proof.completed_at,
    'cancelled_at',v_proof.cancelled_at
  );
end;
$$;

revoke execute on function public.delivery_order_proof_snapshot(uuid,uuid) from public,anon;
grant execute on function public.delivery_order_proof_snapshot(uuid,uuid) to authenticated;

create or replace function public.delivery_proof_media_access_context(
  p_order_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_proof record;
  v_path text;
  v_customer_id uuid:=public.current_customer_id();
  v_allowed boolean:=false;
begin
  if v_kind not in ('PHOTO','SIGNATURE') then
    raise exception 'HTPWEB: tipo de evidencia inválido';
  end if;

  select p.*,o.customer_id,o.status
  into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id
  where p.order_id=p_order_id;

  if v_proof.order_id is null then
    raise exception 'HTPWEB: evidencia inexistente';
  end if;

  v_allowed:=
    public.is_master()
    or (
      public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      and public.user_has_delivery(v_proof.delivery_id)
      and public.has_permission('orders.view')
    )
    or (
      public.current_role_code()='DELIVERY_DRIVER'
      and v_proof.driver_user_id=auth.uid()
    )
    or (
      v_customer_id is not null
      and v_proof.customer_id=v_customer_id
    );

  if not v_allowed then
    raise exception 'HTPWEB: no autorizado para consultar esta evidencia';
  end if;

  v_path:=case when v_kind='PHOTO' then v_proof.photo_path else v_proof.signature_path end;

  if v_path is null then
    raise exception 'HTPWEB: evidencia todavía no cargada';
  end if;

  return jsonb_build_object(
    'bucket','delivery-proofs',
    'path',v_path,
    'kind',lower(v_kind),
    'order_id',p_order_id
  );
end;
$$;

revoke execute on function public.delivery_proof_media_access_context(uuid,text) from public,anon;
grant execute on function public.delivery_proof_media_access_context(uuid,text) to authenticated;

create or replace function public.driver_my_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',a.id,
    'delivery_id',a.delivery_id,
    'delivery_name',d.name,
    'order_id',o.id,
    'status',o.status,
    'assignment_status',a.status,
    'customer_name',o.customer_name,
    'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,
    'latitude',o.latitude,
    'longitude',o.longitude,
    'address_reference',o.address_reference,
    'total',o.total,
    'assigned_at',a.assigned_at,
    'en_route_at',o.en_route_at,
    'delivered_at',o.delivered_at,
    'proof',case when p.order_id is null then null else jsonb_build_object(
      'enabled',true,
      'require_pin',p.require_pin,
      'pin_verified',p.pin_verified_at is not null,
      'pin_attempts',p.pin_attempts,
      'require_photo',p.require_photo,
      'photo_uploaded',p.photo_uploaded_at is not null,
      'require_signature',p.require_signature,
      'signature_uploaded',p.signature_uploaded_at is not null,
      'ready',
        (not p.require_pin or p.pin_verified_at is not null)
        and (not p.require_photo or p.photo_uploaded_at is not null)
        and (not p.require_signature or p.signature_uploaded_at is not null),
      'completed_at',p.completed_at
    ) end
  ) order by
    case when a.status='ACTIVE' then 0 else 1 end,
    a.assigned_at desc),'[]'::jsonb)
  into v
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  join public.deliveries d on d.id=a.delivery_id and d.active=true
  join public.user_deliveries ud
    on ud.user_id=auth.uid()
   and ud.delivery_id=a.delivery_id
   and ud.active=true
  left join private.order_delivery_proofs p
    on p.order_id=o.id
   and p.driver_user_id=auth.uid()
  where a.driver_user_id=auth.uid()
    and (
      a.status='ACTIVE'
      or (
        a.status='COMPLETED'
        and a.unassigned_at>=now()-interval '7 days'
      )
    );

  return v;
end;
$$;

revoke execute on function public.driver_my_orders() from public,anon;
grant execute on function public.driver_my_orders() to authenticated;
