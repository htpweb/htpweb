-- HTPWEB: conexión WhatsApp Business por DELIVERY.
-- Arquitectura híbrida: WhatsApp propio o administrado por HTPWEB.

create table if not exists private.delivery_whatsapp_connections (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  connection_mode text not null default 'HTPWEB_MANAGED'
    check (connection_mode in ('OWN','HTPWEB_MANAGED')),
  status text not null default 'PENDING'
    check (status in ('PENDING','CONNECTED','DISCONNECTED','ERROR')),
  environment text not null default 'PRODUCTION'
    check (environment in ('TEST','PRODUCTION')),
  credential_source text not null default 'PLATFORM'
    check (credential_source in ('PLATFORM','VAULT')),
  meta_business_id text,
  waba_id text,
  phone_number_id text,
  display_phone text,
  verified_name text,
  requested_phone text,
  token_secret_name text,
  last_error text,
  requested_at timestamptz,
  connected_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_delivery_whatsapp_phone_number_id
  on private.delivery_whatsapp_connections(phone_number_id)
  where phone_number_id is not null;

create index if not exists ix_delivery_whatsapp_connections_status
  on private.delivery_whatsapp_connections(status, connection_mode);

revoke all on table private.delivery_whatsapp_connections
from public, anon, authenticated;

create or replace function public.delivery_whatsapp_connection_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_row private.delivery_whatsapp_connections%rowtype;
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar la conexión WhatsApp';
  end if;

  select * into v_row
  from private.delivery_whatsapp_connections c
  where c.delivery_id=p_delivery_id;

  if not found then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,'configured',false,
      'connection_mode',null,'status','DISCONNECTED',
      'environment',null,'display_phone',null,'verified_name',null,
      'requested_phone',null,'waba_id',null,'phone_number_id',null,
      'has_credentials',false,'last_error',null,
      'requested_at',null,'connected_at',null
    );
  end if;

  return jsonb_build_object(
    'delivery_id',v_row.delivery_id,
    'configured',v_row.status='CONNECTED'
      and nullif(v_row.phone_number_id,'') is not null,
    'connection_mode',v_row.connection_mode,
    'status',v_row.status,
    'environment',v_row.environment,
    'display_phone',v_row.display_phone,
    'verified_name',v_row.verified_name,
    'requested_phone',v_row.requested_phone,
    'waba_id',v_row.waba_id,
    'phone_number_id',v_row.phone_number_id,
    'has_credentials',
      v_row.credential_source='PLATFORM'
      or nullif(v_row.token_secret_name,'') is not null,
    'last_error',v_row.last_error,
    'requested_at',v_row.requested_at,
    'connected_at',v_row.connected_at
  );
end;
$function$;

revoke all on function public.delivery_whatsapp_connection_snapshot(uuid)
from public,anon;
grant execute on function public.delivery_whatsapp_connection_snapshot(uuid)
to authenticated,service_role;

create or replace function public.delivery_request_whatsapp_connection(
  p_delivery_id uuid,
  p_connection_mode text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text:=upper(trim(coalesce(p_connection_mode,'')));
  v_phone text:=nullif(trim(coalesce(p_phone,'')),'');
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if v_mode not in ('OWN','HTPWEB_MANAGED') then
    raise exception 'HTPWEB: tipo de conexión WhatsApp inválido';
  end if;

  if not public.is_master() then
    if public.current_role_code()<>'DELIVERY_ADMIN'
       or not public.user_has_delivery(p_delivery_id)
       or not public.has_permission('orders.manage')
    then
      raise exception 'HTPWEB: no autorizado para configurar WhatsApp';
    end if;
  end if;

  if v_mode='HTPWEB_MANAGED' and v_phone is null then
    raise exception 'HTPWEB: ingresa el número de WhatsApp que operará el DELIVERY';
  end if;

  insert into private.delivery_whatsapp_connections(
    delivery_id,connection_mode,status,environment,credential_source,
    requested_phone,requested_at,updated_by,updated_at,
    meta_business_id,waba_id,phone_number_id,display_phone,verified_name,
    token_secret_name,last_error,connected_at,approved_at,approved_by
  )
  values(
    p_delivery_id,v_mode,'PENDING','PRODUCTION',
    case when v_mode='HTPWEB_MANAGED' then 'PLATFORM' else 'VAULT' end,
    v_phone,now(),auth.uid(),now(),
    null,null,null,null,null,null,null,null,null,null,null
  )
  on conflict(delivery_id) do update
  set connection_mode=excluded.connection_mode,
      status='PENDING',
      environment='PRODUCTION',
      credential_source=excluded.credential_source,
      requested_phone=excluded.requested_phone,
      requested_at=now(),
      updated_by=auth.uid(),
      updated_at=now(),
      meta_business_id=null,
      waba_id=null,
      phone_number_id=null,
      display_phone=null,
      verified_name=null,
      token_secret_name=null,
      last_error=null,
      connected_at=null,
      approved_at=null,
      approved_by=null;

  return public.delivery_whatsapp_connection_snapshot(p_delivery_id);
end;
$function$;

revoke all on function public.delivery_request_whatsapp_connection(uuid,text,text)
from public,anon;
grant execute on function public.delivery_request_whatsapp_connection(uuid,text,text)
to authenticated;

create or replace function public.whatsapp_admin_upsert_connection(
  p_delivery_id uuid,
  p_connection_mode text,
  p_environment text,
  p_credential_source text,
  p_meta_business_id text,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone text,
  p_verified_name text,
  p_token_secret_name text default null,
  p_status text default 'CONNECTED',
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text:=upper(trim(coalesce(p_connection_mode,'')));
  v_environment text:=upper(trim(coalesce(p_environment,'PRODUCTION')));
  v_source text:=upper(trim(coalesce(p_credential_source,'PLATFORM')));
  v_status text:=upper(trim(coalesce(p_status,'CONNECTED')));
begin
  if p_delivery_id is null
     or not exists(select 1 from public.deliveries d where d.id=p_delivery_id)
  then
    raise exception 'HTPWEB: DELIVERY inválido';
  end if;

  if v_mode not in ('OWN','HTPWEB_MANAGED')
     or v_environment not in ('TEST','PRODUCTION')
     or v_source not in ('PLATFORM','VAULT')
     or v_status not in ('PENDING','CONNECTED','DISCONNECTED','ERROR')
  then
    raise exception 'HTPWEB: configuración WhatsApp inválida';
  end if;

  if v_status='CONNECTED'
     and (nullif(trim(coalesce(p_waba_id,'')),'') is null
       or nullif(trim(coalesce(p_phone_number_id,'')),'') is null)
  then
    raise exception 'HTPWEB: WABA y Phone Number ID son obligatorios para conectar';
  end if;

  if v_source='VAULT'
     and v_status='CONNECTED'
     and nullif(trim(coalesce(p_token_secret_name,'')),'') is null
  then
    raise exception 'HTPWEB: falta la credencial segura del WhatsApp propio';
  end if;

  insert into private.delivery_whatsapp_connections(
    delivery_id,connection_mode,status,environment,credential_source,
    meta_business_id,waba_id,phone_number_id,display_phone,verified_name,
    token_secret_name,last_error,requested_phone,requested_at,
    connected_at,approved_at,approved_by,updated_by,updated_at
  )
  values(
    p_delivery_id,v_mode,v_status,v_environment,v_source,
    nullif(trim(coalesce(p_meta_business_id,'')),''),
    nullif(trim(coalesce(p_waba_id,'')),''),
    nullif(trim(coalesce(p_phone_number_id,'')),''),
    nullif(trim(coalesce(p_display_phone,'')),''),
    nullif(trim(coalesce(p_verified_name,'')),''),
    nullif(trim(coalesce(p_token_secret_name,'')),''),
    nullif(trim(coalesce(p_error,'')),''),
    null,now(),
    case when v_status='CONNECTED' then now() else null end,
    case when v_status='CONNECTED' then now() else null end,
    null,null,now()
  )
  on conflict(delivery_id) do update
  set connection_mode=excluded.connection_mode,
      status=excluded.status,
      environment=excluded.environment,
      credential_source=excluded.credential_source,
      meta_business_id=excluded.meta_business_id,
      waba_id=excluded.waba_id,
      phone_number_id=excluded.phone_number_id,
      display_phone=excluded.display_phone,
      verified_name=excluded.verified_name,
      token_secret_name=excluded.token_secret_name,
      last_error=excluded.last_error,
      connected_at=case
        when excluded.status='CONNECTED'
          then coalesce(private.delivery_whatsapp_connections.connected_at,now())
        else private.delivery_whatsapp_connections.connected_at
      end,
      approved_at=case
        when excluded.status='CONNECTED'
          then coalesce(private.delivery_whatsapp_connections.approved_at,now())
        else private.delivery_whatsapp_connections.approved_at
      end,
      updated_at=now();

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'connection_mode',v_mode,
    'status',v_status,
    'environment',v_environment,
    'credential_source',v_source,
    'waba_id',nullif(trim(coalesce(p_waba_id,'')),''),
    'phone_number_id',nullif(trim(coalesce(p_phone_number_id,'')),''),
    'display_phone',nullif(trim(coalesce(p_display_phone,'')),'')
  );
end;
$function$;

revoke all on function public.whatsapp_admin_upsert_connection(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.whatsapp_admin_upsert_connection(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) to service_role;

create or replace function public.whatsapp_delivery_provider_config(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_row private.delivery_whatsapp_connections%rowtype;
  v_token text;
begin
  select * into v_row
  from private.delivery_whatsapp_connections c
  where c.delivery_id=p_delivery_id;

  if not found or v_row.status<>'CONNECTED' then
    return jsonb_build_object('configured',false,'delivery_id',p_delivery_id);
  end if;

  if v_row.credential_source='VAULT' then
    select s.decrypted_secret into v_token
    from vault.decrypted_secrets s
    where s.name=v_row.token_secret_name
    limit 1;

    if nullif(v_token,'') is null then
      return jsonb_build_object(
        'configured',false,
        'delivery_id',p_delivery_id,
        'error','CREDENTIAL_NOT_AVAILABLE'
      );
    end if;
  end if;

  return jsonb_build_object(
    'configured',true,
    'delivery_id',v_row.delivery_id,
    'connection_mode',v_row.connection_mode,
    'environment',v_row.environment,
    'credential_source',v_row.credential_source,
    'meta_business_id',v_row.meta_business_id,
    'waba_id',v_row.waba_id,
    'phone_number_id',v_row.phone_number_id,
    'display_phone',v_row.display_phone,
    'verified_name',v_row.verified_name,
    'access_token',case when v_row.credential_source='VAULT' then v_token else null end
  );
end;
$function$;

revoke all on function public.whatsapp_delivery_provider_config(uuid)
from public,anon,authenticated;
grant execute on function public.whatsapp_delivery_provider_config(uuid)
to service_role;

create or replace function public.master_whatsapp_connections_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not public.is_master() then
    raise exception 'HTPWEB: acceso exclusivo MASTER';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'delivery_id',d.id,
        'delivery_name',d.name,
        'delivery_whatsapp',d.whatsapp,
        'connection_mode',c.connection_mode,
        'status',coalesce(c.status,'DISCONNECTED'),
        'environment',c.environment,
        'display_phone',c.display_phone,
        'verified_name',c.verified_name,
        'requested_phone',c.requested_phone,
        'waba_id',c.waba_id,
        'phone_number_id',c.phone_number_id,
        'last_error',c.last_error,
        'requested_at',c.requested_at,
        'connected_at',c.connected_at
      )
      order by d.name
    )
    from public.deliveries d
    left join private.delivery_whatsapp_connections c
      on c.delivery_id=d.id
    where d.active=true
  ),'[]'::jsonb);
end;
$function$;

revoke all on function public.master_whatsapp_connections_snapshot()
from public,anon;
grant execute on function public.master_whatsapp_connections_snapshot()
to authenticated;
