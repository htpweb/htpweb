-- HTPWEB Local commerce operations: public DELIVERY choices, plan assignment, inventory and social tools.

create or replace function public.public_local_delivery_choices(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_id',d.id,'name',d.name,'logo_url',d.logo_url,'whatsapp',d.whatsapp,
    'is_primary',coalesce(s.primary_delivery_id=d.id,false)
  ) order by coalesce(s.primary_delivery_id=d.id,false) desc,lower(d.name)),'[]'::jsonb)
  from public.local_deliveries ld
  join public.deliveries d on d.id=ld.delivery_id and d.active=true
  join public.locals l on l.id=ld.local_id and l.active=true
  left join public.local_commerce_settings s on s.local_id=l.id
  where ld.local_id=p_local_id and ld.active=true
    and coalesce(s.htpweb_delivery_enabled,true)
    and public.htp_delivery_covers_local(d.id,l.id);
$$;
revoke all on function public.public_local_delivery_choices(uuid) from public;
grant execute on function public.public_local_delivery_choices(uuid) to anon,authenticated;

create or replace function public.master_list_local_plans()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when public.is_master() then coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'code',p.code,'name',p.name,'description',p.description,'price',p.price,'currency',p.currency,
    'duration_months',p.duration_months,'active',p.active,'display_order',p.display_order,'plan_version',p.plan_version,
    'entitlements',coalesce((select jsonb_agg(jsonb_build_object('type',e.entitlement_type,'code',e.code,'value',e.value) order by e.entitlement_type,e.code)
      from public.plan_entitlements e where e.plan_id=p.id),'[]'::jsonb)
  ) order by p.display_order,p.code),'[]'::jsonb) else '[]'::jsonb end
  from public.subscription_plans p where p.target_type='LOCAL';
$$;

create or replace function public.master_assign_local_plan(p_local_id uuid,p_plan_id uuid,p_starts_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare p public.subscription_plans%rowtype; v_start timestamptz:=coalesce(p_starts_at,now()); v_end timestamptz; v_id uuid;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if not exists(select 1 from public.locals l where l.id=p_local_id) then raise exception 'HTPWEB: LOCAL inexistente'; end if;
  if not public.local_is_claimed(p_local_id) then raise exception 'HTPWEB: primero debe existir un propietario/administrador activo del LOCAL'; end if;
  select * into p from public.subscription_plans where id=p_plan_id and target_type='LOCAL' and active=true;
  if not found then raise exception 'HTPWEB: plan LOCAL activo no encontrado'; end if;
  v_end:=v_start+make_interval(months=>p.duration_months);
  update public.plan_assignments
  set status='CANCELLED',ends_at=least(coalesce(ends_at,v_start),v_start),updated_at=now()
  where local_id=p_local_id and status in ('ACTIVE','TRIAL','PAST_DUE');
  insert into public.plan_assignments(
    plan_id,local_id,status,starts_at,ends_at,assigned_by,metadata,
    plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,plan_version_snapshot,change_type
  ) values(
    p.id,p_local_id,'ACTIVE',v_start,v_end,auth.uid(),jsonb_build_object('source','MASTER_LOCAL_MODULE'),
    p.name,p.price,p.currency,p.duration_months,p.plan_version,'ASSIGN'
  ) returning id into v_id;
  return jsonb_build_object('assignment_id',v_id,'local_id',p_local_id,'plan_id',p.id,'plan_name',p.name,'starts_at',v_start,'ends_at',v_end);
end $$;

create or replace function public.master_list_local_subscriptions()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when public.is_master() then coalesce(jsonb_agg(jsonb_build_object(
    'local_id',l.id,'local_name',l.name,'claimed',public.local_is_claimed(l.id),'owner_managed',public.local_is_owner_managed(l.id),
    'plan',(select jsonb_build_object('assignment_id',a.id,'plan_id',p.id,'code',p.code,'name',coalesce(a.plan_name_snapshot,p.name),
      'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'price',coalesce(a.price_snapshot,p.price),'currency',coalesce(a.currency_snapshot,p.currency))
      from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
      where a.local_id=l.id and p.target_type='LOCAL' and a.status in ('ACTIVE','TRIAL','PAST_DUE')
      order by a.starts_at desc limit 1)
  ) order by lower(l.name)),'[]'::jsonb) else '[]'::jsonb end
  from public.locals l
  where public.local_is_claimed(l.id) or exists(select 1 from public.plan_assignments a where a.local_id=l.id);
$$;

revoke all on function public.master_list_local_plans() from public,anon;
revoke all on function public.master_assign_local_plan(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.master_list_local_subscriptions() from public,anon;
grant execute on function public.master_list_local_plans() to authenticated;
grant execute on function public.master_assign_local_plan(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.master_list_local_subscriptions() to authenticated;

create or replace function public.my_local_inventory_snapshot(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active)
  then coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'product_id',i.product_id,'variant_id',i.variant_id,'track_stock',i.track_stock,
    'available_qty',i.available_qty,'low_stock_threshold',i.low_stock_threshold
  ) order by i.created_at),'[]'::jsonb) else '[]'::jsonb end
  from public.local_inventory_items i where i.local_id=p_local_id;
$$;

create or replace function public.save_my_local_inventory(
  p_local_id uuid,p_product_id uuid,p_variant_id uuid,p_track_stock boolean,p_available_qty integer,p_low_stock_threshold integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
    raise exception 'HTPWEB: no administras este LOCAL';
  end if;
  if not public.local_has_effective_capability(p_local_id,'inventory.manage') then raise exception 'HTPWEB: tu plan no incluye inventario'; end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.local_id=p_local_id) then raise exception 'HTPWEB: producto inválido'; end if;
  if p_variant_id is not null and not exists(select 1 from public.product_variants v where v.id=p_variant_id and v.product_id=p_product_id) then raise exception 'HTPWEB: variante inválida'; end if;
  if p_available_qty is not null and p_available_qty<0 then raise exception 'HTPWEB: stock inválido'; end if;
  if coalesce(p_low_stock_threshold,0)<0 then raise exception 'HTPWEB: umbral inválido'; end if;
  insert into public.local_inventory_items(local_id,product_id,variant_id,track_stock,available_qty,low_stock_threshold,updated_by)
  values(p_local_id,p_product_id,p_variant_id,coalesce(p_track_stock,false),p_available_qty,coalesce(p_low_stock_threshold,0),auth.uid())
  on conflict(local_id,product_id,variant_id) do update set
    track_stock=excluded.track_stock,available_qty=excluded.available_qty,low_stock_threshold=excluded.low_stock_threshold,
    updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.public_local_inventory(p_local_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,'variant_id',i.variant_id,'track_stock',i.track_stock,
    'available_qty',case when i.track_stock then i.available_qty else null end,
    'low_stock',case when i.track_stock and i.available_qty is not null then i.available_qty<=i.low_stock_threshold else false end
  )),'[]'::jsonb)
  from public.local_inventory_items i
  where i.local_id=p_local_id;
$$;

revoke all on function public.my_local_inventory_snapshot(uuid) from public,anon;
revoke all on function public.save_my_local_inventory(uuid,uuid,uuid,boolean,integer,integer) from public,anon;
revoke all on function public.public_local_inventory(uuid) from public;
grant execute on function public.my_local_inventory_snapshot(uuid) to authenticated;
grant execute on function public.save_my_local_inventory(uuid,uuid,uuid,boolean,integer,integer) to authenticated;
grant execute on function public.public_local_inventory(uuid) to anon,authenticated;

create or replace function public.save_my_local_social_content(
 p_local_id uuid,p_content_id uuid,p_platform text,p_external_url text,p_product_id uuid,p_promotion_id uuid,p_campaign_code text,p_title text,p_active boolean
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_content_id,gen_random_uuid()); v_platform text:=upper(trim(coalesce(p_platform,'')));
begin
  if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then raise exception 'HTPWEB: no administras este LOCAL'; end if;
  if not public.local_has_effective_capability(p_local_id,'marketing.manage') then raise exception 'HTPWEB: tu plan no incluye Marketing'; end if;
  if v_platform not in ('INSTAGRAM','FACEBOOK','TIKTOK','WHATSAPP','OTHER') then raise exception 'HTPWEB: red inválida'; end if;
  if p_product_id is not null and not exists(select 1 from public.products p where p.id=p_product_id and p.local_id=p_local_id) then raise exception 'HTPWEB: producto inválido'; end if;
  if p_promotion_id is not null and not exists(select 1 from public.local_promotions p where p.id=p_promotion_id and p.local_id=p_local_id) then raise exception 'HTPWEB: promoción inválida'; end if;
  insert into public.local_social_content(id,local_id,platform,external_url,product_id,promotion_id,campaign_code,title,active,created_by)
  values(v_id,p_local_id,v_platform,nullif(trim(coalesce(p_external_url,'')),''),p_product_id,p_promotion_id,nullif(trim(coalesce(p_campaign_code,'')),''),
    nullif(trim(coalesce(p_title,'')),''),coalesce(p_active,true),auth.uid())
  on conflict(id) do update set platform=excluded.platform,external_url=excluded.external_url,product_id=excluded.product_id,
    promotion_id=excluded.promotion_id,campaign_code=excluded.campaign_code,title=excluded.title,active=excluded.active,updated_at=now()
  where public.local_social_content.local_id=p_local_id;
  return v_id;
end $$;

create or replace function public.my_local_social_content(p_local_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select case when exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active)
 then coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) else '[]'::jsonb end
 from public.local_social_content c where c.local_id=p_local_id;
$$;

revoke all on function public.save_my_local_social_content(uuid,uuid,text,text,uuid,uuid,text,text,boolean) from public,anon;
revoke all on function public.my_local_social_content(uuid) from public,anon;
grant execute on function public.save_my_local_social_content(uuid,uuid,text,text,uuid,uuid,text,text,boolean) to authenticated;
grant execute on function public.my_local_social_content(uuid) to authenticated;

