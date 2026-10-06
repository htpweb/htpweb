-- Professional storefront design library: nine structural variants plus each category signature.
with legacy(code,category_label) as (
 values ('FOOD_VISUAL','Gastronomía'),('GROCERY_DENSE','Comercio & Retail'),('FASHION_EDITORIAL','Moda & Boutique'),
 ('BOOKS_STATIONERY','Librería & Papelería'),('FLOWERS_GIFTS','Flores & Regalos'),('HEALTH_CLEAN','Salud & Bienestar'),
 ('HEALTH_SERVICES','Salud & Bienestar'),('HARDWARE_CATALOG','Catálogo Técnico'),('SERVICES_SHOWCASE','Servicios'),
 ('ENGINEERING_PRO','Ingeniería & Profesional'),('BEAUTY_BOOKING','Belleza & Citas'),('GENERAL_MODERN','General & Emprendimientos')
)
update public.local_storefront_presets p set config=coalesce(p.config,'{}'::jsonb)||jsonb_build_object(
 'design_system','SIGNATURE','design_rank',1,'category_label',l.category_label,'navigation_style','TOP',
 'button_style','SOFT_RECT','header_style','FLOATING','content_width','WIDE')
from legacy l where p.code=l.code;

with families(family,category_label,base_name,business_fit,catalog_label,default_catalog_mode,default_card_density) as (
 values
 ('FOOD','Gastronomía','Sabor','Restaurantes, cafeterías, pizzerías y comida rápida','Menú','CARDS','PHOTO'),
 ('RETAIL','Comercio & Retail','Compra','Minimarkets, abarrotes, supermercados, bebidas y comercios','Productos','CARDS','COMPACT'),
 ('FASHION','Moda & Boutique','Vitrina','Boutiques, calzado, accesorios, moda y lifestyle','Colección','CARDS','PHOTO'),
 ('BOOKS','Librería & Papelería','Lectura','Librerías, papelerías, útiles escolares, arte y oficina','Catálogo','CARDS','PHOTO'),
 ('FLOWERS','Flores & Regalos','Detalle','Florerías, regalos, repostería creativa y ocasiones especiales','Colecciones','CARDS','PHOTO'),
 ('HEALTH','Salud & Bienestar','Salud','Clínicas, farmacias, laboratorios, terapia, nutrición y bienestar','Servicios','CARDS','PHOTO'),
 ('HARDWARE','Catálogo Técnico','Técnico','Ferreterías, repuestos, tecnología, materiales y suministros','Catálogo','CARDS','COMPACT'),
 ('SERVICES','Servicios','Servicio','Talleres, profesionales, servicios locales y negocios especializados','Servicios','CARDS','PHOTO'),
 ('PROFESSIONAL','Ingeniería & Profesional','Pro','Ingeniería, arquitectura, construcción, consultoría técnica y B2B','Servicios y proyectos','CARDS','PHOTO'),
 ('BEAUTY','Belleza & Citas','Studio','Salones, barberías, spa, estética y cuidado personal','Servicios','CARDS','PHOTO'),
 ('GENERAL','General & Emprendimientos','Nova','Negocios generales, marcas personales y emprendimientos','Productos / Servicios','CARDS','PHOTO')
), variants(rank,design_system,label,navigation_style,button_style,header_style,hero_style,card_style,content_width) as (
 values
 (2,'MINIMAL','Minimal','TOP','PILL','CLEAN','MINIMAL','BORDERLESS','NARROW'),
 (3,'SPLIT','Split','TOP','SHARP','CLEAN','SPLIT','ELEVATED','WIDE'),
 (4,'SIDEBAR','Sidebar','SIDE','SOFT_RECT','SIDE','SIDE','BORDERED','WIDE'),
 (5,'EDITORIAL','Editorial','TOP','TEXTUAL','EDITORIAL','EDITORIAL','EDITORIAL','NARROW'),
 (6,'LUXE','Luxe','TOP','PILL','TRANSPARENT','LUXE','GLASS','WIDE'),
 (7,'BOLD','Bold','TOP','BLOCK','SOLID','BOLD','BLOCK','FULL'),
 (8,'MAGAZINE','Magazine','MEGA','SOFT_RECT','MAGAZINE','MAGAZINE','MASONRY','WIDE'),
 (9,'IMMERSIVE','Immersive','OVERLAY','PILL','OVERLAY','FULLSCREEN','GLASS','FULL'),
 (10,'COMPACT','Compact','DROPDOWN','SOFT_RECT','COMPACT','COMPACT','DENSE','WIDE')
)
insert into public.local_storefront_presets(code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,active,display_order)
select f.family||'_'||v.design_system,f.base_name||' · '||v.label,f.business_fit,
 'Diseño profesional '||lower(v.label)||' con navegación '||lower(v.navigation_style)||', composición '||lower(v.hero_style)||' y sistema visual propio.',
 f.family,f.default_catalog_mode,f.default_card_density,
 jsonb_build_object('design_system',v.design_system,'design_rank',v.rank,'category_label',f.category_label,'navigation_style',v.navigation_style,'button_style',v.button_style,'header_style',v.header_style,'hero_style',v.hero_style,'card_style',v.card_style,'content_width',v.content_width,'catalog_label',f.catalog_label,'product_image_ratio',case when f.family in ('FASHION','BEAUTY') then '3:4' when v.design_system='COMPACT' then '1:1' else '4:3' end),
 true,(case f.family when 'FOOD' then 1000 when 'RETAIL' then 2000 when 'FASHION' then 3000 when 'BOOKS' then 4000 when 'FLOWERS' then 5000 when 'HEALTH' then 6000 when 'HARDWARE' then 7000 when 'SERVICES' then 8000 when 'PROFESSIONAL' then 9000 when 'BEAUTY' then 10000 else 11000 end)+v.rank
from families f cross join variants v
on conflict(code) do update set name=excluded.name,business_fit=excluded.business_fit,description=excluded.description,layout_family=excluded.layout_family,default_catalog_mode=excluded.default_catalog_mode,default_card_density=excluded.default_card_density,config=excluded.config,active=true,display_order=excluded.display_order;
