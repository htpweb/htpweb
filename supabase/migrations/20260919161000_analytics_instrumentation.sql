-- HTPWEB Código #81 — instrumentación segura de Analytics
-- El navegador nunca inserta directamente en analytics_events.

revoke insert, update, delete on table public.analytics_events from anon, authenticated;

create or replace function public.record_analytics_event(
  p_event_type text,
  p_delivery_id uuid default null,
  p_local_id uuid default null,
  p_product_id uuid default null,
  p_advertisement_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := upper(trim(coalesce(p_event_type, '')));
  v_payload jsonb;
  v_local_id uuid;
begin
  if v_event not in (
    'PAGE_VIEW',
    'LOCAL_VIEW',
    'PRODUCT_VIEW',
    'CART_VIEW',
    'CHECKOUT_VIEW',
    'ORDERS_VIEW',
    'AD_IMPRESSION',
    'AD_CLICK'
  ) then
    raise exception 'Evento analytics no permitido';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Metadata inválida';
  end if;

  -- Evita payloads arbitrarios o excesivos desde clientes públicos.
  if pg_column_size(p_metadata) > 4096 then
    raise exception 'Metadata demasiado grande';
  end if;

  if p_delivery_id is not null and not exists (
    select 1 from public.deliveries d where d.id = p_delivery_id and d.active = true
  ) then
    raise exception 'DELIVERY inválido';
  end if;

  if p_local_id is not null then
    if p_delivery_id is null or not exists (
      select 1
      from public.local_deliveries ld
      join public.locals l on l.id = ld.local_id
      where ld.delivery_id = p_delivery_id
        and ld.local_id = p_local_id
        and ld.active = true
        and l.active = true
    ) then
      raise exception 'LOCAL fuera del DELIVERY';
    end if;
  end if;

  if p_product_id is not null then
    select p.local_id into v_local_id
    from public.products p
    where p.id = p_product_id and p.active = true;

    if v_local_id is null then
      raise exception 'PRODUCTO inválido';
    end if;

    if p_local_id is not null and v_local_id <> p_local_id then
      raise exception 'PRODUCTO fuera del LOCAL';
    end if;

    if p_delivery_id is null or not exists (
      select 1 from public.local_deliveries ld
      where ld.delivery_id = p_delivery_id
        and ld.local_id = v_local_id
        and ld.active = true
    ) then
      raise exception 'PRODUCTO fuera del DELIVERY';
    end if;
  end if;

  if p_advertisement_id is not null and not exists (
    select 1 from public.advertisements a
    where a.id = p_advertisement_id
      and a.active = true
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
      and (a.delivery_id is null or a.delivery_id = p_delivery_id)
  ) then
    raise exception 'PUBLICIDAD inválida';
  end if;

  -- jsonb_populate_record permite conservar el backend Analytics existente:
  -- solo completa columnas que realmente existen en analytics_events.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'event_type', v_event,
    'event_name', v_event,
    'delivery_id', p_delivery_id,
    'local_id', coalesce(p_local_id, v_local_id),
    'product_id', p_product_id,
    'advertisement_id', p_advertisement_id,
    'user_id', auth.uid(),
    'metadata', p_metadata,
    'created_at', now()
  ));

  execute
    'insert into public.analytics_events select (jsonb_populate_record(null::public.analytics_events, $1)).*'
    using v_payload;
end;
$$;

revoke all on function public.record_analytics_event(text,uuid,uuid,uuid,uuid,jsonb) from public;
grant execute on function public.record_analytics_event(text,uuid,uuid,uuid,uuid,jsonb) to anon, authenticated;

comment on function public.record_analytics_event(text,uuid,uuid,uuid,uuid,jsonb)
is 'HTPWEB #81: registra eventos públicos validados sin exponer INSERT directo sobre analytics_events.';
