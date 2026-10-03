-- HTPWEB Block 2: richer LOCAL websites, themes and business verticals.

-- 1) Expand public business sectors beyond restaurants.
insert into public.business_sectors(code,name,description,display_order,active)
values
('RETAIL','Comercio y tiendas','Librerías, papelerías, minimarkets, flores, regalos, moda y comercio general.',20,true),
('HEALTH','Salud y bienestar','Farmacias, clínicas, odontología, laboratorios, terapias y bienestar.',30,true),
('PROFESSIONAL','Servicios profesionales','Ingeniería, arquitectura, consultoría, contabilidad, legal y otros servicios profesionales.',40,true),
('HOME_CONSTRUCTION','Hogar, construcción y ferretería','Ferreterías, materiales, electricidad, plomería, muebles y servicios del hogar.',50,true),
('EDUCATION','Educación y cultura','Librerías, academias, cursos, formación y actividades culturales.',60,true),
('BEAUTY','Belleza y cuidado personal','Peluquerías, barberías, spa, estética y cuidado personal.',70,true),
('AUTOMOTIVE','Automotriz y movilidad','Repuestos, talleres, lubricadoras, accesorios y servicios automotrices.',80,true),
('TECHNOLOGY','Tecnología y electrónica','Computación, celulares, electrónica, accesorios y servicios tecnológicos.',90,true)
on conflict(code) do update set
 name=excluded.name,description=excluded.description,display_order=excluded.display_order,active=excluded.active,updated_at=now();

-- 2) More storefront templates, designed around how each business sells.
alter table public.local_storefront_presets drop constraint if exists local_storefront_presets_layout_family_check;
alter table public.local_storefront_presets
 add constraint local_storefront_presets_layout_family_check
 check(layout_family in ('FOOD','RETAIL','FASHION','HEALTH','HARDWARE','SERVICES','GENERAL','BOOKS','FLOWERS','PROFESSIONAL','BEAUTY'));

insert into public.local_storefront_presets(code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,active,display_order)
values
('BOOKS_STATIONERY','Librería & Papelería','Librerías, papelerías, útiles escolares, arte y oficina',
 'Catálogo ordenado por colecciones, búsqueda protagonista y fichas claras para muchos productos.','BOOKS','CARDS','COMPACT',
 '{"hero":"library","category_nav":"shelves","product_image_ratio":"4:5","search_priority":true,"show_sku":true,"catalog_label":"Catálogo"}'::jsonb,true,35),
('FLOWERS_GIFTS','Flores & Regalos','Florerías, detalles, regalos, repostería creativa y ocasiones especiales',
 'Diseño emocional, visual y fotográfico con promociones y colecciones por ocasión.','FLOWERS','CARDS','PHOTO',
 '{"hero":"emotional","category_nav":"tiles","product_image_ratio":"1:1","promo_position":"top","catalog_label":"Colecciones"}'::jsonb,true,36),
('HEALTH_SERVICES','Salud Profesional','Clínicas, odontología, laboratorios, terapia, nutrición y bienestar',
 'Confianza primero: servicios, profesionales, información clara y contacto o reserva visible.','HEALTH','CARDS','PHOTO',
 '{"hero":"trust","category_nav":"tiles","product_image_ratio":"16:9","primary_cta":"WHATSAPP","catalog_label":"Servicios","show_schedule":true}'::jsonb,true,41),
('ENGINEERING_PRO','Ingeniería & Proyectos','Ingeniería, arquitectura, construcción, consultoría técnica y servicios B2B',
 'Portafolio profesional con servicios, proyectos, capacidades y solicitud de cotización.','PROFESSIONAL','CARDS','PHOTO',
 '{"hero":"corporate","category_nav":"sections","product_image_ratio":"16:9","primary_cta":"WHATSAPP","catalog_label":"Servicios y proyectos"}'::jsonb,true,61),
('BEAUTY_BOOKING','Belleza & Citas','Salones, barberías, spa, estética y cuidado personal',
 'Servicios visuales, paquetes, horarios y CTA de reserva o contacto destacado.','BEAUTY','CARDS','PHOTO',
 '{"hero":"beauty","category_nav":"tiles","product_image_ratio":"4:5","primary_cta":"WHATSAPP","catalog_label":"Servicios"}'::jsonb,true,62)
on conflict(code) do update set
 name=excluded.name,business_fit=excluded.business_fit,description=excluded.description,
 layout_family=excluded.layout_family,default_catalog_mode=excluded.default_catalog_mode,
 default_card_density=excluded.default_card_density,config=excluded.config,active=excluded.active,display_order=excluded.display_order;

-- 3) Theme palettes: template and colors are independent choices.
create table if not exists public.local_storefront_themes(
 code text primary key,
 name text not null,
 business_fit text,
 primary_color text not null check(primary_color ~ '^#[0-9A-Fa-f]{6}$'),
 secondary_color text not null check(secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
 background_color text not null check(background_color ~ '^#[0-9A-Fa-f]{6}$'),
 surface_color text not null check(surface_color ~ '^#[0-9A-Fa-f]{6}$'),
 text_color text not null check(text_color ~ '^#[0-9A-Fa-f]{6}$'),
 active boolean not null default true,
 display_order integer not null default 0
);
insert into public.local_storefront_themes(code,name,business_fit,primary_color,secondary_color,background_color,surface_color,text_color,active,display_order)
values
('HTPWEB_BLUE','Azul HTPWEB','Tecnología, servicios y uso general','#1466E8','#0B1730','#F6F9FF','#FFFFFF','#0B1730',true,10),
('GRAPHITE','Grafito','Ingeniería, ferretería, automotriz y servicios profesionales','#111827','#475467','#F5F6F8','#FFFFFF','#111827',true,20),
('OCEAN','Océano','Salud, tecnología, educación y servicios','#0077B6','#00B4D8','#F2FBFF','#FFFFFF','#082F49',true,30),
('FOREST','Bosque','Bienestar, natural, alimentos y hogar','#16794A','#78A55A','#F5FAF6','#FFFFFF','#173323',true,40),
('TERRACOTTA','Terracota','Restaurantes, cafeterías, artesanías y hogar','#C65D36','#F0A36B','#FFF8F4','#FFFFFF','#3D241A',true,50),
('ROSE','Rosa','Flores, regalos, belleza y moda','#D93670','#7C3AED','#FFF6FA','#FFFFFF','#3D1730',true,60),
('SUN','Sol','Bebidas, comida rápida, retail y emprendimientos','#F59E0B','#EF4444','#FFFBEB','#FFFFFF','#3F2A09',true,70),
('HEALTH','Salud','Clínicas, farmacias, laboratorios y bienestar','#0F9D8A','#2D6CDF','#F3FBFA','#FFFFFF','#12332F',true,80)
on conflict(code) do update set
 name=excluded.name,business_fit=excluded.business_fit,primary_color=excluded.primary_color,
 secondary_color=excluded.secondary_color,background_color=excluded.background_color,
 surface_color=excluded.surface_color,text_color=excluded.text_color,active=excluded.active,display_order=excluded.display_order;

alter table public.local_storefront_themes enable row level security;
drop policy if exists local_storefront_themes_public_read on public.local_storefront_themes;
create policy local_storefront_themes_public_read on public.local_storefront_themes for select to anon,authenticated using(active=true);
grant select on public.local_storefront_themes to anon,authenticated;

alter table public.local_commerce_settings
 add column if not exists theme_code text references public.local_storefront_themes(code) default 'HTPWEB_BLUE',
 add column if not exists content_config jsonb not null default '{"about_title":"Quiénes somos","about_text":"","catalog_title":"","contact_title":"Contacto","show_about":true,"show_catalog":true,"show_contact":true,"show_promotions":true}'::jsonb;
alter table public.local_commerce_settings drop constraint if exists local_commerce_settings_content_config_check;
alter table public.local_commerce_settings add constraint local_commerce_settings_content_config_check check(jsonb_typeof(content_config)='object');

-- 4) Seed business categories for the broader ecosystem.
alter table public.local_business_categories add column if not exists recommended_preset_code text references public.local_storefront_presets(code);

with seeds(name,description,sector_code,preset_code) as (
 values
 ('Farmacias','Medicamentos, cuidado personal y productos de salud.','HEALTH','HEALTH_CLEAN'),
 ('Clínicas y centros médicos','Consulta médica y servicios de salud.','HEALTH','HEALTH_SERVICES'),
 ('Odontología','Clínicas y consultorios odontológicos.','HEALTH','HEALTH_SERVICES'),
 ('Laboratorios clínicos','Exámenes y servicios de laboratorio.','HEALTH','HEALTH_SERVICES'),
 ('Bienestar y nutrición','Nutrición, terapia, bienestar y cuidado integral.','HEALTH','HEALTH_SERVICES'),
 ('Ingeniería y arquitectura','Ingeniería, arquitectura, diseño y proyectos técnicos.','PROFESSIONAL','ENGINEERING_PRO'),
 ('Consultoría profesional','Consultoría empresarial, técnica y especializada.','PROFESSIONAL','SERVICES_SHOWCASE'),
 ('Contabilidad y servicios legales','Servicios contables, tributarios y legales.','PROFESSIONAL','SERVICES_SHOWCASE'),
 ('Ferreterías','Herramientas, ferretería y suministros.','HOME_CONSTRUCTION','HARDWARE_CATALOG'),
 ('Materiales de construcción','Materiales, acabados y suministros para construcción.','HOME_CONSTRUCTION','HARDWARE_CATALOG'),
 ('Electricidad y plomería','Materiales y servicios eléctricos y de plomería.','HOME_CONSTRUCTION','HARDWARE_CATALOG'),
 ('Librerías y papelerías','Libros, útiles, papelería, arte y oficina.','EDUCATION','BOOKS_STATIONERY'),
 ('Academias y cursos','Formación, capacitación y cursos.','EDUCATION','SERVICES_SHOWCASE'),
 ('Florerías y regalos','Flores, detalles, regalos y ocasiones especiales.','RETAIL','FLOWERS_GIFTS'),
 ('Minimarkets y abarrotes','Productos de consumo, abarrotes y compra frecuente.','RETAIL','GROCERY_DENSE'),
 ('Ropa, calzado y accesorios','Moda, calzado, accesorios y boutiques.','RETAIL','FASHION_EDITORIAL'),
 ('Bebidas y tiendas especializadas','Bebidas, snacks y productos especializados.','RETAIL','GROCERY_DENSE'),
 ('Belleza y cosmética','Cosmética, cuidado personal y productos de belleza.','BEAUTY','FASHION_EDITORIAL'),
 ('Peluquerías, barberías y spa','Servicios de belleza, barbería, estética y spa.','BEAUTY','BEAUTY_BOOKING'),
 ('Talleres automotrices','Mecánica, mantenimiento y servicios automotrices.','AUTOMOTIVE','SERVICES_SHOWCASE'),
 ('Repuestos y accesorios automotrices','Repuestos, lubricantes y accesorios.','AUTOMOTIVE','HARDWARE_CATALOG'),
 ('Tecnología y computación','Computadoras, periféricos, electrónica y accesorios.','TECHNOLOGY','HARDWARE_CATALOG'),
 ('Celulares y accesorios','Celulares, accesorios y servicios móviles.','TECHNOLOGY','HARDWARE_CATALOG')
)
insert into public.local_business_categories(name,description,sector_id,active,recommended_preset_code)
select s.name,s.description,b.id,true,s.preset_code
from seeds s join public.business_sectors b on b.code=s.sector_code
on conflict ((lower(name))) do update set
 description=excluded.description,sector_id=excluded.sector_id,active=true,recommended_preset_code=excluded.recommended_preset_code,updated_at=now();

-- Move the legacy Farmacias category away from Restaurants.
update public.local_business_categories lbc
set sector_id=(select id from public.business_sectors where code='HEALTH'),
    active=true,recommended_preset_code='HEALTH_CLEAN',updated_at=now()
where lower(lbc.name)='farmacias';

-- 5) Owner content configuration.
create or replace function public.save_my_local_storefront_content(
 p_local_id uuid,p_theme_code text,p_content_config jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cfg jsonb;
begin
 if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
   raise exception 'HTPWEB: no administras este LOCAL';
 end if;
 if not public.local_has_live_plan(p_local_id) then raise exception 'HTPWEB: se requiere un plan LOCAL vigente'; end if;
 if not exists(select 1 from public.local_storefront_themes t where t.code=p_theme_code and t.active) then
   raise exception 'HTPWEB: paleta inválida';
 end if;
 if p_content_config is null or jsonb_typeof(p_content_config)<>'object' then raise exception 'HTPWEB: contenido inválido'; end if;
 v_cfg=jsonb_build_object(
   'hero_title',left(coalesce(p_content_config->>'hero_title',''),120),
   'hero_subtitle',left(coalesce(p_content_config->>'hero_subtitle',''),260),
   'about_title',left(coalesce(p_content_config->>'about_title','Quiénes somos'),80),
   'about_text',left(coalesce(p_content_config->>'about_text',''),1600),
   'catalog_title',left(coalesce(p_content_config->>'catalog_title',''),80),
   'contact_title',left(coalesce(p_content_config->>'contact_title','Contacto'),80),
   'show_about',coalesce((p_content_config->>'show_about')::boolean,true),
   'show_catalog',coalesce((p_content_config->>'show_catalog')::boolean,true),
   'show_contact',coalesce((p_content_config->>'show_contact')::boolean,true),
   'show_promotions',coalesce((p_content_config->>'show_promotions')::boolean,true)
 );
 insert into public.local_commerce_settings(local_id,theme_code,content_config,updated_by,created_at,updated_at)
 values(p_local_id,p_theme_code,v_cfg,auth.uid(),now(),now())
 on conflict(local_id) do update set theme_code=excluded.theme_code,content_config=excluded.content_config,updated_by=auth.uid(),updated_at=now();
 return public.local_commerce_snapshot(p_local_id);
end $$;

create or replace function public.local_commerce_snapshot(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
 select case when public.is_master()
       or exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active)
   then jsonb_build_object(
     'local_id',l.id,'name',l.name,'slug',l.slug,
     'claimed',public.local_is_claimed(l.id),
     'owner_managed',public.local_is_owner_managed(l.id),
     'plan',(
       select jsonb_build_object('code',p.code,'name',p.name,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'trial_ends_at',a.trial_ends_at)
       from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
       where a.local_id=l.id and p.target_type='LOCAL' and a.status in ('ACTIVE','TRIAL','PAST_DUE')
       order by a.starts_at desc limit 1
     ),
     'settings',jsonb_build_object(
       'storefront_enabled',coalesce(s.storefront_enabled,false),
       'preset_code',coalesce(s.preset_code,'GENERAL_MODERN'),
       'catalog_mode',coalesce(s.catalog_mode,case when exists(select 1 from public.local_menu_pages mp where mp.local_id=l.id and mp.active) then 'VISUAL_MENU' else 'CARDS' end),
       'card_density',coalesce(s.card_density,'PHOTO'),
       'order_mode',coalesce(s.order_mode,'WHATSAPP_ONLY'),
       'pickup_enabled',coalesce(s.pickup_enabled,true),
       'own_delivery_enabled',coalesce(s.own_delivery_enabled,false),
       'htpweb_delivery_enabled',coalesce(s.htpweb_delivery_enabled,true),
       'primary_delivery_id',s.primary_delivery_id,
       'accent_color',s.accent_color,
       'surface_style',coalesce(s.surface_style,'SOFT'),
       'theme_code',coalesce(s.theme_code,'HTPWEB_BLUE'),
       'content_config',coalesce(s.content_config,'{}'::jsonb)
     )
   ) else null end
 from public.locals l
 left join public.local_commerce_settings s on s.local_id=l.id
 where l.id=p_local_id;
$$;

create or replace function public.public_local_storefront(p_local_key text)
returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'local',jsonb_build_object(
     'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'banner_url',l.banner_url,'logo_url',l.logo_url,
     'address',l.address,'phone',l.phone,'whatsapp',l.whatsapp,'website_url',l.website_url,
     'instagram_url',l.instagram_url,'facebook_url',l.facebook_url,'tiktok_url',l.tiktok_url
   ),
   'settings',jsonb_build_object(
     'preset_code',coalesce(s.preset_code,'GENERAL_MODERN'),
     'catalog_mode',coalesce(s.catalog_mode,case when exists(select 1 from public.local_menu_pages mp where mp.local_id=l.id and mp.active) then 'VISUAL_MENU' else 'CARDS' end),
     'card_density',coalesce(s.card_density,'PHOTO'),'order_mode',coalesce(s.order_mode,'WHATSAPP_ONLY'),
     'pickup_enabled',coalesce(s.pickup_enabled,true),'own_delivery_enabled',coalesce(s.own_delivery_enabled,false),
     'htpweb_delivery_enabled',coalesce(s.htpweb_delivery_enabled,true),'primary_delivery_id',s.primary_delivery_id,
     'accent_color',s.accent_color,'surface_style',coalesce(s.surface_style,'SOFT'),
     'theme_code',coalesce(s.theme_code,'HTPWEB_BLUE'),'content_config',coalesce(s.content_config,'{}'::jsonb)
   ),
   'preset',(select to_jsonb(p) from public.local_storefront_presets p where p.code=coalesce(s.preset_code,'GENERAL_MODERN')),
   'theme',(select to_jsonb(t) from public.local_storefront_themes t where t.code=coalesce(s.theme_code,'HTPWEB_BLUE'))
 )
 from public.locals l
 join public.local_commerce_settings s on s.local_id=l.id and s.storefront_enabled=true
 where l.active=true
   and (l.id::text=p_local_key or lower(l.slug)=lower(p_local_key))
   and public.local_is_owner_managed(l.id)
 limit 1;
$$;

revoke all on function public.save_my_local_storefront_content(uuid,text,jsonb) from public,anon;
grant execute on function public.save_my_local_storefront_content(uuid,text,jsonb) to authenticated;
revoke all on function public.local_commerce_snapshot(uuid) from public,anon;
grant execute on function public.local_commerce_snapshot(uuid) to authenticated;
revoke all on function public.public_local_storefront(text) from public;
grant execute on function public.public_local_storefront(text) to anon,authenticated;
