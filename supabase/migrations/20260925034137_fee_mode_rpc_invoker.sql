-- Hardening: el RPC visible usa SECURITY INVOKER y delega las escrituras
-- en master_set_delivery_capability, que ya valida MASTER.

create or replace function public.master_set_delivery_fee_mode(
  p_delivery_id uuid,
  p_mode text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mode text := upper(trim(coalesce(p_mode,'')));
  v_code text;
  v_any_enabled boolean;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  v_code := case v_mode
    when 'FIXED' then 'delivery_fees.fixed'
    when 'DISTANCE' then 'delivery_fees.distance'
    else null
  end;

  if v_code is null then
    raise exception 'HTPWEB: modalidad debe ser FIXED o DISTANCE';
  end if;

  perform public.master_set_delivery_capability(
    p_delivery_id,
    v_code,
    coalesce(p_enabled,false)
  );

  select exists (
    select 1
    from public.delivery_capabilities dc
    join public.capabilities c on c.id=dc.capability_id
    where dc.delivery_id=p_delivery_id
      and c.code in ('delivery_fees.fixed','delivery_fees.distance')
      and c.active=true
      and dc.enabled=true
  ) into v_any_enabled;

  perform public.master_set_delivery_capability(
    p_delivery_id,
    'delivery_fees.manage',
    v_any_enabled
  );

  return public.master_delivery_fee_modes_status(p_delivery_id);
end;
$function$;
