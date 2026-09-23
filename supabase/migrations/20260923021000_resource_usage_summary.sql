-- HTPWEB Código 122 — indicadores de capacidad y uso de recursos.
-- Mide Storage y base de datos directamente en Supabase. El egress mensual
-- se guarda como snapshot de referencia porque Supabase no expone esos bytes
-- de facturación desde Postgres.

create table if not exists public.platform_resource_settings (
  singleton boolean primary key default true check (singleton),
  plan_code text not null default 'FREE'
    check (plan_code in ('FREE','PRO','TEAM','ENTERPRISE')),
  egress_used_gb numeric,
  cached_egress_used_gb numeric,
  egress_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.platform_resource_settings(singleton,plan_code)
values(true,'FREE')
on conflict(singleton) do nothing;

alter table public.platform_resource_settings enable row level security;

revoke all on table public.platform_resource_settings from public,anon;
revoke all on table public.platform_resource_settings from authenticated;

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
    coalesce(sum(
      case
        when lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
        then coalesce(nullif(o.metadata->>'size','')::bigint,0)
        else 0
      end
    ),0)::bigint,
    count(*) filter (
      where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
    )::bigint,
    count(*) filter (
      where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
        and coalesce(nullif(o.metadata->>'size','')::bigint,0) > 1048576
    )::bigint,
    coalesce(max(
      case
        when lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
        then coalesce(nullif(o.metadata->>'size','')::bigint,0)
        else 0
      end
    ),0)::bigint
  into
    v_storage_bytes,
    v_storage_objects,
    v_image_bytes,
    v_image_objects,
    v_large_images,
    v_largest_image_bytes
  from storage.objects o;

  select pg_database_size(current_database())::bigint
  into v_database_bytes;

  case v_settings.plan_code
    when 'FREE' then
      v_storage_quota_bytes:=1073741824;       -- 1 GB
      v_database_quota_bytes:=524288000;       -- 500 MB
      v_egress_quota_bytes:=5368709120;        -- 5 GB
      v_cached_egress_quota_bytes:=5368709120; -- 5 GB
    when 'PRO' then
      v_storage_quota_bytes:=107374182400;        -- 100 GB
      v_database_quota_bytes:=8589934592;         -- 8 GB
      v_egress_quota_bytes:=268435456000;         -- 250 GB
      v_cached_egress_quota_bytes:=268435456000;  -- 250 GB
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
    'egress_updated_at',v_settings.egress_updated_at
  );
end;
$$;

create or replace function public.master_save_resource_usage_settings(
  p_plan_code text,
  p_egress_used_gb numeric default null,
  p_cached_egress_used_gb numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan text:=upper(trim(coalesce(p_plan_code,'')));
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if v_plan not in ('FREE','PRO','TEAM','ENTERPRISE') then
    raise exception 'HTPWEB: plan de referencia inválido';
  end if;
  if p_egress_used_gb is not null and p_egress_used_gb<0 then
    raise exception 'HTPWEB: egress inválido';
  end if;
  if p_cached_egress_used_gb is not null and p_cached_egress_used_gb<0 then
    raise exception 'HTPWEB: egress cacheado inválido';
  end if;

  insert into public.platform_resource_settings(
    singleton,plan_code,egress_used_gb,cached_egress_used_gb,egress_updated_at,updated_at
  )
  values(
    true,v_plan,p_egress_used_gb,p_cached_egress_used_gb,
    case when p_egress_used_gb is not null or p_cached_egress_used_gb is not null then now() else null end,
    now()
  )
  on conflict(singleton) do update set
    plan_code=excluded.plan_code,
    egress_used_gb=excluded.egress_used_gb,
    cached_egress_used_gb=excluded.cached_egress_used_gb,
    egress_updated_at=excluded.egress_updated_at,
    updated_at=now();

  return public.master_resource_usage_summary();
end;
$$;

revoke all on function public.master_resource_usage_summary() from public,anon;
grant execute on function public.master_resource_usage_summary() to authenticated;

revoke all on function public.master_save_resource_usage_settings(text,numeric,numeric) from public,anon;
grant execute on function public.master_save_resource_usage_settings(text,numeric,numeric) to authenticated;

comment on function public.master_resource_usage_summary() is
  'MASTER: uso live de Storage/DB y referencia de cuotas del plan. Egress es snapshot manual hasta disponer de una API de billing soportada.';
