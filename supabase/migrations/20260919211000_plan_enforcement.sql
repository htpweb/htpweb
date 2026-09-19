-- HTPWEB Código #85 — enforcement efectivo de planes
-- Precedencia: excepción MASTER > plan vigente > configuración manual heredada.

create table if not exists public.plan_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.deliveries(id) on delete cascade,
  local_id uuid references public.locals(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('CAPABILITY','LIMIT')),
  code text not null,
  value jsonb not null,
  reason text,
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((delivery_id is not null)::integer + (local_id is not null)::integer = 1),
  check (jsonb_typeof(value) in ('boolean','number')),
  unique nulls not distinct (delivery_id,local_id,entitlement_type,code)
);

alter table public.plan_entitlement_overrides enable row level security;
drop policy if exists plan_entitlement_overrides_master_all on public.plan_entitlement_overrides;
create policy plan_entitlement_overrides_master_all on public.plan_entitlement_overrides
for all to authenticated using (public.monetization_is_master())
with check (public.monetization_is_master());

create or replace function public.master_set_plan_override(
  p_delivery_id uuid,
  p_local_id uuid,
  p_entitlement_type text,
  p_code text,
  p_value jsonb,
  p_reason text default null
)
returns uuid
language plpgsql security invoker set search_path=public
as $$
declare v_id uuid; v_type text:=upper(trim(coalesce(p_entitlement_type,'')));
begin
  if not public.monetization_is_master() then raise exception 'Solo MASTER puede gestionar excepciones'; end if;
  if (p_delivery_id is not null)::integer + (p_local_id is not null)::integer <> 1 then
    raise exception 'Seleccione exactamente un DELIVERY o LOCAL';
  end if;
  if v_type not in ('CAPABILITY','LIMIT') or trim(coalesce(p_code,''))='' then raise exception 'Prestación inválida'; end if;
  if (v_type='CAPABILITY' and jsonb_typeof(p_value)<>'boolean')
     or (v_type='LIMIT' and (jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric<0)) then
    raise exception 'Valor de excepción inválido';
  end if;
  insert into public.plan_entitlement_overrides(delivery_id,local_id,entitlement_type,code,value,reason)
  values(p_delivery_id,p_local_id,v_type,lower(trim(p_code)),p_value,nullif(trim(coalesce(p_reason,'')),''))
  on conflict nulls not distinct (delivery_id,local_id,entitlement_type,code)
  do update set value=excluded.value,reason=excluded.reason,updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.effective_plan_entitlement(
  p_delivery_id uuid,
  p_local_id uuid,
  p_type text,
  p_code text
)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_value jsonb; v_target text; v_type text:=upper(trim(p_type)); v_code text:=lower(trim(p_code));
begin
  if (p_delivery_id is not null)::integer + (p_local_id is not null)::integer <> 1 then return null; end if;

  select o.value into v_value
  from public.plan_entitlement_overrides o
  where o.delivery_id is not distinct from p_delivery_id
    and o.local_id is not distinct from p_local_id
    and o.entitlement_type=v_type and o.code=v_code;
  if found then return v_value; end if;

  v_target:=case when p_delivery_id is not null then 'DELIVERY' else 'LOCAL' end;
  select e.value into v_value
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id and p.active and p.target_type=v_target
  join public.plan_entitlements e on e.plan_id=p.id and e.entitlement_type=v_type and e.code=v_code
  where a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
    and (a.trial_ends_at is null or a.status<>'TRIAL' or a.trial_ends_at>now())
    and a.delivery_id is not distinct from p_delivery_id
    and a.local_id is not distinct from p_local_id
  order by a.starts_at desc,a.created_at desc limit 1;
  return v_value;
end $$;

-- Conserva las reglas manuales existentes como fallback.
do $$
begin
  if to_regprocedure('public.delivery_has_capability(uuid,text)') is not null
     and to_regprocedure('public.delivery_has_capability_legacy(uuid,text)') is null then
    alter function public.delivery_has_capability(uuid,text) rename to delivery_has_capability_legacy;
  end if;
  if to_regprocedure('public.delivery_limit_value(uuid,text)') is not null
     and to_regprocedure('public.delivery_limit_value_legacy(uuid,text)') is null then
    alter function public.delivery_limit_value(uuid,text) rename to delivery_limit_value_legacy;
  end if;
  if to_regprocedure('public.user_can_manage_local_resource(uuid,text,text)') is not null
     and to_regprocedure('public.user_can_manage_local_resource_legacy(uuid,text,text)') is null then
    alter function public.user_can_manage_local_resource(uuid,text,text) rename to user_can_manage_local_resource_legacy;
  end if;
end $$;

create or replace function public.delivery_has_capability(p_delivery_id uuid,p_capability_code text)
returns boolean language plpgsql stable security definer set search_path=public
as $$
declare v jsonb;
begin
  if public.is_master() then return true; end if;
  v:=public.effective_plan_entitlement(p_delivery_id,null,'CAPABILITY',p_capability_code);
  if v is not null then return (v#>>'{}')::boolean; end if;
  return coalesce(public.delivery_has_capability_legacy(p_delivery_id,p_capability_code),false);
end $$;

create or replace function public.delivery_limit_value(p_delivery_id uuid,p_limit_code text)
returns integer language plpgsql stable security definer set search_path=public
as $$
declare v jsonb;
begin
  v:=public.effective_plan_entitlement(p_delivery_id,null,'LIMIT',p_limit_code);
  if v is not null then return floor((v#>>'{}')::numeric)::integer; end if;
  return public.delivery_limit_value_legacy(p_delivery_id,p_limit_code);
end $$;

create or replace function public.local_has_effective_capability(p_local_id uuid,p_capability_code text)
returns boolean language plpgsql stable security definer set search_path=public
as $$
declare v jsonb;
begin
  if public.is_master() then return true; end if;
  v:=public.effective_plan_entitlement(null,p_local_id,'CAPABILITY',p_capability_code);
  if v is not null then return (v#>>'{}')::boolean; end if;
  return false;
end $$;

create or replace function public.local_effective_limit_value(p_local_id uuid,p_limit_code text)
returns integer language plpgsql stable security definer set search_path=public
as $$
declare v jsonb;
begin
  v:=public.effective_plan_entitlement(null,p_local_id,'LIMIT',p_limit_code);
  if v is null then return null; end if;
  return floor((v#>>'{}')::numeric)::integer;
end $$;

create or replace function public.user_can_manage_local_resource(
  p_local_id uuid,p_permission_code text,p_capability_code text
)
returns boolean language plpgsql stable security definer set search_path=public
as $$
begin
  if public.is_master() then return true; end if;
  if public.user_can_manage_local_resource_legacy(p_local_id,p_permission_code,p_capability_code) then return true; end if;
  return public.user_has_local(p_local_id)
    and public.has_permission(p_permission_code)
    and public.local_has_effective_capability(p_local_id,p_capability_code);
end $$;

create or replace function public.plan_usage_snapshot(p_delivery_id uuid default null,p_local_id uuid default null)
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'delivery_id',p_delivery_id,'local_id',p_local_id,
    'active_plan',(
      select jsonb_build_object('assignment_id',a.id,'plan_id',p.id,'code',p.code,'name',p.name,
        'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'trial_ends_at',a.trial_ends_at)
      from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
      where a.status in ('ACTIVE','TRIAL','PAST_DUE')
        and a.delivery_id is not distinct from p_delivery_id and a.local_id is not distinct from p_local_id
      order by a.starts_at desc limit 1
    ),
    'entitlements',coalesce((
      select jsonb_object_agg(e.code,e.value)
      from public.plan_assignments a join public.plan_entitlements e on e.plan_id=a.plan_id
      where a.status in ('ACTIVE','TRIAL') and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
        and a.delivery_id is not distinct from p_delivery_id and a.local_id is not distinct from p_local_id
    ),'{}'::jsonb)
  )
  where public.monetization_is_master()
    or (p_delivery_id is not null and public.user_has_delivery(p_delivery_id))
    or (p_local_id is not null and public.user_has_local(p_local_id));
$$;

revoke all on function public.master_set_plan_override(uuid,uuid,text,text,jsonb,text) from public;
grant execute on function public.master_set_plan_override(uuid,uuid,text,text,jsonb,text) to authenticated;
revoke all on function public.plan_usage_snapshot(uuid,uuid) from public;
grant execute on function public.plan_usage_snapshot(uuid,uuid) to authenticated;
