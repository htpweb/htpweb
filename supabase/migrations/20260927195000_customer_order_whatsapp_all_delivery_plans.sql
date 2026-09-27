alter table private.delivery_whatsapp_settings
  add column if not exists customer_orders boolean not null default true;

insert into public.plan_feature_catalog(
  code,
  entitlement_type,
  family,
  label,
  description,
  stage,
  unit,
  active,
  display_order,
  updated_at
)
values(
  'whatsapp.customer_order',
  'CAPABILITY',
  'WhatsApp',
  'Pedido del cliente por WhatsApp',
  'Después de registrar el pedido en HTPWEB, abre WhatsApp del cliente con el pedido listo para enviar al DELIVERY.',
  1,
  null,
  true,
  730,
  now()
)
on conflict(code) do update
set entitlement_type=excluded.entitlement_type,
    family=excluded.family,
    label=excluded.label,
    description=excluded.description,
    stage=excluded.stage,
    unit=excluded.unit,
    active=true,
    display_order=excluded.display_order,
    updated_at=now();

insert into public.plan_entitlements(
  plan_id,
  entitlement_type,
  code,
  value,
  updated_at
)
select
  p.id,
  'CAPABILITY',
  'whatsapp.customer_order',
  'true'::jsonb,
  now()
from public.subscription_plans p
where p.target_type='DELIVERY'
on conflict(plan_id,entitlement_type,code) do update
set value='true'::jsonb,
    updated_at=now();

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
  v_customer_orders boolean := true;
  v_customer_available boolean := false;
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

  select s.mode,s.local_orders,s.driver_dispatch,s.customer_orders
  into v_mode,v_local_orders,v_driver_dispatch,v_customer_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=p_delivery_id;

  v_customer_available :=
    public.delivery_has_capability(p_delivery_id,'whatsapp.customer_order');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'mode',coalesce(v_mode,'ASSISTED'),
    'local_orders',coalesce(v_local_orders,true),
    'driver_dispatch',coalesce(v_driver_dispatch,true),
    'customer_orders_configured',coalesce(v_customer_orders,true),
    'customer_orders',coalesce(v_customer_orders,true) and v_customer_available,
    'customer_order_available',v_customer_available
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
  p_driver_dispatch boolean,
  p_customer_orders boolean
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
    delivery_id,
    mode,
    local_orders,
    driver_dispatch,
    customer_orders,
    updated_by,
    updated_at
  )
  values(
    p_delivery_id,
    v_mode,
    coalesce(p_local_orders,true),
    coalesce(p_driver_dispatch,true),
    coalesce(p_customer_orders,true),
    auth.uid(),
    now()
  )
  on conflict(delivery_id) do update
  set mode=excluded.mode,
      local_orders=excluded.local_orders,
      driver_dispatch=excluded.driver_dispatch,
      customer_orders=excluded.customer_orders,
      updated_by=excluded.updated_by,
      updated_at=now();

  return public.delivery_whatsapp_settings_snapshot(p_delivery_id);
end;
$function$;

revoke all on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean,boolean)
from public,anon;
grant execute on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean,boolean)
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
  v_customer_orders boolean := true;
begin
  select coalesce(s.customer_orders,true)
  into v_customer_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=p_delivery_id;

  return public.delivery_set_whatsapp_settings(
    p_delivery_id,
    p_mode,
    p_local_orders,
    p_driver_dispatch,
    coalesce(v_customer_orders,true)
  );
end;
$function$;

revoke all on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean)
from public,anon;
grant execute on function public.delivery_set_whatsapp_settings(uuid,text,boolean,boolean)
to authenticated,service_role;

create or replace function public.public_delivery_customer_order_whatsapp(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_name text;
  v_whatsapp text;
  v_customer_orders boolean := true;
  v_available boolean := false;
  v_enabled boolean := false;
begin
  if p_delivery_id is null then
    return jsonb_build_object(
      'enabled',false,
      'reason','DELIVERY_REQUIRED'
    );
  end if;

  select d.name,d.whatsapp
  into v_name,v_whatsapp
  from public.deliveries d
  where d.id=p_delivery_id
    and d.active=true;

  if not found then
    return jsonb_build_object(
      'enabled',false,
      'reason','DELIVERY_UNAVAILABLE'
    );
  end if;

  select coalesce(s.customer_orders,true)
  into v_customer_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=p_delivery_id;

  v_available :=
    public.delivery_has_capability(p_delivery_id,'whatsapp.customer_order');

  v_enabled :=
    v_available
    and coalesce(v_customer_orders,true)
    and nullif(regexp_replace(coalesce(v_whatsapp,''),'[^0-9]','','g'),'') is not null;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'delivery_name',v_name,
    'enabled',v_enabled,
    'whatsapp',case when v_enabled then v_whatsapp else null end,
    'reason',case
      when not v_available then 'PLAN_DISABLED'
      when coalesce(v_customer_orders,true) is not true then 'DELIVERY_DISABLED'
      when nullif(regexp_replace(coalesce(v_whatsapp,''),'[^0-9]','','g'),'') is null then 'WHATSAPP_MISSING'
      else null
    end
  );
end;
$function$;

revoke all on function public.public_delivery_customer_order_whatsapp(uuid)
from public,anon;
grant execute on function public.public_delivery_customer_order_whatsapp(uuid)
to authenticated,service_role;
