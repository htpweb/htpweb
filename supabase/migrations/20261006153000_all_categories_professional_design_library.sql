-- HTPWEB: normaliza 10 diseños profesionales por familia visual
-- y mejora los nombres visibles del constructor.

update public.local_storefront_presets
set name = case layout_family
 when 'FOOD' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Chef Signature' when 'MINIMAL' then 'Mesa Minimal' when 'SPLIT' then 'Cocina Split'
  when 'SIDEBAR' then 'Carta Sidebar' when 'EDITORIAL' then 'Gourmet Editorial' when 'LUXE' then 'Noir Dining'
  when 'BOLD' then 'Street Bold' when 'MAGAZINE' then 'Gastro Magazine' when 'IMMERSIVE' then 'Flavor Immersive'
  when 'COMPACT' then 'Quick Order' end
 when 'RETAIL' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Mercado Signature' when 'MINIMAL' then 'Clean Shop' when 'SPLIT' then 'Promo Split'
  when 'SIDEBAR' then 'Aisles Sidebar' when 'EDITORIAL' then 'Retail Editorial' when 'LUXE' then 'Select Luxe'
  when 'BOLD' then 'Oferta Bold' when 'MAGAZINE' then 'Shop Magazine' when 'IMMERSIVE' then 'Store Immersive'
  when 'COMPACT' then 'Fast Cart' end
 when 'FASHION' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Runway Signature' when 'MINIMAL' then 'Atelier Minimal' when 'SPLIT' then 'Lookbook Split'
  when 'SIDEBAR' then 'Collection Sidebar' when 'EDITORIAL' then 'Fashion Editorial' when 'LUXE' then 'Maison Luxe'
  when 'BOLD' then 'Urban Bold' when 'MAGAZINE' then 'Style Magazine' when 'IMMERSIVE' then 'Runway Immersive'
  when 'COMPACT' then 'Shop Grid' end
 when 'BOOKS' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Biblioteca Signature' when 'MINIMAL' then 'Página Minimal' when 'SPLIT' then 'Lectura Split'
  when 'SIDEBAR' then 'Catálogo Sidebar' when 'EDITORIAL' then 'Editorial Literaria' when 'LUXE' then 'Colección Luxe'
  when 'BOLD' then 'Campus Bold' when 'MAGAZINE' then 'Revista Cultural' when 'IMMERSIVE' then 'Lectura Immersive'
  when 'COMPACT' then 'Estantería Compact' end
 when 'FLOWERS' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Floral Signature' when 'MINIMAL' then 'Petal Minimal' when 'SPLIT' then 'Bouquet Split'
  when 'SIDEBAR' then 'Occasions Sidebar' when 'EDITORIAL' then 'Botanical Editorial' when 'LUXE' then 'Rose Luxe'
  when 'BOLD' then 'Color Bold' when 'MAGAZINE' then 'Floral Magazine' when 'IMMERSIVE' then 'Bloom Immersive'
  when 'COMPACT' then 'Gift Compact' end
 when 'HEALTH' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Salud Signature' when 'MINIMAL' then 'Clinical Minimal' when 'SPLIT' then 'Care Split'
  when 'SIDEBAR' then 'Especialidades Sidebar' when 'EDITORIAL' then 'Wellness Editorial' when 'LUXE' then 'Premium Care'
  when 'BOLD' then 'Vital Bold' when 'MAGAZINE' then 'Health Magazine' when 'IMMERSIVE' then 'Care Immersive'
  when 'COMPACT' then 'Clinic Compact' end
 when 'HARDWARE' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Catálogo Pro' when 'MINIMAL' then 'Technical Minimal' when 'SPLIT' then 'Product Split'
  when 'SIDEBAR' then 'Inventory Sidebar' when 'EDITORIAL' then 'Product Editorial' when 'LUXE' then 'Tech Luxe'
  when 'BOLD' then 'Industrial Bold' when 'MAGAZINE' then 'Catalog Magazine' when 'IMMERSIVE' then 'Tech Immersive'
  when 'COMPACT' then 'Stock Compact' end
 when 'SERVICES' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Service Signature' when 'MINIMAL' then 'Consulting Minimal' when 'SPLIT' then 'Expert Split'
  when 'SIDEBAR' then 'Services Sidebar' when 'EDITORIAL' then 'Professional Editorial' when 'LUXE' then 'Executive Luxe'
  when 'BOLD' then 'Results Bold' when 'MAGAZINE' then 'Expertise Magazine' when 'IMMERSIVE' then 'Service Immersive'
  when 'COMPACT' then 'Agenda Compact' end
 when 'BEAUTY' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Studio Signature' when 'MINIMAL' then 'Beauty Minimal' when 'SPLIT' then 'Glow Split'
  when 'SIDEBAR' then 'Treatments Sidebar' when 'EDITORIAL' then 'Beauty Editorial' when 'LUXE' then 'Salon Luxe'
  when 'BOLD' then 'Glam Bold' when 'MAGAZINE' then 'Beauty Magazine' when 'IMMERSIVE' then 'Glow Immersive'
  when 'COMPACT' then 'Booking Compact' end
 when 'GENERAL' then case coalesce(config->>'design_system','SIGNATURE')
  when 'SIGNATURE' then 'Business Signature' when 'MINIMAL' then 'Business Minimal' when 'SPLIT' then 'Business Split'
  when 'SIDEBAR' then 'Business Sidebar' when 'EDITORIAL' then 'Business Editorial' when 'LUXE' then 'Business Luxe'
  when 'BOLD' then 'Business Bold' when 'MAGAZINE' then 'Business Magazine' when 'IMMERSIVE' then 'Business Immersive'
  when 'COMPACT' then 'Business Compact' end
 else name end
where active=true and layout_family in ('FOOD','RETAIL','FASHION','BOOKS','FLOWERS','HEALTH','HARDWARE','SERVICES','BEAUTY','GENERAL');

update public.local_business_categories
set recommended_preset_code='HEALTH_CLEAN'
where recommended_preset_code='HEALTH_SERVICES';

update public.local_storefront_presets
set active=false
where code='HEALTH_SERVICES';
