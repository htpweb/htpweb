-- HTPWEB Código 123 — salud operativa y observabilidad de capacidad.
-- Amplía el resumen MASTER con conexiones de Postgres y snapshots horarios
-- de tráfico/latencia obtenidos desde los logs de Supabase.

alter table public.platform_resource_settings
  add column if not exists observability_synced_at timestamptz,
  add column if not exists storage_egress_24h_bytes bigint,
  add column if not exists storage_requests_24h bigint,
  add column if not exists storage_p95_ms numeric,
  add column if not exists api_requests_24h bigint,
  add column if not exists api_error_rate_24h numeric,
  add column if not exists api_p95_ms numeric;

create or replace function public.master_resource_usage_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_settings public.platform_resource_settings%rowtype;
  v_storage_bytes bigint:=0;
  v_image_bytes bigint:=0;
  v_storage_objects bigint:=0;
  v_image_objects bigint:=0;
  v_large_images bigint:=0;
  v_largest_image_bytes bigint:=0;
  v_database_bytes bigint:=0;
  v_storage_quota_bytes bigint;
  v_database_quota_bytes bigint;
  v_egress_quota_bytes bigint;
  v_cached_egress_quota_bytes bigint;
  v_egress_used_bytes bigint;
  v_cached_egress_used_bytes bigint;
  v_connections_current integer:=0;
  v_connections_max integer:=0;
  v_active_queries integer:=0;
  v_long_queries integer:=0;
  v_cache_hit_percent numeric;
  v_storage_egress_projection_bytes bigint;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  select *
  into v_settings
  from public.platform_resource_settings
  where singleton=true;

  if not found then
    insert into public.platform_resource_settings(singleton,plan_code)
    values(true,'FREE')
    returning * into v_settings;
  end if;

  select
    coalesce(sum(coalesce(nullif(o.metadata->>'size','')::bigint,0)),0)::bigint,
    count(*)::bigint,
    coalesce(sum(case
      when lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
      then coalesce(nullif(o.metadata->>'size','')::bigint,0)
      else 0 end),0)::bigint,
    count(*) filter (
      where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
    )::bigint,
    count(*) filter (
      where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
        and coalesce(nullif(o.metadata->>'size','')::bigint,0) > 1048576
    )::bigint,
    coalesce(max(case
      when lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
      then coalesce(nullif(o.metadata->>'size','')::bigint,0)
      else 0 end),0)::bigint
  into
    v_storage_bytes,v_storage_objects,v_image_bytes,v_image_objects,
    v_large_images,v_largest_image_bytes
  from storage.objects o;

  select pg_database_size(current_database())::bigint
  into v_database_bytes;

  select
    count(*)::integer,
    count(*) filter (where state='active')::integer,
    count(*) filter (
      where state='active'
        and query_start < now()-interval '2 seconds'
    )::integer
  into v_connections_current,v_active_queries,v_long_queries
  from pg_catalog.pg_stat_activity
  where datname=current_database();

  v_connections_max:=current_setting('max_connections')::integer;

  select round(
    100 * sum(blks_hit)::numeric / nullif(sum(blks_hit)+sum(blks_read),0),
    2
  )
  into v_cache_hit_percent
  from pg_catalog.pg_stat_database
  where datname=current_database();

  case v_settings.plan_code
    when 'FREE' then
      v_storage_quota_bytes:=1073741824;
      v_database_quota_bytes:=524288000;
      v_egress_quota_bytes:=5368709120;
      v_cached_egress_quota_bytes:=5368709120;
    when 'PRO' then
      v_storage_quota_bytes:=107374182400;
      v_database_quota_bytes:=8589934592;
      v_egress_quota_bytes:=268435456000;
      v_cached_egress_quota_bytes:=268435456000;
    when 'TEAM' then
      v_storage_quota_bytes:=107374182400;
      v_database_quota_bytes:=8589934592;
      v_egress_quota_bytes:=268435456000;
      v_cached_egress_quota_bytes:=268435456000;
    else
      v_storage_quota_bytes:=null;
      v_database_quota_bytes:=null;
      v_egress_quota_bytes:=null;
      v_cached_egress_quota_bytes:=null;
  end case;

  v_egress_used_bytes:=case
    when v_settings.egress_used_gb is null then null
    else round(v_settings.egress_used_gb*1073741824)::bigint
  end;
  v_cached_egress_used_bytes:=case
    when v_settings.cached_egress_used_gb is null then null
    else round(v_settings.cached_egress_used_gb*1073741824)::bigint
  end;
  v_storage_egress_projection_bytes:=case
    when v_settings.storage_egress_24h_bytes is null then null
    else v_settings.storage_egress_24h_bytes*30
  end;

  return jsonb_build_object(
    'measured_at',now(),
    'plan_code',v_settings.plan_code,
    'storage_bytes',v_storage_bytes,
    'storage_quota_bytes',v_storage_quota_bytes,
    'storage_free_bytes',case when v_storage_quota_bytes is null then null else greatest(v_storage_quota_bytes-v_storage_bytes,0) end,
    'storage_percent',case when coalesce(v_storage_quota_bytes,0)>0 then round((v_storage_bytes::numeric/v_storage_quota_bytes)*100,2) else null end,
    'database_bytes',v_database_bytes,
    'database_quota_bytes',v_database_quota_bytes,
    'database_free_bytes',case when v_database_quota_bytes is null then null else greatest(v_database_quota_bytes-v_database_bytes,0) end,
    'database_percent',case when coalesce(v_database_quota_bytes,0)>0 then round((v_database_bytes::numeric/v_database_quota_bytes)*100,2) else null end,
    'storage_objects',v_storage_objects,
    'image_objects',v_image_objects,
    'image_bytes',v_image_bytes,
    'large_images',v_large_images,
    'largest_image_bytes',v_largest_image_bytes,
    'egress_used_bytes',v_egress_used_bytes,
    'egress_quota_bytes',v_egress_quota_bytes,
    'egress_free_bytes',case when v_egress_used_bytes is null or v_egress_quota_bytes is null then null else greatest(v_egress_quota_bytes-v_egress_used_bytes,0) end,
    'egress_percent',case when v_egress_used_bytes is not null and coalesce(v_egress_quota_bytes,0)>0 then round((v_egress_used_bytes::numeric/v_egress_quota_bytes)*100,2) else null end,
    'cached_egress_used_bytes',v_cached_egress_used_bytes,
    'cached_egress_quota_bytes',v_cached_egress_quota_bytes,
    'cached_egress_free_bytes',case when v_cached_egress_used_bytes is null or v_cached_egress_quota_bytes is null then null else greatest(v_cached_egress_quota_bytes-v_cached_egress_used_bytes,0) end,
    'cached_egress_percent',case when v_cached_egress_used_bytes is not null and coalesce(v_cached_egress_quota_bytes,0)>0 then round((v_cached_egress_used_bytes::numeric/v_cached_egress_quota_bytes)*100,2) else null end,
    'egress_updated_at',v_settings.egress_updated_at,
    'connections_current',v_connections_current,
    'connections_max',v_connections_max,
    'connections_percent',case when v_connections_max>0 then round((v_connections_current::numeric/v_connections_max)*100,2) else null end,
    'active_queries',v_active_queries,
    'long_queries',v_long_queries,
    'database_cache_hit_percent',v_cache_hit_percent,
    'observability_synced_at',v_settings.observability_synced_at,
    'storage_egress_24h_bytes',v_settings.storage_egress_24h_bytes,
    'storage_requests_24h',v_settings.storage_requests_24h,
    'storage_p95_ms',v_settings.storage_p95_ms,
    'storage_egress_30d_projected_bytes',v_storage_egress_projection_bytes,
    'storage_egress_projected_percent',case
      when v_storage_egress_projection_bytes is not null
        and coalesce(v_egress_quota_bytes,0)>0
      then round((v_storage_egress_projection_bytes::numeric/v_egress_quota_bytes)*100,2)
      else null
    end,
    'api_requests_24h',v_settings.api_requests_24h,
    'api_error_rate_24h',v_settings.api_error_rate_24h,
    'api_p95_ms',v_settings.api_p95_ms
  );
end;
$$;

comment on function public.master_resource_usage_summary() is
  'MASTER: capacidad live de Storage/DB/conexiones y snapshot horario de observabilidad. Egress exacto de billing puede registrarse como referencia; el tráfico automático mostrado desde logs es Storage de 24h.';
