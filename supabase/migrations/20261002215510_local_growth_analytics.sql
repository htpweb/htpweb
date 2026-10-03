-- HTPWEB Local growth tools: storefront attribution, analytics and partnership review snapshots.

create or replace function public.record_local_storefront_event(
  p_event_type text,
  p_local_id uuid,
  p_product_id uuid default null,
  p_session_id text default null,
  p_source text default 'direct',
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
declare v_event text:=upper(trim(coalesce(p_event_type,''))); v_source text:=lower(trim(coalesce(p_source,'direct')));
begin
  if v_event not in ('LOCAL_VIEW','PRODUCT_VIEW','CART_VIEW','CHECKOUT_VIEW','WHATSAPP_ORDER','PROMOTION_VIEW') then
    raise exception 'HTPWEB: evento LOCAL no permitido';
  end if;
  if not exists(
    select 1 from public.locals l
    join public.local_commerce_settings s on s.local_id=l.id and s.storefront_enabled=true
    where l.id=p_local_id and l.active=true and public.local_is_owner_managed(l.id)
  ) then raise exception 'HTPWEB: tienda LOCAL no disponible'; end if;
  if p_product_id is not null and not exists(
    select 1 from public.products p where p.id=p_product_id and p.local_id=p_local_id and p.active=true
  ) then raise exception 'HTPWEB: producto fuera del LOCAL'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>4096 then
    raise exception 'HTPWEB: metadata inválida';
  end if;
  if v_source not in ('direct','instagram','facebook','tiktok','whatsapp','qr','other') then v_source:='other'; end if;
  insert into public.analytics_events(event_type,local_id,product_id,session_id,source,metadata,occurred_at)
  values(v_event,p_local_id,p_product_id,left(nullif(trim(coalesce(p_session_id,'')),''),100),v_source,p_metadata,now());
end $$;

revoke all on function public.record_local_storefront_event(text,uuid,uuid,text,text,jsonb) from public;
grant execute on function public.record_local_storefront_event(text,uuid,uuid,text,text,jsonb) to anon,authenticated;

create or replace function public.analytics_local_growth_summary(
  p_local_id uuid,p_from timestamptz default null,p_to timestamptz default null
) returns jsonb
language sql stable security definer set search_path=''
as $$
  with allowed as (
    select public.is_master() or exists(
      select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
    ) ok
  ), e as (
    select *
    from public.analytics_events
    where local_id=p_local_id
      and occurred_at>=coalesce(p_from,now()-interval '30 days')
      and occurred_at<coalesce(p_to,now()+interval '1 second')
  )
  select case when (select ok from allowed) then jsonb_build_object(
    'from',coalesce(p_from,now()-interval '30 days'),
    'to',coalesce(p_to,now()),
    'local_views',(select count(*) from e where event_type='LOCAL_VIEW'),
    'product_views',(select count(*) from e where event_type='PRODUCT_VIEW'),
    'cart_views',(select count(*) from e where event_type='CART_VIEW'),
    'checkout_views',(select count(*) from e where event_type='CHECKOUT_VIEW'),
    'whatsapp_orders',(select count(*) from e where event_type='WHATSAPP_ORDER'),
    'promotion_views',(select count(*) from e where event_type='PROMOTION_VIEW'),
    'sources',coalesce((select jsonb_object_agg(source,cnt) from (
      select coalesce(nullif(source,''),'direct') source,count(*) cnt from e
      where event_type in ('LOCAL_VIEW','PRODUCT_VIEW','CART_VIEW','CHECKOUT_VIEW','WHATSAPP_ORDER')
      group by coalesce(nullif(source,''),'direct')
    ) s),'{}'::jsonb),
    'top_products',coalesce((select jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'views',x.views) order by x.views desc,p.name)
      from (select product_id,count(*) views from e where event_type='PRODUCT_VIEW' and product_id is not null group by product_id order by count(*) desc limit 10) x
      join public.products p on p.id=x.product_id),'[]'::jsonb)
  ) else null end;
$$;

revoke all on function public.analytics_local_growth_summary(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.analytics_local_growth_summary(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.local_partnership_requests_snapshot(p_local_id uuid default null,p_delivery_id uuid default null)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'local_id',r.local_id,'local_name',l.name,'delivery_id',r.delivery_id,'delivery_name',d.name,
    'status',r.status,'note',r.note,'created_at',r.created_at,'reviewed_at',r.reviewed_at
  ) order by r.created_at desc),'[]'::jsonb)
  from public.local_delivery_partnership_requests r
  join public.locals l on l.id=r.local_id
  join public.deliveries d on d.id=r.delivery_id
  where (p_local_id is null or r.local_id=p_local_id)
    and (p_delivery_id is null or r.delivery_id=p_delivery_id)
    and (
      public.is_master()
      or exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=r.local_id and ul.active)
      or public.user_has_delivery(r.delivery_id)
    );
$$;

revoke all on function public.local_partnership_requests_snapshot(uuid,uuid) from public,anon;
grant execute on function public.local_partnership_requests_snapshot(uuid,uuid) to authenticated;
