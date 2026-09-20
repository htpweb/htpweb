-- HTPWEB Código #84 — Monetización backend
-- Planes, prestaciones y asignación por DELIVERY/LOCAL. El enforcement se incorpora en #85.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  target_type text not null check (target_type in ('DELIVERY','LOCAL')),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null default 'MONTH' check (billing_interval in ('MONTH','YEAR','ONE_TIME')),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('CAPABILITY','LIMIT')),
  code text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, entitlement_type, code),
  check (jsonb_typeof(value) in ('boolean','number','string'))
);

create table if not exists public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id),
  delivery_id uuid references public.deliveries(id),
  local_id uuid references public.locals(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','TRIAL','PAST_DUE','CANCELLED','EXPIRED')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  assigned_by uuid not null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((delivery_id is not null)::integer + (local_id is not null)::integer = 1),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists plan_assignments_delivery_idx on public.plan_assignments(delivery_id, status);
create index if not exists plan_assignments_local_idx on public.plan_assignments(local_id, status);
create index if not exists plan_assignments_plan_idx on public.plan_assignments(plan_id, status);

create or replace function public.monetization_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master();
$$;

revoke all on function public.monetization_is_master() from public;
grant execute on function public.monetization_is_master() to authenticated;

alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.plan_assignments enable row level security;

drop policy if exists subscription_plans_master_all on public.subscription_plans;
create policy subscription_plans_master_all on public.subscription_plans
for all to authenticated using (public.monetization_is_master())
with check (public.monetization_is_master());

drop policy if exists plan_entitlements_master_all on public.plan_entitlements;
create policy plan_entitlements_master_all on public.plan_entitlements
for all to authenticated using (public.monetization_is_master())
with check (public.monetization_is_master());

drop policy if exists plan_assignments_master_all on public.plan_assignments;
create policy plan_assignments_master_all on public.plan_assignments
for all to authenticated using (public.monetization_is_master())
with check (public.monetization_is_master());

drop policy if exists subscription_plans_scoped_read on public.subscription_plans;
create policy subscription_plans_scoped_read on public.subscription_plans
for select to authenticated using (
  active or public.monetization_is_master()
);

drop policy if exists plan_entitlements_scoped_read on public.plan_entitlements;
create policy plan_entitlements_scoped_read on public.plan_entitlements
for select to authenticated using (
  public.monetization_is_master()
  or exists (
    select 1
    from public.plan_assignments a
    where a.plan_id = plan_entitlements.plan_id
      and a.status in ('ACTIVE','TRIAL','PAST_DUE')
      and (a.ends_at is null or a.ends_at > now())
      and (
        (a.delivery_id is not null and exists (
          select 1 from public.user_deliveries ud
          where ud.user_id = auth.uid() and ud.delivery_id = a.delivery_id
        ))
        or
        (a.local_id is not null and exists (
          select 1 from public.user_locals ul
          where ul.user_id = auth.uid() and ul.local_id = a.local_id
        ))
      )
  )
);

drop policy if exists plan_assignments_scoped_read on public.plan_assignments;
create policy plan_assignments_scoped_read on public.plan_assignments
for select to authenticated using (
  public.monetization_is_master()
  or (delivery_id is not null and exists (
    select 1 from public.user_deliveries ud
    where ud.user_id = auth.uid() and ud.delivery_id = plan_assignments.delivery_id
  ))
  or (local_id is not null and exists (
    select 1 from public.user_locals ul
    where ul.user_id = auth.uid() and ul.local_id = plan_assignments.local_id
  ))
);

create or replace function public.master_save_subscription_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_target_type text,
  p_price numeric,
  p_currency text,
  p_billing_interval text,
  p_active boolean,
  p_display_order integer,
  p_entitlements jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_item jsonb;
  v_type text;
  v_code text;
  v_value jsonb;
begin
  if not public.monetization_is_master() then raise exception 'Solo MASTER puede gestionar planes'; end if;
  if trim(coalesce(p_code,'')) = '' or trim(coalesce(p_name,'')) = '' then raise exception 'Código y nombre requeridos'; end if;
  if upper(trim(coalesce(p_target_type,''))) not in ('DELIVERY','LOCAL') then raise exception 'Tipo de destino inválido'; end if;
  if p_price is null or p_price < 0 then raise exception 'Precio inválido'; end if;
  if p_entitlements is null or jsonb_typeof(p_entitlements) <> 'array' then raise exception 'Prestaciones inválidas'; end if;

  insert into public.subscription_plans(id,code,name,description,target_type,price,currency,billing_interval,active,display_order)
  values(coalesce(p_plan_id,gen_random_uuid()),upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),
    upper(trim(p_target_type)),p_price,upper(trim(coalesce(p_currency,'USD'))),upper(trim(coalesce(p_billing_interval,'MONTH'))),
    coalesce(p_active,true),coalesce(p_display_order,0))
  on conflict(id) do update set
    code=excluded.code,name=excluded.name,description=excluded.description,target_type=excluded.target_type,
    price=excluded.price,currency=excluded.currency,billing_interval=excluded.billing_interval,
    active=excluded.active,display_order=excluded.display_order,updated_at=now()
  returning id into v_plan_id;

  delete from public.plan_entitlements where plan_id=v_plan_id;
  for v_item in select value from jsonb_array_elements(p_entitlements)
  loop
    v_type := upper(trim(coalesce(v_item->>'type','')));
    v_code := lower(trim(coalesce(v_item->>'code','')));
    v_value := v_item->'value';
    if v_type not in ('CAPABILITY','LIMIT') or v_code = '' or v_value is null then
      raise exception 'Prestación inválida';
    end if;
    if v_type = 'CAPABILITY' and jsonb_typeof(v_value) <> 'boolean' then
      raise exception 'Capability % debe ser booleana', v_code;
    end if;
    if v_type = 'LIMIT' and (jsonb_typeof(v_value) <> 'number' or (v_value#>>'{}')::numeric < 0) then
      raise exception 'Límite % debe ser numérico y no negativo', v_code;
    end if;
    insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
    values(v_plan_id,v_type,v_code,v_value);
  end loop;
  return v_plan_id;
end;
$$;

create or replace function public.master_assign_subscription_plan(
  p_plan_id uuid,
  p_delivery_id uuid default null,
  p_local_id uuid default null,
  p_status text default 'ACTIVE',
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_trial_ends_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_target_type text;
begin
  if not public.monetization_is_master() then raise exception 'Solo MASTER puede asignar planes'; end if;
  if (p_delivery_id is not null)::integer + (p_local_id is not null)::integer <> 1 then
    raise exception 'Seleccione exactamente un DELIVERY o LOCAL';
  end if;
  select target_type into v_target_type from public.subscription_plans where id=p_plan_id and active=true;
  if v_target_type is null then raise exception 'Plan activo no encontrado'; end if;
  if v_target_type='DELIVERY' and p_delivery_id is null then raise exception 'El plan requiere DELIVERY'; end if;
  if v_target_type='LOCAL' and p_local_id is null then raise exception 'El plan requiere LOCAL'; end if;

  update public.plan_assignments
  set status='CANCELLED', ends_at=coalesce(ends_at,coalesce(p_starts_at,now())), updated_at=now()
  where status in ('ACTIVE','TRIAL','PAST_DUE')
    and ((p_delivery_id is not null and delivery_id=p_delivery_id)
      or (p_local_id is not null and local_id=p_local_id));

  insert into public.plan_assignments(plan_id,delivery_id,local_id,status,starts_at,ends_at,trial_ends_at,metadata)
  values(p_plan_id,p_delivery_id,p_local_id,upper(trim(coalesce(p_status,'ACTIVE'))),
    coalesce(p_starts_at,now()),p_ends_at,p_trial_ends_at,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_assignment_id;
  return v_assignment_id;
end;
$$;

revoke all on function public.master_save_subscription_plan(uuid,text,text,text,text,numeric,text,text,boolean,integer,jsonb) from public;
revoke all on function public.master_assign_subscription_plan(uuid,uuid,uuid,text,timestamptz,timestamptz,timestamptz,jsonb) from public;
grant execute on function public.master_save_subscription_plan(uuid,text,text,text,text,numeric,text,text,boolean,integer,jsonb) to authenticated;
grant execute on function public.master_assign_subscription_plan(uuid,uuid,uuid,text,timestamptz,timestamptz,timestamptz,jsonb) to authenticated;

comment on table public.subscription_plans is 'HTPWEB #84: catálogo monetizable de planes por DELIVERY o LOCAL.';
comment on table public.plan_entitlements is 'HTPWEB #84: capabilities y límites declarados por plan; enforcement en #85.';
comment on table public.plan_assignments is 'HTPWEB #84: historial de asignaciones de plan a DELIVERY o LOCAL.';
