-- These ten compatibility views solely exposed the obsolete commerce model.
-- RESTRICT protects against cascading removal of other database objects.
DROP VIEW IF EXISTS public.business_orders RESTRICT;
DROP VIEW IF EXISTS public.business_order_items RESTRICT;
DROP VIEW IF EXISTS public.business_products RESTRICT;
DROP VIEW IF EXISTS public.business_promotions RESTRICT;
DROP VIEW IF EXISTS public.business_promotion_items RESTRICT;
DROP VIEW IF EXISTS public.business_requests RESTRICT;
DROP VIEW IF EXISTS public.business_request_duplicates RESTRICT;
DROP VIEW IF EXISTS public.business_inventory_items RESTRICT;
DROP VIEW IF EXISTS public.business_menu_pages RESTRICT;
DROP VIEW IF EXISTS public.business_social_content RESTRICT;
