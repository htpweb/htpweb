create or replace function public.public_local_storefront(p_local_key text)
returns jsonb
language sql
stable security definer
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
 left join public.local_commerce_settings s on s.local_id=l.id
 where l.active=true
   and (l.id::text=p_local_key or lower(l.slug)=lower(p_local_key)
     or lower(l.slug||'-'||substr(replace(l.id::text,'-',''),1,8))=lower(p_local_key))
 limit 1;
$function$;
