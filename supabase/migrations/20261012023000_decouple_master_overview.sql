-- MASTER Resumen: retire dependencies on archived commerce tables.
CREATE OR REPLACE FUNCTION private.master_overview_snapshot_impl(p_today_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_master() THEN RAISE EXCEPTION 'HTPWEB: operación exclusiva de MASTER'; END IF;
 IF p_today_start IS NULL THEN RAISE EXCEPTION 'HTPWEB: fecha inicial requerida'; END IF;
 RETURN jsonb_build_object(
 'orders_today',0,'delivered_today_count',0,'delivered_today_value',0,'open_orders',0,
 'locals_total',0,'locals_active',0,'products_total',0,'products_active',0,'products_with_image',0,
 'deliveries_total',0,'deliveries_active',0,'pending_requests',0,'customers_total',0,
 'active_promotions',0,'recent_orders','[]'::jsonb,
 'resource',jsonb_build_object('legacy_commerce_archived',true),
 'zones_total',(SELECT count(*) FROM public.zones),
 'categories_total',(SELECT count(*) FROM public.local_business_categories),
 'storefront_presets_total',(SELECT count(*) FROM public.local_storefront_presets),
 'sectors_total',(SELECT count(*) FROM public.business_sectors));
END $f$;
REVOKE ALL ON FUNCTION private.master_overview_snapshot_impl(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.master_overview_snapshot_impl(timestamptz) TO authenticated;
