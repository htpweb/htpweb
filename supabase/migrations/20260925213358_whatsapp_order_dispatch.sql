create table if not exists private.delivery_whatsapp_settings(
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  mode text not null default 'ASSISTED' check (mode in ('ASSISTED','AUTOMATIC')),
  local_orders boolean not null default true,
  driver_dispatch boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.delivery_whatsapp_settings enable row level security;
revoke all on table private.delivery_whatsapp_settings from public,anon,authenticated;

drop policy if exists delivery_whatsapp_settings_deny_all on private.delivery_whatsapp_settings;
create policy delivery_whatsapp_settings_deny_all
on private.delivery_whatsapp_settings
for all
to public
using (false)
with check (false);

create or replace function public.delivery_whatsapp_settings_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_mode text := 'ASSISTED';
  v_local_orders boolean := true;
  v_driver_dispatch boolean := true;
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,
       'orders.view',
       'orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar WhatsApp de este DELIVERY';
  end if;

  select s.mode,s.local_orders,s.driver_dispatch
  into v_mode,v_local_orders,v_driver_dispatch
  from private.delivery_whatsapp_settings s
  where s.delivery_id=p_delivery_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'mode',coalesce(v_mode,'ASSISTED'),
    'local_orders',coalesce(v_local_orders,true),
    'driver_dispatch',coalesce(v_driver_dispatch,true)
  );
end;
$function$;

revoke all on function public.delivery_whatsapp_settings_snapshot(uuid)
from public,anon;
grant execute on function public.delivery_whatsapp_settings_snapshot(uuid)
to authenticated,service_role;

create or replace function public.delivery_set_whatsapp_settings(
  p_delivery_id uuid,
  p_mode text,
  p_local_orders boolean,
  p_driver_dispatch boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text := upper(trim(coalesce(p_mode,'ASSISTED')));
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if v_mode not in ('ASSISTED','AUTOMATIC') then
    raise exception 'HTPWEB: modo WhatsApp inválido';
  end if;

  if not public.is_master() then
    if public.current_role_code()<>'DELIVERY_ADMIN'
       or not public.user_has_delivery(p_delivery_id)
       or not public.has_permission('orders.manage')
    then
      raise exception 'HTPWEB: no autorizado para configurar WhatsApp';
    end if;
  end if;

  insert into private.delivery_whatsapp_settings(
    delivery_id,mode,local_orders,driver_dispatch,updated_by,updated_at
  )
  values(
    p_delivery_id,
    v_mode,
    coalesce(p_local_orders,true),
    coalesce(p_driver_dispatch,true),
    auth.uid(),
    now()
  )
  on conflict(delivery_id) do update
  set mode=excluded.mode,
      local_orders=excluded.local_orders,
      driver_dispatch=excluded.driver_dispatch,
      updated_by=excluded.updated_by,
      updated_at=now();

  return public.delivery_whatsapp_settings_snapshot(p_delivery_id);
end;
$function$;

revoke all on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean)
from public,anon;
grant execute on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean)
to authenticated,service_role;

create or replace function public.verify_whatsapp_dispatch_hook_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1
    from vault.decrypted_secrets s
    where s.name='whatsapp_dispatch_hook_secret'
      and s.decrypted_secret=p_secret
  );
$function$;

revoke all on function public.verify_whatsapp_dispatch_hook_secret(text)
from public,anon,authenticated;
grant execute on function public.verify_whatsapp_dispatch_hook_secret(text)
to service_role;

do $block$
begin
  if not exists(
    select 1 from vault.secrets
    where name='whatsapp_dispatch_project_url'
  ) then
    perform vault.create_secret(
      'https://hwfloywzqlgqieonuswl.supabase.co',
      'whatsapp_dispatch_project_url'
    );
  end if;

  if not exists(
    select 1 from vault.secrets
    where name='whatsapp_dispatch_hook_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'whatsapp_dispatch_hook_secret'
    );
  end if;
end
$block$;

create or replace function private.queue_whatsapp_driver_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event text;
  v_url text;
  v_secret text;
  v_mode text;
  v_driver_dispatch boolean;
begin
  select s.mode,s.driver_dispatch
  into v_mode,v_driver_dispatch
  from private.delivery_whatsapp_settings s
  where s.delivery_id=new.delivery_id;

  if coalesce(v_mode,'ASSISTED')<>'AUTOMATIC'
     or coalesce(v_driver_dispatch,true) is not true
  then
    return new;
  end if;

  if tg_op='INSERT' and new.status='ACTIVE' then
    v_event:='DRIVER_ASSIGNED';
  elsif tg_op='UPDATE'
        and old.status='ACTIVE'
        and new.status='UNASSIGNED'
  then
    v_event:='DRIVER_UNASSIGNED';
  else
    return new;
  end if;

  select decrypted_secret
  into v_url
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_project_url';

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_hook_secret';

  if nullif(v_url,'') is null or nullif(v_secret,'') is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/whatsapp-notify',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-htpweb-whatsapp-hook',v_secret
    ),
    body := jsonb_build_object(
      'kind',v_event,
      'assignment_id',new.id,
      'requested_at',now()
    ),
    timeout_milliseconds := 15000
  );

  return new;
exception
  when others then
    raise warning 'HTPWEB WhatsApp: no se pudo encolar evento de repartidor: %',sqlerrm;
    return new;
end;
$function$;

revoke execute on function private.queue_whatsapp_driver_event()
from public,anon,authenticated;

drop trigger if exists trg_order_driver_assignment_whatsapp
on public.order_driver_assignments;

create trigger trg_order_driver_assignment_whatsapp
after insert or update of status
on public.order_driver_assignments
for each row
execute function private.queue_whatsapp_driver_event();
