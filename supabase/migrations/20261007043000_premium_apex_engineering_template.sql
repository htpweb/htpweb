-- HTPWEB · First Premium Engineering template imported from approved Framer concept APEX.
insert into public.local_storefront_presets(
 code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,active,display_order
) values (
 'PROFESSIONAL_APEX_PREMIUM',
 'Apex Infrastructure',
 'Ingeniería, arquitectura, construcción e infraestructura con imagen corporativa internacional.',
 'Plantilla Premium cinematográfica: hero de gran impacto, métricas, capacidades integradas, proyectos, firma, confianza, perspectivas y contacto ejecutivo.',
 'PROFESSIONAL','CARDS','PHOTO',
 jsonb_build_object(
  'design_system','APEX',
  'design_rank',3,
  'tier','PREMIUM',
  'category_label','Ingeniería & Arquitectura',
  'navigation_style','TOP',
  'button_style','SHARP',
  'header_style','DARK',
  'hero_style','CINEMATIC',
  'card_style','EDITORIAL_PROJECT',
  'content_width','FULL',
  'catalog_label','Capacidades',
  'product_image_ratio','16:9',
  'source','FRAMER_APPROVED_APEX'
 ),
 true,9191
)
on conflict(code) do update set
 name=excluded.name,
 business_fit=excluded.business_fit,
 description=excluded.description,
 layout_family=excluded.layout_family,
 default_catalog_mode=excluded.default_catalog_mode,
 default_card_density=excluded.default_card_density,
 config=excluded.config,
 active=true,
 display_order=excluded.display_order;
