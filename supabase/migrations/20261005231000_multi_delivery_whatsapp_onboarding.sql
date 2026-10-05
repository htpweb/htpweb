-- HTPWEB: WhatsApp multi-DELIVERY.
-- Cada DELIVERY mantiene su propia conexion Meta y el envio a LOCAL
-- es independiente del modo de despacho de repartidores.

create or replace function private.ensure_delivery_whatsapp_defaults()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into private.delivery_whatsapp_settings(
    delivery_id,mode,local_orders,driver_dispatch,updated_at
  )
  values(new.id,'AUTOMATIC',true,true,now())
  on conflict(delivery_id) do nothing;

  insert into private.delivery_whatsapp_connections(
    delivery_id,connection_mode,status,environment,credential_source,
    requested_phone,requested_at,updated_at
  )
  values(
    new.id,'HTPWEB_MANAGED','PENDING','PRODUCTION','PLATFORM',
    nullif(trim(coalesce(new.whatsapp,'')),''),
    now(),now()
  )
  on conflict(delivery_id) do nothing;

  return new;
end;
$function$;

revoke execute on function private.ensure_delivery_whatsapp_defaults()
from public,anon,authenticated;

drop trigger if exists trg_delivery_whatsapp_defaults on public.deliveries;
create trigger trg_delivery_whatsapp_defaults
after insert on public.deliveries
for each row
execute function private.ensure_delivery_whatsapp_defaults();

-- Backfill seguro para DELIVERY ya existentes que aun no tengan configuracion.
insert into private.delivery_whatsapp_settings(
  delivery_id,mode,local_orders,driver_dispatch,updated_at
)
select d.id,'AUTOMATIC',true,true,now()
from public.deliveries d
left join private.delivery_whatsapp_settings s on s.delivery_id=d.id
where s.delivery_id is null
on conflict(delivery_id) do nothing;

insert into private.delivery_whatsapp_connections(
  delivery_id,connection_mode,status,environment,credential_source,
  requested_phone,requested_at,updated_at
)
select
  d.id,'HTPWEB_MANAGED','PENDING','PRODUCTION','PLATFORM',
  nullif(trim(coalesce(d.whatsapp,'')),''),
  now(),now()
from public.deliveries d
left join private.delivery_whatsapp_connections c on c.delivery_id=d.id
where c.delivery_id is null
on conflict(delivery_id) do nothing;

-- Si el DELIVERY cambia su numero antes de conectarlo, mantener actualizada
-- la solicitud pendiente sin tocar conexiones ya aprobadas.
create or replace function private.sync_pending_delivery_whatsapp_phone()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.whatsapp is distinct from old.whatsapp then
    update private.delivery_whatsapp_connections c
       set requested_phone=nullif(trim(coalesce(new.whatsapp,'')),''),
           requested_at=now(),
           updated_at=now()
     where c.delivery_id=new.id
       and c.status in ('PENDING','ERROR','DISCONNECTED');
  end if;
  return new;
end;
$function$;

revoke execute on function private.sync_pending_delivery_whatsapp_phone()
from public,anon,authenticated;

drop trigger if exists trg_sync_pending_delivery_whatsapp_phone on public.deliveries;
create trigger trg_sync_pending_delivery_whatsapp_phone
after update of whatsapp on public.deliveries
for each row
execute function private.sync_pending_delivery_whatsapp_phone();

-- Notificar a los LOCAL depende del modo WhatsApp del DELIVERY,
-- no de MANUAL/HYBRID/AUTO usado para asignar repartidores.
create or replace function private.queue_local_orders_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_whatsapp_mode text;
  v_local_orders boolean;
  v_url text;
  v_secret text;
  v_local record;
begin
  if new.status<>'CONFIRMED'
     or old.status is not distinct from new.status
  then
    return new;
  end if;

  select s.mode,s.local_orders
    into v_whatsapp_mode,v_local_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=new.delivery_id;

  if coalesce(v_whatsapp_mode,'AUTOMATIC')<>'AUTOMATIC'
     or coalesce(v_local_orders,true) is not true
  then
    return new;
  end if;

  -- No se encola si el DELIVERY aun no tiene un proveedor Meta conectado.
  if not exists(
    select 1
    from private.delivery_whatsapp_connections c
    where c.delivery_id=new.delivery_id
      and c.status='CONNECTED'
      and nullif(c.waba_id,'') is not null
      and nullif(c.phone_number_id,'') is not null
  ) then
    return new;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_project_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_hook_secret';

  if nullif(v_url,'') is null or nullif(v_secret,'') is null then
    return new;
  end if;

  for v_local in
    select ol.local_id
    from public.order_locals ol
    join public.locals l on l.id=ol.local_id
    where ol.order_id=new.id
      and ol.status<>'CANCELLED'
      and ol.prep_requested_at is null
      and nullif(regexp_replace(coalesce(l.whatsapp,''),'\D','','g'),'') is not null
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/whatsapp-notify',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-htpweb-whatsapp-hook',v_secret
      ),
      body := jsonb_build_object(
        'kind','LOCAL_ORDER_AUTO',
        'delivery_id',new.delivery_id,
        'order_id',new.id,
        'local_id',v_local.local_id,
        'requested_at',now()
      ),
      timeout_milliseconds := 15000
    );
  end loop;

  return new;
exception
  when others then
    raise warning 'HTPWEB WhatsApp LOCAL: no se pudo encolar pedido: %',sqlerrm;
    return new;
end;
$function$;

comment on function private.queue_local_orders_after_confirmation() is
  'Envia automaticamente cada subpedido al LOCAL usando la conexion Meta propia del DELIVERY, independiente del modo de despacho de repartidores.';
