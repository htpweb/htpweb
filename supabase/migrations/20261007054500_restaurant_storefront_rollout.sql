-- HTPWEB · Restaurant storefront family and rollout
-- 10 reusable restaurant presets + assignment of active restaurant locals.

insert into public.local_storefront_presets
(code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,active,display_order)
values
('RESTAURANT_SIGNATURE','Mesa Signature','Restaurantes, cafeterías y comida típica','Portada fotográfica elegante, especialidades destacadas y acceso directo a la Tienda virtual.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','SIGNATURE','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2101),
('RESTAURANT_MINIMAL','Café Minimal','Cafeterías, desayunos, sánduches y propuestas ligeras','Diseño limpio y cálido con gran legibilidad para menús amplios.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','MINIMAL','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2102),
('RESTAURANT_SPLIT','Costa Split','Mariscos, ceviches y cocina costera','Composición dividida y muy visual para platos, promociones y menú.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','SPLIT','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2103),
('RESTAURANT_SIDEBAR','Menú Urbano','Comida rápida, alitas, hamburguesas y locales juveniles','Navegación lateral con identidad urbana y acceso rápido al catálogo.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','SIDEBAR','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','SIDE','catalog_label','Tienda virtual'),true,2104),
('RESTAURANT_EDITORIAL','Sabores Editorial','Desayunos, bolones, comida típica y restaurantes tradicionales','Presentación editorial para contar la historia del local y ordenar un menú variado.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','EDITORIAL','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2105),
('RESTAURANT_LUXE','Parrilla Luxe','Parrillas, carnes, grill y restaurantes nocturnos','Tema oscuro de alto impacto para parrillas, cortes, costillas y especialidades.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','LUXE','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2106),
('RESTAURANT_BOLD','Street Food Bold','Hamburguesas, salchipapas, alitas y fast food','Tipografía fuerte y bloques visuales para combos, promociones y productos populares.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','BOLD','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2107),
('RESTAURANT_MAGAZINE','Carta Magazine','Pizzerías, cafeterías y menús extensos','Estética de revista gastronómica con secciones claras y productos destacados.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','MAGAZINE','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2108),
('RESTAURANT_IMMERSIVE','Sabor Inmersivo','Restaurantes visuales, grill y propuestas de autor','Fotografía protagonista y secciones inmersivas para una experiencia de alto impacto.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','IMMERSIVE','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2109),
('RESTAURANT_COMPACT','Bistró Compact','Locales con pedidos rápidos y menús directos','Diseño compacto, práctico y enfocado en encontrar productos y pedir rápido.','RESTAURANT','CARDS','PHOTO',jsonb_build_object('design_system','COMPACT','design_rank',2,'tier','BASIC','category_label','Restaurantes','navigation_style','TOP','catalog_label','Tienda virtual'),true,2110)
on conflict(code) do update set
 name=excluded.name,business_fit=excluded.business_fit,description=excluded.description,
 layout_family=excluded.layout_family,default_catalog_mode=excluded.default_catalog_mode,
 default_card_density=excluded.default_card_density,config=excluded.config,active=true,display_order=excluded.display_order;

-- Restaurant-related categories now expose the RESTAURANT family instead of refined FOOD.
update public.local_business_categories
set recommended_preset_code='RESTAURANT_SIGNATURE',updated_at=now()
where name in ('Restaurantes','Comida rápida','Parrilladas y asados','Pizzerías','Mariscos y ceviche','Almuerzos y comida típica','Desayunos y Cafeterías','Postres y heladería');

-- Assign a suitable restaurant template/theme to every active LOCAL in those categories.
with targets as (
  select l.id,l.name,c.name as category_name,
    case
      when l.name='Abracadabra - Codesa' then 'RESTAURANT_BOLD'
      when l.name='Abracadabra - Espejo' then 'RESTAURANT_SIDEBAR'
      when l.name='Abracadabra - Las Palmas' then 'RESTAURANT_IMMERSIVE'
      when l.name='ASADOS CODESA' then 'RESTAURANT_LUXE'
      when l.name='BUFFALOS BAR GRILL' then 'RESTAURANT_IMMERSIVE'
      when l.name='Carbon Y Leños Burguer' then 'RESTAURANT_BOLD'
      when l.name='Coco Café' then 'RESTAURANT_SIGNATURE'
      when l.name='Don DA' then 'RESTAURANT_BOLD'
      when l.name='Don Ru - Bolones' then 'RESTAURANT_COMPACT'
      when l.name='Don Ru - Picadas' then 'RESTAURANT_SIDEBAR'
      when l.name='El Mariscal' then 'RESTAURANT_MAGAZINE'
      when l.name='Fritada Leverone' then 'RESTAURANT_SPLIT'
      when l.name='Fritadas Mi Chanchito' then 'RESTAURANT_BOLD'
      when l.name='Garden Café' then 'RESTAURANT_EDITORIAL'
      when l.name='La Parrilla de Chely' then 'RESTAURANT_SIGNATURE'
      when l.name='Lorejón' then 'RESTAURANT_IMMERSIVE'
      when l.name='Miguelacho Pizza' then 'RESTAURANT_MAGAZINE'
      when l.name='Moritos & Grill' then 'RESTAURANT_LUXE'
      when l.name='One Sanduche' then 'RESTAURANT_MINIMAL'
      when l.name='Parrilladas “El Toro”' then 'RESTAURANT_LUXE'
      when l.name='Parrilladas Cedeño' then 'RESTAURANT_SIGNATURE'
      when l.name='Picoteo' then 'RESTAURANT_COMPACT'
      when l.name='Punto Pez' then 'RESTAURANT_SPLIT'
      when l.name='Rincon Manabita Restaurant- Grill' then 'RESTAURANT_EDITORIAL'
      when l.name='SAMBA' then 'RESTAURANT_BOLD'
      when l.name='Santas Alitas' then 'RESTAURANT_SIDEBAR'
      when c.name='Mariscos y ceviche' then 'RESTAURANT_SPLIT'
      when c.name='Pizzerías' then 'RESTAURANT_MAGAZINE'
      when c.name='Parrilladas y asados' then 'RESTAURANT_LUXE'
      when c.name='Desayunos y Cafeterías' then 'RESTAURANT_EDITORIAL'
      when c.name='Almuerzos y comida típica' then 'RESTAURANT_SIGNATURE'
      when c.name='Comida rápida' then 'RESTAURANT_BOLD'
      else 'RESTAURANT_SIGNATURE'
    end as preset_code,
    case
      when c.name='Mariscos y ceviche' then 'OCEAN'
      when c.name='Pizzerías' then 'TERRACOTTA'
      when c.name='Parrilladas y asados' then 'GRAPHITE'
      when l.name in ('Garden Café','Coco Café') then 'FOREST'
      when c.name='Comida rápida' then 'SUN'
      else 'TERRACOTTA'
    end as theme_code,
    case
      when c.name='Mariscos y ceviche' then '#0077B6'
      when c.name='Parrilladas y asados' then '#C65D36'
      when c.name='Comida rápida' then '#EF4444'
      when l.name in ('Garden Café','Coco Café') then '#16794A'
      else '#C65D36'
    end as accent_color
  from public.locals l
  join public.local_business_categories c on c.id=l.business_category_id
  where l.active=true
    and c.name in ('Restaurantes','Comida rápida','Parrilladas y asados','Pizzerías','Mariscos y ceviche','Almuerzos y comida típica','Desayunos y Cafeterías','Postres y heladería')
    and l.id <> 'f0000000-0000-4000-8000-000000000001'::uuid
)
insert into public.local_commerce_settings
(local_id,storefront_enabled,preset_code,catalog_mode,card_density,theme_code,accent_color,surface_style,content_config)
select id,true,preset_code,'CARDS','PHOTO',theme_code,accent_color,'SOFT',
       jsonb_build_object(
         'about_text','',
         'show_about',true,
         'about_title','Quiénes somos',
         'show_catalog',true,
         'catalog_title','Tienda virtual',
         'show_contact',true,
         'contact_title','Contacto',
         'show_promotions',true
       )
from targets
on conflict(local_id) do update set
 storefront_enabled=true,
 preset_code=excluded.preset_code,
 catalog_mode='CARDS',
 card_density='PHOTO',
 theme_code=excluded.theme_code,
 accent_color=excluded.accent_color,
 surface_style='SOFT',
 content_config=coalesce(public.local_commerce_settings.content_config,'{}'::jsonb) ||
   jsonb_build_object('show_catalog',true,'catalog_title','Tienda virtual','show_promotions',true),
 updated_at=now();

-- Every active product already created for these restaurants must appear in the virtual shop.
update public.products p
set catalog_visible=true,updated_at=now()
where p.active is distinct from false
  and exists(
    select 1
    from public.locals l
    join public.local_business_categories c on c.id=l.business_category_id
    where l.id=p.local_id
      and l.active=true
      and c.name in ('Restaurantes','Comida rápida','Parrilladas y asados','Pizzerías','Mariscos y ceviche','Almuerzos y comida típica','Desayunos y Cafeterías','Postres y heladería')
      and l.id <> 'f0000000-0000-4000-8000-000000000001'::uuid
  );
