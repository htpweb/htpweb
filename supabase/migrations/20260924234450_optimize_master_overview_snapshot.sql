-- HTPWEB — optimización del resumen MASTER.
-- Reemplaza múltiples COUNT exactos con RLS por un solo snapshot protegido.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.master_overview_snapshot_impl(p_today_start timestamptz)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_resource jsonb;
  v_recent_orders jsonb;
begin
  if auth.uid() is null or not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_today_start is null then
    raise exception 'HTPWEB: fecha inicial requerida';
  end if;

  v_resource := public.master_resource_usage_summary();

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_recent_orders
  from (
    select o.id,o.status,o.total,o.customer_name,o.created_at
    from public.orders o
    order by o.created_at desc
    limit 5
  ) x;

  return jsonb_build_object(
    'orders_today', (
      select count(*) from public.orders o
      where o.created_at >= p_today_start
    ),
    'delivered_today_count', (
      select count(*) from public.orders o
      where o.created_at >= p_today_start and o.status='DELIVERED'
    ),
    'delivered_today_value', (
      select coalesce(sum(o.total),0) from public.orders o
      where o.created_at >= p_today_start and o.status='DELIVERED'
    ),
    'open_orders', (
      select count(*) from public.orders o
      where o.status = any(array['PENDING','CONFIRMED','PREPARING','READY','EN_ROUTE']::text[])
    ),
    'locals_total', (select count(*) from public.locals),
    'locals_active', (select count(*) from public.locals where active=true),
    'products_total', (select count(*) from public.products),
    'products_active', (select count(*) from public.products where active=true),
    'products_with_image', (
      select count(*) from public.products
      where image_url is not null and btrim(image_url)<>''
    ),
    'deliveries_total', (select count(*) from public.deliveries),
    'deliveries_active', (select count(*) from public.deliveries where active=true),
    'pending_requests', (
      select count(*) from public.local_requests
      where status in ('PENDING','NEEDS_INFO')
    ),
    'customers_total', (select count(*) from public.customers),
    'active_promotions', (select count(*) from public.local_promotions where active=true),
    'recent_orders', v_recent_orders,
    'resource', v_resource
  );
end;
$$;

revoke all on function private.master_overview_snapshot_impl(timestamptz) from public;
grant execute on function private.master_overview_snapshot_impl(timestamptz) to authenticated;

create or replace function public.master_overview_snapshot(p_today_start timestamptz)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.master_overview_snapshot_impl(p_today_start);
$$;

revoke all on function public.master_overview_snapshot(timestamptz) from public;
revoke all on function public.master_overview_snapshot(timestamptz) from anon;
grant execute on function public.master_overview_snapshot(timestamptz) to authenticated;
