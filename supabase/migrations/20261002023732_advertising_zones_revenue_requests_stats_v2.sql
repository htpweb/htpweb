-- Advertising v2: zone targeting, MASTER control, 60/10/30 revenue split,
-- DELIVERY requests/statistics and permanent HTPWEB institutional inventory.

alter table public.advertisements
  add column if not exists campaign_price numeric(12,2) not null default 0,
  add column if not exists origin_delivery_id uuid references public.deliveries(id) on delete set null,
  add column if not exists is_internal boolean not null default false,
  add column if not exists split_htpweb_pct numeric(5,2) not null default 60,
  add column if not exists split_origin_pct numeric(5,2) not null default 10,
  add column if not exists split_traffic_pct numeric(5,2) not null default 30;

alter table public.advertisements drop constraint if exists advertisements_split_total_check;
alter table public.advertisements add constraint advertisements_split_total_check
check (
  split_htpweb_pct>=0 and split_origin_pct>=0 and split_traffic_pct>=0
  and round(split_htpweb_pct+split_origin_pct+split_traffic_pct,2)=100.00
);

create table if not exists public.advertising_settings(
  singleton_id smallint primary key default 1 check(singleton_id=1),
  htpweb_pct numeric(5,2) not null default 60,
  origin_delivery_pct numeric(5,2) not null default 10,
  traffic_pct numeric(5,2) not null default 30,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.advertising_settings(singleton_id,htpweb_pct,origin_delivery_pct,traffic_pct)
values(1,60,10,30) on conflict(singleton_id) do nothing;

create table if not exists public.advertisement_zones(
  advertisement_id uuid not null references public.advertisements(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(advertisement_id,zone_id)
);
create index if not exists advertisement_zones_zone_idx
on public.advertisement_zones(zone_id,advertisement_id);

create table if not exists public.advertising_requests(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  local_id uuid references public.locals(id) on delete set null,
  title text not null,
  advertiser_contact text,
  body text,
  requested_days integer not null default 15 check(requested_days between 1 and 365),
  proposed_budget numeric(12,2),
  status text not null default 'PENDING'
    check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  master_note text,
  created_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.advertising_settings enable row level security;
alter table public.advertisement_zones enable row level security;
alter table public.advertising_requests enable row level security;

drop policy if exists advertising_settings_master_select on public.advertising_settings;
create policy advertising_settings_master_select on public.advertising_settings
for select to authenticated using(public.is_master());

drop policy if exists advertisement_zones_master_all on public.advertisement_zones;
create policy advertisement_zones_master_all on public.advertisement_zones
for all to authenticated using(public.is_master()) with check(public.is_master());

drop policy if exists advertising_requests_master_all on public.advertising_requests;
create policy advertising_requests_master_all on public.advertising_requests
for all to authenticated using(public.is_master()) with check(public.is_master());

drop policy if exists advertising_requests_delivery_select on public.advertising_requests;
create policy advertising_requests_delivery_select on public.advertising_requests
for select to authenticated using(
  public.current_role_code()='DELIVERY_ADMIN' and public.user_has_delivery(delivery_id)
);

create or replace function public.user_can_manage_advertising_scope(
  p_scope_type text,p_delivery_id uuid,p_local_id uuid,p_product_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_master();
$$;

create or replace function public.validate_advertisement_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.scope_type:=upper(trim(new.scope_type));
  if nullif(trim(new.title),'') is null then
    raise exception 'HTPWEB: título de publicidad obligatorio';
  end if;
  new.title:=trim(new.title);

  if new.scope_type='HTPWEB' then
    if new.delivery_id is not null or new.local_id is not null or new.product_id is not null then
      raise exception 'HTPWEB: publicidad HTPWEB no recibe delivery/local/product';
    end if;
  elsif new.scope_type='DELIVERY' then
    if new.local_id is not null or new.product_id is not null then
      raise exception 'HTPWEB: publicidad DELIVERY no recibe local/product';
    end if;
  elsif new.scope_type='LOCAL' then
    if new.local_id is null or new.product_id is not null then
      raise exception 'HTPWEB: publicidad LOCAL requiere local_id';
    end if;
    if not exists(select 1 from public.locals l where l.id=new.local_id) then
      raise exception 'HTPWEB: LOCAL inexistente';
    end if;
  elsif new.scope_type='PRODUCT' then
    if new.local_id is null or new.product_id is null then
      raise exception 'HTPWEB: publicidad PRODUCT requiere local_id + product_id';
    end if;
    if not exists(select 1 from public.products p where p.id=new.product_id and p.local_id=new.local_id) then
      raise exception 'HTPWEB: PRODUCT no pertenece al LOCAL indicado';
    end if;
  else
    raise exception 'HTPWEB: scope de publicidad inválido';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.advertisement_visible_to_delivery(
  p_advertisement_id uuid,p_delivery_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.advertisements a
    join public.deliveries d on d.id=p_delivery_id and d.active=true
    where a.id=p_advertisement_id and a.active=true
      and (a.starts_at is null or a.starts_at<=now())
      and (a.ends_at is null or a.ends_at>now())
      and (
        a.is_internal=true
        or (
          (
            exists(
              select 1 from public.advertisement_zones az
              join public.delivery_zones dz on dz.zone_id=az.zone_id
                and dz.delivery_id=p_delivery_id and dz.active=true
              join public.zones z on z.id=az.zone_id and z.active=true
              where az.advertisement_id=a.id
            )
            or (a.delivery_id is not null and a.delivery_id=p_delivery_id)
          )
          and (
            a.local_id is null or exists(
              select 1 from public.local_deliveries ld
              join public.locals l on l.id=ld.local_id and l.active=true
              where ld.delivery_id=p_delivery_id and ld.local_id=a.local_id and ld.active=true
            )
          )
        )
      )
  );
$$;

create or replace function public.public_delivery_advertisements(p_delivery_id uuid)
returns table(
  id uuid,scope_type text,delivery_id uuid,local_id uuid,product_id uuid,
  title text,body text,image_url text,target_url text,priority integer,
  active boolean,starts_at timestamptz,ends_at timestamptz,is_internal boolean
) language sql stable security definer set search_path='' as $$
  select a.id,a.scope_type,a.delivery_id,a.local_id,a.product_id,a.title,a.body,
         a.image_url,a.target_url,a.priority,a.active,a.starts_at,a.ends_at,a.is_internal
  from public.advertisements a
  where public.advertisement_visible_to_delivery(a.id,p_delivery_id)
  order by a.is_internal asc,a.priority desc,a.updated_at desc;
$$;
grant execute on function public.public_delivery_advertisements(uuid) to anon,authenticated;

create or replace function public.save_advertising_split(
  p_htpweb_pct numeric,p_origin_delivery_pct numeric,p_traffic_pct numeric
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if p_htpweb_pct<0 or p_origin_delivery_pct<0 or p_traffic_pct<0
     or round(p_htpweb_pct+p_origin_delivery_pct+p_traffic_pct,2)<>100.00 then
    raise exception 'HTPWEB: los porcentajes deben sumar 100%%';
  end if;
  update public.advertising_settings
  set htpweb_pct=p_htpweb_pct,origin_delivery_pct=p_origin_delivery_pct,
      traffic_pct=p_traffic_pct,updated_at=now(),updated_by=auth.uid()
  where singleton_id=1;
end;
$$;
grant execute on function public.save_advertising_split(numeric,numeric,numeric) to authenticated;

create or replace function public.save_advertisement_commercial(
  p_advertisement_id uuid,p_zone_ids uuid[],p_campaign_price numeric,
  p_origin_delivery_id uuid,p_is_internal boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_settings public.advertising_settings%rowtype;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if not exists(select 1 from public.advertisements a where a.id=p_advertisement_id) then
    raise exception 'HTPWEB: publicidad inexistente';
  end if;
  if coalesce(p_campaign_price,0)<0 then raise exception 'HTPWEB: precio inválido'; end if;
  select * into v_settings from public.advertising_settings where singleton_id=1;

  update public.advertisements
  set delivery_id=null,
      campaign_price=case when coalesce(p_is_internal,false) then 0 else coalesce(p_campaign_price,0) end,
      origin_delivery_id=case when coalesce(p_is_internal,false) then null else p_origin_delivery_id end,
      is_internal=coalesce(p_is_internal,false),
      split_htpweb_pct=case when coalesce(p_is_internal,false) then 100 else v_settings.htpweb_pct end,
      split_origin_pct=case when coalesce(p_is_internal,false) then 0 else v_settings.origin_delivery_pct end,
      split_traffic_pct=case when coalesce(p_is_internal,false) then 0 else v_settings.traffic_pct end,
      updated_at=now()
  where id=p_advertisement_id;

  delete from public.advertisement_zones where advertisement_id=p_advertisement_id;
  if not coalesce(p_is_internal,false) then
    if p_zone_ids is null or cardinality(p_zone_ids)=0 then
      raise exception 'HTPWEB: selecciona al menos una zona';
    end if;
    insert into public.advertisement_zones(advertisement_id,zone_id)
    select p_advertisement_id,z.id from public.zones z
    where z.id=any(p_zone_ids) and z.active=true on conflict do nothing;
  end if;
end;
$$;
grant execute on function public.save_advertisement_commercial(uuid,uuid[],numeric,uuid,boolean) to authenticated;

create or replace function public.submit_advertising_request(
  p_delivery_id uuid,p_local_id uuid,p_title text,p_advertiser_contact text,
  p_body text,p_requested_days integer,p_proposed_budget numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null or public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id) then
    raise exception 'HTPWEB: no autorizado';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'HTPWEB: título obligatorio'; end if;
  if p_local_id is not null and not exists(
    select 1 from public.local_deliveries ld
    where ld.delivery_id=p_delivery_id and ld.local_id=p_local_id and ld.active=true
  ) then raise exception 'HTPWEB: LOCAL fuera del DELIVERY'; end if;

  insert into public.advertising_requests(
    delivery_id,local_id,title,advertiser_contact,body,requested_days,proposed_budget,
    status,created_by,created_at,updated_at
  ) values(
    p_delivery_id,p_local_id,trim(p_title),nullif(trim(coalesce(p_advertiser_contact,'')),''),
    nullif(trim(coalesce(p_body,'')),''),
    greatest(1,least(365,coalesce(p_requested_days,15))),
    case when p_proposed_budget is null then null else greatest(0,p_proposed_budget) end,
    'PENDING',auth.uid(),now(),now()
  ) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_advertising_request(uuid,uuid,text,text,text,integer,numeric) to authenticated;

create or replace function public.advertising_delivery_requests(p_delivery_id uuid)
returns table(
  id uuid,title text,local_id uuid,advertiser_contact text,body text,
  requested_days integer,proposed_budget numeric,status text,master_note text,created_at timestamptz
) language sql stable security definer set search_path='' as $$
  select r.id,r.title,r.local_id,r.advertiser_contact,r.body,r.requested_days,
         r.proposed_budget,r.status,r.master_note,r.created_at
  from public.advertising_requests r
  where r.delivery_id=p_delivery_id
    and (public.is_master() or (
      public.current_role_code()='DELIVERY_ADMIN' and public.user_has_delivery(p_delivery_id)
    ))
  order by r.created_at desc;
$$;
grant execute on function public.advertising_delivery_requests(uuid) to authenticated;

create or replace function public.advertising_delivery_stats(p_delivery_id uuid)
returns table(
  advertisement_id uuid,title text,campaign_price numeric,origin_delivery_id uuid,
  total_impressions bigint,delivery_impressions bigint,total_clicks bigint,delivery_clicks bigint,
  traffic_share_pct numeric,origin_commission numeric,traffic_commission numeric,estimated_total numeric
) language sql stable security definer set search_path='' as $$
  with allowed as(
    select a.* from public.advertisements a
    where a.is_internal=false and (
      public.is_master() or (
        public.current_role_code()='DELIVERY_ADMIN'
        and public.user_has_delivery(p_delivery_id)
        and public.advertisement_visible_to_delivery(a.id,p_delivery_id)
      )
    )
  ), stats as(
    select a.id,
      count(*) filter(where e.event_type='AD_IMPRESSION') total_impressions,
      count(*) filter(where e.event_type='AD_IMPRESSION' and e.delivery_id=p_delivery_id) delivery_impressions,
      count(*) filter(where e.event_type='AD_CLICK') total_clicks,
      count(*) filter(where e.event_type='AD_CLICK' and e.delivery_id=p_delivery_id) delivery_clicks
    from allowed a left join public.analytics_events e on e.advertisement_id=a.id group by a.id
  )
  select a.id,a.title,a.campaign_price,a.origin_delivery_id,
    s.total_impressions,s.delivery_impressions,s.total_clicks,s.delivery_clicks,
    case when s.total_impressions>0 then round(s.delivery_impressions::numeric/s.total_impressions*100,2) else 0 end,
    case when a.origin_delivery_id=p_delivery_id then round(a.campaign_price*a.split_origin_pct/100,2) else 0 end,
    case when s.total_impressions>0 then round(
      a.campaign_price*a.split_traffic_pct/100*s.delivery_impressions::numeric/s.total_impressions,2
    ) else 0 end,
    round(
      case when a.origin_delivery_id=p_delivery_id then a.campaign_price*a.split_origin_pct/100 else 0 end
      + case when s.total_impressions>0 then
          a.campaign_price*a.split_traffic_pct/100*s.delivery_impressions::numeric/s.total_impressions
        else 0 end,2
    )
  from allowed a join stats s on s.id=a.id
  order by a.active desc,a.updated_at desc;
$$;
grant execute on function public.advertising_delivery_stats(uuid) to authenticated;

-- Seed permanent institutional inventory.
insert into public.advertisements(
  scope_type,title,body,image_url,target_url,priority,active,starts_at,ends_at,
  campaign_price,origin_delivery_id,is_internal,split_htpweb_pct,split_origin_pct,split_traffic_pct
)
select 'HTPWEB','HTPWEB','Optimiza tu operación de delivery desde una sola plataforma.',
  'https://htpweb.github.io/htpweb/assets/brand/htpweb-logo-facebook-clean.jpg',
  'https://htpweb.github.io/htpweb/',10,true,now(),null,0,null,true,100,0,0
where not exists(select 1 from public.advertisements where is_internal=true and active=true);
