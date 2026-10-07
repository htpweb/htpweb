-- HTPWEB · selector persistente de diseño de menú para restaurantes
-- Aplicada en producción el 2026-10-07.

alter table public.locals
  add column if not exists menu_design text not null default 'CURRENT'
  check (menu_design = any (array['CURRENT'::text,'COMPACT'::text]));

create or replace function public.master_list_locals()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'address',l.address,
    'latitude',l.latitude,'longitude',l.longitude,'phone',l.phone,'whatsapp',l.whatsapp,'active',l.active,
    'logo_url',l.logo_url,'banner_url',l.banner_url,'zone_id',l.zone_id,
    'menu_design',coalesce(l.menu_design,'CURRENT'),
    'is_restaurant',exists(
      select 1 from public.local_business_category_assignments ra
      join public.local_business_categories rbc on rbc.id=ra.category_id
      join public.business_sectors rbs on rbs.id=rbc.sector_id
      where ra.local_id=l.id and rbs.code='RESTAURANTS'
    ) or exists(
      select 1 from public.local_business_categories rbc2
      join public.business_sectors rbs2 on rbs2.id=rbc2.sector_id
      where rbc2.id=l.business_category_id and rbs2.code='RESTAURANTS'
    ),
    'business_category_id',l.business_category_id,'business_category_name',bc.name,
    'business_category_ids',coalesce((select jsonb_agg(a.category_id order by a.position) from public.local_business_category_assignments a where a.local_id=l.id),'[]'::jsonb),
    'business_category_names',coalesce((select jsonb_agg(c2.name order by a2.position) from public.local_business_category_assignments a2 join public.local_business_categories c2 on c2.id=a2.category_id where a2.local_id=l.id),'[]'::jsonb),
    'google_place_id',l.google_place_id,'google_maps_url',l.google_maps_url,'location_source',l.location_source,
    'zone_code',z.code,'zone_name',z.name,'city_id',coalesce(l.city_id,z.city_id),'canton',coalesce(lc.name,zc.name),'province',coalesce(lc.province,zc.province),
    'claimed',public.local_is_claimed(l.id),'owner_managed',public.local_is_owner_managed(l.id),
    'local_plan',(select jsonb_build_object('code',p.code,'name',p.name,'status',a.status,'ends_at',a.ends_at)
      from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
      where a.local_id=l.id and p.target_type='LOCAL' and a.status in ('ACTIVE','TRIAL','PAST_DUE')
      order by a.starts_at desc limit 1)
  ) order by coalesce(lc.province,zc.province),coalesce(lc.name,zc.name),lower(l.name)),'[]'::jsonb)
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities zc on zc.id=z.city_id
  left join public.cities lc on lc.id=l.city_id
  left join public.local_business_categories bc on bc.id=l.business_category_id
  where public.is_master();
$function$;

create or replace function public.master_set_local_menu_design(p_local_id uuid,p_menu_design text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_design text := upper(coalesce(trim(p_menu_design),''));
  v_is_restaurant boolean;
begin
  if not public.is_master() then raise exception 'MASTER_REQUIRED'; end if;
  if v_design not in ('CURRENT','COMPACT') then raise exception 'INVALID_MENU_DESIGN'; end if;

  select (
    exists(
      select 1 from public.local_business_category_assignments a
      join public.local_business_categories bc on bc.id=a.category_id
      join public.business_sectors bs on bs.id=bc.sector_id
      where a.local_id=l.id and bs.code='RESTAURANTS'
    )
    or exists(
      select 1 from public.local_business_categories bc2
      join public.business_sectors bs2 on bs2.id=bc2.sector_id
      where bc2.id=l.business_category_id and bs2.code='RESTAURANTS'
    )
  ) into v_is_restaurant
  from public.locals l where l.id=p_local_id;

  if not found then raise exception 'LOCAL_NOT_FOUND'; end if;
  if not coalesce(v_is_restaurant,false) then raise exception 'MENU_DESIGN_RESTAURANTS_ONLY'; end if;

  update public.locals set menu_design=v_design,updated_at=now() where id=p_local_id;
  return v_design;
end;
$function$;

grant execute on function public.master_set_local_menu_design(uuid,text) to authenticated;

create or replace function public.public_local_storefront(p_local_key text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
 select jsonb_build_object(
   'local',jsonb_build_object(
     'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'banner_url',l.banner_url,'logo_url',l.logo_url,
     'address',l.address,'latitude',l.latitude,'longitude',l.longitude,'google_maps_url',l.google_maps_url,
     'phone',l.phone,'whatsapp',l.whatsapp,'website_url',l.website_url,'instagram_url',l.instagram_url,
     'facebook_url',l.facebook_url,'tiktok_url',l.tiktok_url,'telegram_url',l.telegram_url
   ),
   'settings',jsonb_build_object(
     'preset_code',coalesce(s.preset_code,'GENERAL_MODERN'),
     'catalog_mode',coalesce(s.catalog_mode,case when exists(select 1 from public.local_menu_pages mp where mp.local_id=l.id and mp.active) then 'VISUAL_MENU' else 'CARDS' end),
     'card_density',coalesce(s.card_density,'PHOTO'),
     'order_mode',coalesce(s.order_mode,'WHATSAPP_ONLY'),
     'pickup_enabled',coalesce(s.pickup_enabled,true),
     'own_delivery_enabled',coalesce(s.own_delivery_enabled,false),
     'htpweb_delivery_enabled',coalesce(s.htpweb_delivery_enabled,true),
     'primary_delivery_id',s.primary_delivery_id,
     'menu_design',coalesce(l.menu_design,'CURRENT'),
     'accent_color',s.accent_color,'surface_style',coalesce(s.surface_style,'SOFT'),
     'theme_code',coalesce(s.theme_code,'HTPWEB_BLUE'),'content_config',coalesce(s.content_config,'{}'::jsonb)
   ),
   'preset',(select to_jsonb(p) from public.local_storefront_presets p where p.code=coalesce(s.preset_code,'GENERAL_MODERN')),
   'theme',(select to_jsonb(t) from public.local_storefront_themes t where t.code=coalesce(s.theme_code,'HTPWEB_BLUE'))
 )
 from public.locals l
 join public.local_commerce_settings s on s.local_id=l.id and s.storefront_enabled=true
 where l.active=true
   and (l.id::text=p_local_key or lower(l.slug)=lower(p_local_key)
     or lower(l.slug||'-'||substr(replace(l.id::text,'-',''),1,8))=lower(p_local_key))
   and public.local_is_owner_managed(l.id)
 limit 1;
$function$;
