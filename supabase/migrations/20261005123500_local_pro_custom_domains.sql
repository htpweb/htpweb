-- HTPWEB LOCAL custom domains.
-- LOCAL Pro includes one managed custom domain. Any claimed LOCAL can request
-- a domain at any time; outside Pro it is treated as a paid add-on.

insert into public.plan_entitlements(plan_id,entitlement_type,code,value,created_at,updated_at)
select p.id,'CAPABILITY','domain.custom.included','true'::jsonb,now(),now()
from public.subscription_plans p
where p.code='LOC_PRO' and p.target_type='LOCAL'
on conflict(plan_id,entitlement_type,code)
do update set value=excluded.value,updated_at=now();

update public.subscription_plans
set description='Tienda completa, marketing, analytics, inventario, múltiples DELIVERY y 1 dominio propio administrado por HTPWEB.',
    updated_at=now()
where code='LOC_PRO' and target_type='LOCAL';

create table if not exists public.local_domain_requests (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  domain text not null,
  request_type text not null default 'BUY_NEW' check(request_type in ('BUY_NEW','CONNECT_EXISTING')),
  purchase_basis text not null check(purchase_basis in ('PLAN_INCLUDED','ADDON')),
  status text not null default 'REQUESTED' check(status in (
    'REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','PURCHASING',
    'DNS_PENDING','ACTIVE','UNAVAILABLE','NEEDS_INFO','CANCELLED'
  )),
  quoted_price numeric(12,2),
  currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
  registrar text,
  expires_at timestamptz,
  dns_verified_at timestamptz,
  ssl_verified_at timestamptz,
  master_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(quoted_price is null or quoted_price>=0),
  check(domain=lower(domain)),
  check(length(domain)<=253)
);

create index if not exists local_domain_requests_local_idx
on public.local_domain_requests(local_id,created_at desc);

create unique index if not exists local_domain_requests_one_open_uq
on public.local_domain_requests(local_id)
where status in ('REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','PURCHASING','DNS_PENDING','NEEDS_INFO');

create unique index if not exists local_domain_requests_active_domain_uq
on public.local_domain_requests(lower(domain))
where status='ACTIVE';

alter table public.local_domain_requests enable row level security;
revoke all on public.local_domain_requests from public,anon,authenticated;
grant all on public.local_domain_requests to service_role;

create or replace function public.normalize_requested_domain(p_domain text)
returns text
language plpgsql immutable
set search_path=''
as $$
declare v text:=lower(trim(coalesce(p_domain,'')));
begin
  v:=regexp_replace(v,'^https?://','','i');
  v:=regexp_replace(v,'^www\.','','i');
  v:=split_part(v,'/',1);
  v:=split_part(v,'?',1);
  v:=split_part(v,'#',1);
  v:=regexp_replace(v,'\.$','','');
  if length(v)<4 or length(v)>253
     or v !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
    raise exception 'HTPWEB: dominio inválido. Ejemplo: minegocio.com';
  end if;
  return v;
end $$;

create or replace function public.plan_entitlements_json(p_plan_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_object_agg(pe.code,pe.value),'{}'::jsonb)
  from public.plan_entitlements pe where pe.plan_id=p_plan_id;
$$;

create or replace function public.my_local_domain_snapshot(p_local_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_plan jsonb;
  v_included boolean:=false;
  v_request jsonb;
  v_slug text;
begin
  if not exists(
    select 1 from public.user_locals ul
    where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
  ) and not public.is_master() then
    raise exception 'HTPWEB: no administras este LOCAL';
  end if;

  select l.slug into v_slug from public.locals l where l.id=p_local_id;
  if v_slug is null then raise exception 'HTPWEB: LOCAL no encontrado'; end if;

  select jsonb_build_object(
    'code',p.code,'name',p.name,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at
  )
  into v_plan
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.local_id=p_local_id and p.target_type='LOCAL'
    and a.status in ('ACTIVE','TRIAL','PAST_DUE')
  order by a.starts_at desc limit 1;

  v_included:=coalesce(public.local_has_effective_capability(p_local_id,'domain.custom.included'),false);

  select to_jsonb(x) into v_request
  from (
    select r.id,r.domain,r.request_type,r.purchase_basis,r.status,r.quoted_price,r.currency,
           r.registrar,r.expires_at,r.dns_verified_at,r.ssl_verified_at,r.master_note,
           r.created_at,r.updated_at
    from public.local_domain_requests r
    where r.local_id=p_local_id
    order by
      case when r.status='ACTIVE' then 0
           when r.status in ('REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','PURCHASING','DNS_PENDING','NEEDS_INFO') then 1
           else 2 end,
      r.created_at desc
    limit 1
  ) x;

  return jsonb_build_object(
    'local_id',p_local_id,
    'public_path','https://htpweb.github.io/'||v_slug||'/',
    'plan',v_plan,
    'included_in_plan',v_included,
    'purchase_basis',case when v_included then 'PLAN_INCLUDED' else 'ADDON' end,
    'request',v_request
  );
end $$;

create or replace function public.request_my_local_domain(
  p_local_id uuid,p_domain text,p_request_type text default 'BUY_NEW'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_domain text:=public.normalize_requested_domain(p_domain);
  v_type text:=upper(trim(coalesce(p_request_type,'BUY_NEW')));
  v_basis text;
  v_id uuid;
begin
  if not exists(
    select 1 from public.user_locals ul
    where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
  ) then raise exception 'HTPWEB: no administras este LOCAL'; end if;

  if v_type not in ('BUY_NEW','CONNECT_EXISTING') then
    raise exception 'HTPWEB: tipo de solicitud inválido';
  end if;

  if exists(
    select 1 from public.local_domain_requests r
    where lower(r.domain)=v_domain and r.status='ACTIVE' and r.local_id<>p_local_id
  ) then raise exception 'HTPWEB: ese dominio ya está conectado a otro LOCAL'; end if;

  if exists(
    select 1 from public.local_domain_requests r
    where r.local_id=p_local_id
      and r.status in ('REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','PURCHASING','DNS_PENDING','NEEDS_INFO')
  ) then raise exception 'HTPWEB: ya tienes una solicitud de dominio en proceso'; end if;

  v_basis:=case when coalesce(public.local_has_effective_capability(p_local_id,'domain.custom.included'),false)
                then 'PLAN_INCLUDED' else 'ADDON' end;

  insert into public.local_domain_requests(local_id,requested_by,domain,request_type,purchase_basis,status)
  values(p_local_id,auth.uid(),v_domain,v_type,v_basis,'REQUESTED')
  returning id into v_id;

  return public.my_local_domain_snapshot(p_local_id)
    || jsonb_build_object('request_id',v_id);
end $$;

create or replace function public.cancel_my_local_domain_request(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_local uuid;
begin
  select r.local_id into v_local
  from public.local_domain_requests r
  join public.user_locals ul on ul.local_id=r.local_id and ul.user_id=auth.uid() and ul.active
  where r.id=p_request_id
    and r.status in ('REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','NEEDS_INFO');
  if v_local is null then raise exception 'HTPWEB: solicitud no cancelable'; end if;

  update public.local_domain_requests
  set status='CANCELLED',updated_at=now()
  where id=p_request_id;

  return public.my_local_domain_snapshot(v_local);
end $$;

create or replace function public.master_list_local_domain_requests()
returns table(
  id uuid,local_id uuid,local_name text,local_slug text,requested_by uuid,
  requester_email text,domain text,request_type text,purchase_basis text,status text,
  quoted_price numeric,currency text,registrar text,expires_at timestamptz,
  dns_verified_at timestamptz,ssl_verified_at timestamptz,master_note text,
  created_at timestamptz,updated_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select r.id,r.local_id,l.name,l.slug,r.requested_by,u.email::text,r.domain,r.request_type,
         r.purchase_basis,r.status,r.quoted_price,r.currency,r.registrar,r.expires_at,
         r.dns_verified_at,r.ssl_verified_at,r.master_note,r.created_at,r.updated_at
  from public.local_domain_requests r
  join public.locals l on l.id=r.local_id
  left join auth.users u on u.id=r.requested_by
  where public.is_master()
  order by
    case r.status when 'REQUESTED' then 0 when 'CHECKING' then 1 when 'AVAILABLE' then 2
         when 'PAYMENT_PENDING' then 3 when 'PURCHASING' then 4 when 'DNS_PENDING' then 5
         when 'NEEDS_INFO' then 6 when 'ACTIVE' then 7 else 8 end,
    r.created_at desc;
$$;

create or replace function public.master_update_local_domain_request(
  p_request_id uuid,p_status text,p_quoted_price numeric default null,
  p_registrar text default null,p_expires_at timestamptz default null,
  p_dns_verified boolean default false,p_ssl_verified boolean default false,
  p_master_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_status text:=upper(trim(coalesce(p_status,'')));
  v_local uuid;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if v_status not in ('REQUESTED','CHECKING','AVAILABLE','PAYMENT_PENDING','PURCHASING','DNS_PENDING','ACTIVE','UNAVAILABLE','NEEDS_INFO','CANCELLED')
    then raise exception 'HTPWEB: estado de dominio inválido'; end if;
  if p_quoted_price is not null and p_quoted_price<0 then raise exception 'HTPWEB: precio inválido'; end if;

  update public.local_domain_requests r
  set status=v_status,
      quoted_price=coalesce(p_quoted_price,r.quoted_price),
      registrar=coalesce(nullif(trim(coalesce(p_registrar,'')),''),r.registrar),
      expires_at=coalesce(p_expires_at,r.expires_at),
      dns_verified_at=case when p_dns_verified then coalesce(r.dns_verified_at,now()) else r.dns_verified_at end,
      ssl_verified_at=case when p_ssl_verified then coalesce(r.ssl_verified_at,now()) else r.ssl_verified_at end,
      master_note=nullif(trim(coalesce(p_master_note,'')),''),
      updated_at=now()
  where r.id=p_request_id
  returning r.local_id into v_local;

  if v_local is null then raise exception 'HTPWEB: solicitud no encontrada'; end if;
  return (select to_jsonb(x) from (
    select r.* from public.local_domain_requests r where r.id=p_request_id
  ) x);
end $$;

create or replace function public.my_plans_and_subscriptions()
returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'deliveries',coalesce((
     select jsonb_agg(jsonb_build_object(
       'delivery_id',d.id,'delivery_name',d.name,'delivery_slug',d.slug,
       'assignment_id',pa.id,'status',pa.status,'starts_at',pa.starts_at,'ends_at',pa.ends_at,'trial_ends_at',pa.trial_ends_at,
       'plan_id',sp.id,'plan_code',sp.code,'plan_name',sp.name,'price',sp.price,'currency',sp.currency,
       'entitlements',public.plan_entitlements_json(sp.id),
       'zones_max',coalesce((select (pe.value #>> '{}')::int from public.plan_entitlements pe where pe.plan_id=sp.id and pe.code='zones.active.max' limit 1),0),
       'zones_active',(select count(*) from public.delivery_zones dz where dz.delivery_id=d.id and dz.active)
     ) order by lower(d.name))
     from public.user_deliveries ud
     join public.deliveries d on d.id=ud.delivery_id and ud.active
     left join lateral (
       select * from public.plan_assignments x where x.delivery_id=d.id and x.status in ('ACTIVE','TRIAL','PAST_DUE')
       order by x.starts_at desc limit 1
     ) pa on true
     left join public.subscription_plans sp on sp.id=pa.plan_id
     where ud.user_id=auth.uid()
   ),'[]'::jsonb),
   'available_delivery_plans',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',sp.id,'code',sp.code,'name',sp.name,'description',sp.description,'price',sp.price,'currency',sp.currency,
       'entitlements',public.plan_entitlements_json(sp.id),
       'zones_max',coalesce((select (pe.value #>> '{}')::int from public.plan_entitlements pe where pe.plan_id=sp.id and pe.code='zones.active.max' limit 1),0)
     ) order by sp.display_order,sp.name)
     from public.subscription_plans sp where sp.target_type='DELIVERY' and sp.active and sp.code<>'DELIVERY_TRIAL'
   ),'[]'::jsonb),
   'locals',coalesce((
     select jsonb_agg(jsonb_build_object(
       'local_id',l.id,'local_name',l.name,'local_slug',l.slug,
       'assignment_id',pa.id,'status',pa.status,'starts_at',pa.starts_at,'ends_at',pa.ends_at,'trial_ends_at',pa.trial_ends_at,
       'plan_id',sp.id,'plan_code',sp.code,'plan_name',sp.name,'price',sp.price,'currency',sp.currency,
       'entitlements',public.plan_entitlements_json(sp.id),
       'domain',public.my_local_domain_snapshot(l.id)
     ) order by lower(l.name))
     from public.user_locals ul
     join public.locals l on l.id=ul.local_id and ul.active
     left join lateral (
       select * from public.plan_assignments x where x.local_id=l.id and x.status in ('ACTIVE','TRIAL','PAST_DUE')
       order by x.starts_at desc limit 1
     ) pa on true
     left join public.subscription_plans sp on sp.id=pa.plan_id
     where ul.user_id=auth.uid()
   ),'[]'::jsonb),
   'available_local_plans',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',sp.id,'code',sp.code,'name',sp.name,'description',sp.description,'price',sp.price,'currency',sp.currency,
       'billing_interval',sp.billing_interval,'duration_months',sp.duration_months,
       'entitlements',public.plan_entitlements_json(sp.id)
     ) order by sp.display_order,sp.name)
     from public.subscription_plans sp where sp.target_type='LOCAL' and sp.active
   ),'[]'::jsonb)
 );
$$;

revoke all on function public.normalize_requested_domain(text) from public;
revoke all on function public.plan_entitlements_json(uuid) from public;
revoke all on function public.my_local_domain_snapshot(uuid) from public,anon;
revoke all on function public.request_my_local_domain(uuid,text,text) from public,anon;
revoke all on function public.cancel_my_local_domain_request(uuid) from public,anon;
revoke all on function public.master_list_local_domain_requests() from public,anon;
revoke all on function public.master_update_local_domain_request(uuid,text,numeric,text,timestamptz,boolean,boolean,text) from public,anon;
revoke all on function public.my_plans_and_subscriptions() from public,anon;

grant execute on function public.plan_entitlements_json(uuid) to authenticated;
grant execute on function public.my_local_domain_snapshot(uuid) to authenticated;
grant execute on function public.request_my_local_domain(uuid,text,text) to authenticated;
grant execute on function public.cancel_my_local_domain_request(uuid) to authenticated;
grant execute on function public.master_list_local_domain_requests() to authenticated;
grant execute on function public.master_update_local_domain_request(uuid,text,numeric,text,timestamptz,boolean,boolean,text) to authenticated;
grant execute on function public.my_plans_and_subscriptions() to authenticated;
