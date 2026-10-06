-- HTPWEB — upgrade de la biblioteca de diseños para Ingeniería y arquitectura.
-- Mantiene los códigos existentes para no romper selecciones guardadas.

update public.local_storefront_presets set
 name='Impact Editorial',
 business_fit='Ingeniería, arquitectura e infraestructura con portafolio de alto impacto.',
 description='Portada editorial de gran escala, proyectos protagonistas, navegación superior limpia y composición corporativa premium.',
 config=config || '{"design_system":"SIGNATURE","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"PILL","header_style":"TRANSPARENT","hero_style":"IMPACT","card_style":"ELEVATED","content_width":"WIDE","catalog_label":"Soluciones","product_image_ratio":"16:9"}'::jsonb,
 display_order=9101 where code='ENGINEERING_PRO';

update public.local_storefront_presets set
 name='Precision Minimal',
 business_fit='Consultoría técnica, ingeniería especializada y firmas que necesitan máxima claridad.',
 description='Diseño minimalista con mucho espacio, tipografía precisa, métricas y servicios técnicos ordenados.',
 config=config || '{"design_system":"MINIMAL","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"SOFT_RECT","header_style":"CLEAN","hero_style":"MINIMAL","card_style":"OUTLINE","content_width":"NARROW","catalog_label":"Servicios","product_image_ratio":"16:9"}'::jsonb,
 display_order=9102 where code='PROFESSIONAL_MINIMAL';

update public.local_storefront_presets set
 name='Technical Split',
 business_fit='Ingeniería multidisciplinaria, infraestructura, energía y proyectos técnicos.',
 description='Composición dividida con contenido técnico a un lado y visual de proyecto al otro; ideal para servicios y capacidades.',
 config=config || '{"design_system":"SPLIT","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"SOFT_RECT","header_style":"SOLID","hero_style":"SPLIT","card_style":"TECHNICAL","content_width":"WIDE","catalog_label":"Capacidades","product_image_ratio":"16:9"}'::jsonb,
 display_order=9103 where code='PROFESSIONAL_SPLIT';

update public.local_storefront_presets set
 name='Blueprint Sidebar',
 business_fit='Ingeniería civil, eléctrica, mecánica, construcción y oficinas técnicas.',
 description='Navegación lateral tipo blueprint, lectura técnica y estructura preparada para servicios, planos y proyectos.',
 config=config || '{"design_system":"SIDEBAR","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"SIDE","button_style":"SQUARE","header_style":"SIDEBAR","hero_style":"BLUEPRINT","card_style":"TECHNICAL","content_width":"WIDE","catalog_label":"Proyectos","product_image_ratio":"16:9"}'::jsonb,
 display_order=9104 where code='PROFESSIONAL_SIDEBAR';

update public.local_storefront_presets set
 name='Studio Editorial',
 business_fit='Arquitectura, diseño, urbanismo y estudios creativos de ingeniería.',
 description='Estética editorial de estudio profesional, portafolio visual, tipografía amplia y presentación elegante de proyectos.',
 config=config || '{"design_system":"EDITORIAL","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"TEXT","header_style":"LIGHT","hero_style":"EDITORIAL","card_style":"FLAT","content_width":"WIDE","catalog_label":"Portafolio","product_image_ratio":"4:3"}'::jsonb,
 display_order=9105 where code='PROFESSIONAL_EDITORIAL';

update public.local_storefront_presets set
 name='Future Systems',
 business_fit='Ingeniería avanzada, automatización, energía, tecnología y proyectos de innovación.',
 description='Tema oscuro premium con percepción tecnológica, métricas, innovación y presentación de soluciones complejas.',
 config=config || '{"design_system":"LUXE","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"OUTLINE","header_style":"DARK","hero_style":"FUTURE","card_style":"GLASS","content_width":"WIDE","catalog_label":"Soluciones","product_image_ratio":"16:9"}'::jsonb,
 display_order=9106 where code='PROFESSIONAL_LUXE';

update public.local_storefront_presets set
 name='Industrial Bold',
 business_fit='Ingeniería industrial, construcción, mantenimiento, EPC y operaciones críticas.',
 description='Tipografía fuerte, bloques de alto contraste y mensajes directos para empresas industriales y constructoras.',
 config=config || '{"design_system":"BOLD","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"SQUARE","header_style":"SOLID","hero_style":"INDUSTRIAL","card_style":"BOLD","content_width":"FULL","catalog_label":"Servicios","product_image_ratio":"16:9"}'::jsonb,
 display_order=9107 where code='PROFESSIONAL_BOLD';

update public.local_storefront_presets set
 name='Project Magazine',
 business_fit='Firmas con muchos proyectos, casos de estudio, noticias y experiencia sectorial.',
 description='Diseño tipo magazine que combina proyectos, artículos, capacidades y casos de estudio en una jerarquía editorial.',
 config=config || '{"design_system":"MAGAZINE","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"SOFT_RECT","header_style":"EDITORIAL","hero_style":"MAGAZINE","card_style":"EDITORIAL","content_width":"WIDE","catalog_label":"Proyectos","product_image_ratio":"4:3"}'::jsonb,
 display_order=9108 where code='PROFESSIONAL_MAGAZINE';

update public.local_storefront_presets set
 name='Immersive Infrastructure',
 business_fit='Megaproyectos, infraestructura, construcción y empresas con fotografía de alto impacto.',
 description='Hero inmersivo a pantalla amplia, navegación superpuesta y experiencia visual centrada en grandes proyectos.',
 config=config || '{"design_system":"IMMERSIVE","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"OVERLAY","button_style":"PILL","header_style":"TRANSPARENT","hero_style":"IMMERSIVE","card_style":"FLOATING","content_width":"FULL","catalog_label":"Proyectos","product_image_ratio":"16:9"}'::jsonb,
 display_order=9109 where code='PROFESSIONAL_IMMERSIVE';

update public.local_storefront_presets set
 name='Technical Compact',
 business_fit='Empresas técnicas con muchos servicios, productos, certificaciones y fichas de información.',
 description='Diseño compacto y eficiente para mostrar muchas capacidades, servicios y productos sin perder orden visual.',
 config=config || '{"design_system":"COMPACT","design_rank":2,"category_label":"Ingeniería & Arquitectura","navigation_style":"TOP","button_style":"COMPACT","header_style":"COMPACT","hero_style":"COMPACT","card_style":"DENSE","content_width":"WIDE","catalog_label":"Catálogo técnico","product_image_ratio":"1:1"}'::jsonb,
 display_order=9110 where code='PROFESSIONAL_COMPACT';
