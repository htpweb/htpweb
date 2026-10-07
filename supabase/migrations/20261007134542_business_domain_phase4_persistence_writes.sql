begin;

-- PHASE 4: persisted BUSINESS identifiers + canonical write/permission API.
-- Additive and reversible. Legacy local_id/LOCAL_ADMIN contracts remain available.

create or replace function public.sync_business_id_legacy_local_id()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.business_id is null and new.local_id is not null then
    new.business_id := new.local_id;
  elsif new.local_id is null and new.business_id is not null then
    new.local_id := new.business_id;
  elsif new.business_id is not null and new.local_id is not null and new.business_id <> new.local_id then
    raise exception 'business_id and legacy local_id must identify the same business';
  end if;
  return new;
end
$$;

create or replace function public.sync_origin_business_id_legacy_origin_local_id()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.origin_business_id is null and new.origin_local_id is not null then
    new.origin_business_id := new.origin_local_id;
  elsif new.origin_local_id is null and new.origin_business_id is not null then
    new.origin_local_id := new.origin_business_id;
  elsif new.origin_business_id is not null and new.origin_local_id is not null and new.origin_business_id <> new.origin_local_id then
    raise exception 'origin_business_id and legacy origin_local_id must identify the same business';
  end if;
  return new;
end
$$;

alter table public.advertisements add column if not exists business_id uuid;
update public.advertisements set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.advertisements;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.advertisements for each row execute function public.sync_business_id_legacy_local_id();

alter table public.advertising_requests add column if not exists business_id uuid;
update public.advertising_requests set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.advertising_requests;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.advertising_requests for each row execute function public.sync_business_id_legacy_local_id();

alter table public.analytics_events add column if not exists business_id uuid;
update public.analytics_events set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.analytics_events;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.analytics_events for each row execute function public.sync_business_id_legacy_local_id();

alter table public.categories add column if not exists business_id uuid;
update public.categories set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.categories;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.categories for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_blog_posts add column if not exists business_id uuid;
update public.local_blog_posts set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_blog_posts;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_blog_posts for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_business_category_assignments add column if not exists business_id uuid;
update public.local_business_category_assignments set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_business_category_assignments;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_business_category_assignments for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_capabilities add column if not exists business_id uuid;
update public.local_capabilities set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_capabilities;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_capabilities for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_change_history add column if not exists business_id uuid;
update public.local_change_history set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_change_history;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_change_history for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_claim_whatsapp_otps add column if not exists business_id uuid;
update public.local_claim_whatsapp_otps set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_claim_whatsapp_otps;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_claim_whatsapp_otps for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_commerce_settings add column if not exists business_id uuid;
update public.local_commerce_settings set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_commerce_settings;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_commerce_settings for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_deliveries add column if not exists business_id uuid;
update public.local_deliveries set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_deliveries;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_deliveries for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_delivery_partnership_requests add column if not exists business_id uuid;
update public.local_delivery_partnership_requests set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_delivery_partnership_requests;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_delivery_partnership_requests for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_domain_requests add column if not exists business_id uuid;
update public.local_domain_requests set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_domain_requests;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_domain_requests for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_gallery_images add column if not exists business_id uuid;
update public.local_gallery_images set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_gallery_images;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_gallery_images for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_google_reviews add column if not exists business_id uuid;
update public.local_google_reviews set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_google_reviews;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_google_reviews for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_inventory_items add column if not exists business_id uuid;
update public.local_inventory_items set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_inventory_items;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_inventory_items for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_limits add column if not exists business_id uuid;
update public.local_limits set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_limits;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_limits for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_menu_pages add column if not exists business_id uuid;
update public.local_menu_pages set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_menu_pages;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_menu_pages for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_promotions add column if not exists business_id uuid;
update public.local_promotions set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_promotions;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_promotions for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_request_duplicates add column if not exists business_id uuid;
update public.local_request_duplicates set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_request_duplicates;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_request_duplicates for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_requests add column if not exists business_id uuid;
update public.local_requests set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_requests;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_requests for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_schedules add column if not exists business_id uuid;
update public.local_schedules set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_schedules;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_schedules for each row execute function public.sync_business_id_legacy_local_id();

alter table public.local_social_content add column if not exists business_id uuid;
update public.local_social_content set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.local_social_content;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.local_social_content for each row execute function public.sync_business_id_legacy_local_id();

alter table public.order_items add column if not exists business_id uuid;
update public.order_items set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.order_items;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.order_items for each row execute function public.sync_business_id_legacy_local_id();

alter table public.order_locals add column if not exists business_id uuid;
update public.order_locals set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.order_locals;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.order_locals for each row execute function public.sync_business_id_legacy_local_id();

alter table public.order_status_history add column if not exists business_id uuid;
update public.order_status_history set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.order_status_history;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.order_status_history for each row execute function public.sync_business_id_legacy_local_id();

alter table public.plan_assignments add column if not exists business_id uuid;
update public.plan_assignments set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.plan_assignments;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.plan_assignments for each row execute function public.sync_business_id_legacy_local_id();

alter table public.plan_entitlement_overrides add column if not exists business_id uuid;
update public.plan_entitlement_overrides set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.plan_entitlement_overrides;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.plan_entitlement_overrides for each row execute function public.sync_business_id_legacy_local_id();

alter table public.products add column if not exists business_id uuid;
update public.products set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.products;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.products for each row execute function public.sync_business_id_legacy_local_id();

alter table public.subscription_payment_requests add column if not exists business_id uuid;
update public.subscription_payment_requests set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.subscription_payment_requests;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.subscription_payment_requests for each row execute function public.sync_business_id_legacy_local_id();

alter table public.user_locals add column if not exists business_id uuid;
update public.user_locals set business_id=local_id where business_id is null and local_id is not null;
drop trigger if exists trg_sync_business_id on public.user_locals;
create trigger trg_sync_business_id before insert or update of local_id,business_id on public.user_locals for each row execute function public.sync_business_id_legacy_local_id();

alter table public.orders add column if not exists origin_business_id uuid;
update public.orders set origin_business_id=origin_local_id where origin_business_id is null and origin_local_id is not null;
drop trigger if exists trg_sync_origin_business_id on public.orders;
create trigger trg_sync_origin_business_id before insert or update of origin_local_id,origin_business_id on public.orders for each row execute function public.sync_origin_business_id_legacy_origin_local_id();

create index if not exists idx_products_business_id on public.products(business_id);
create index if not exists idx_categories_business_id on public.categories(business_id);
create index if not exists idx_local_deliveries_business_id on public.local_deliveries(business_id);
create index if not exists idx_user_locals_business_id on public.user_locals(business_id);
create index if not exists idx_order_items_business_id on public.order_items(business_id);
create index if not exists idx_order_locals_business_id on public.order_locals(business_id);
create index if not exists idx_orders_origin_business_id on public.orders(origin_business_id);
create index if not exists idx_plan_assignments_business_id on public.plan_assignments(business_id);

create or replace view public.businesses with (security_invoker=true) as
select l.*,l.id as business_id from public.locals l;

create or replace view public.business_products with (security_invoker=true) as select p.* from public.products p;
create or replace view public.business_categories with (security_invoker=true) as select c.* from public.categories c;
create or replace view public.business_order_items with (security_invoker=true) as select oi.* from public.order_items oi;
create or replace view public.business_orders with (security_invoker=true) as select o.* from public.orders o;
create or replace view public.user_businesses with (security_invoker=true) as
select ul.user_id,ul.business_id,ul.local_id as legacy_local_id,ul.active,ul.created_at
from public.user_locals ul;
create or replace view public.business_deliveries with (security_invoker=true) as
select ld.business_id,ld.local_id as legacy_local_id,ld.delivery_id,ld.active,ld.created_at,
       ld.share_code,ld.share_tiny_url,ld.share_tiny_url_created_at,ld.public_share_code
from public.local_deliveries ld;

create or replace function public.user_is_business_admin_for(p_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select public.user_is_local_admin_for(p_business_id); $$;

create or replace function public.user_can_manage_business_resource(
  p_business_id uuid,p_permission_code text,p_capability_code text
) returns boolean language sql stable security definer set search_path=''
as $$ select public.user_can_manage_local_resource(p_business_id,p_permission_code,p_capability_code); $$;

create or replace function public.convert_profile_to_business_admin(p_user_id uuid,p_convert_customer boolean)
returns void language sql security definer set search_path=''
as $$ select public.convert_profile_to_local_admin(p_user_id,p_convert_customer); $$;

create or replace function public.master_list_businesses()
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(
    case when jsonb_typeof(x)='object' then
      (x-'local_id'-'local_name'-'local_slug') ||
      jsonb_build_object(
        'business_id',coalesce(x->'business_id',x->'local_id',x->'id'),
        'business_name',coalesce(x->'business_name',x->'local_name',x->'name'),
        'business_slug',coalesce(x->'business_slug',x->'local_slug',x->'slug')
      )
    else x end
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(public.master_list_locals(),'[]'::jsonb)) x;
$$;

create or replace function public.master_save_business_v3(
 p_business_id uuid,p_city_id uuid,p_zone_id uuid,p_business_category_id uuid,p_name text,p_slug text,
 p_description text,p_address text,p_latitude numeric,p_longitude numeric,p_phone text,p_whatsapp text,
 p_google_place_id text,p_google_maps_url text,p_location_source text,p_active boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.master_save_local_v3(p_business_id,p_city_id,p_zone_id,p_business_category_id,p_name,p_slug,p_description,p_address,p_latitude,p_longitude,p_phone,p_whatsapp,p_google_place_id,p_google_maps_url,p_location_source,p_active); $$;

create or replace function public.master_set_business_active(p_business_id uuid,p_active boolean)
returns void language sql security definer set search_path=''
as $$ select public.master_set_local_active(p_business_id,p_active); $$;

create or replace function public.master_set_businesses_active(p_business_ids uuid[],p_active boolean)
returns jsonb language sql security definer set search_path=''
as $$ select public.master_set_locals_active(p_business_ids,p_active); $$;

create or replace function public.master_delete_business(p_business_id uuid,p_confirm_name text)
returns text language sql security definer set search_path=''
as $$ select public.master_delete_local(p_business_id,p_confirm_name); $$;

create or replace function public.master_assign_business_admin(p_user_id uuid,p_business_id uuid,p_convert_customer boolean)
returns void language sql security definer set search_path=''
as $$ select public.master_assign_local_admin(p_user_id,p_business_id,p_convert_customer); $$;

create or replace function public.master_unassign_business_admin(p_user_id uuid,p_business_id uuid)
returns void language sql security definer set search_path=''
as $$ select public.master_unassign_local_admin(p_user_id,p_business_id); $$;

create or replace function public.master_assign_business_plan(p_business_id uuid,p_plan_id uuid,p_starts_at timestamptz)
returns jsonb language sql security definer set search_path=''
as $$ select public.master_assign_local_plan(p_business_id,p_plan_id,p_starts_at); $$;

create or replace function public.master_set_business_categories(p_business_id uuid,p_category_ids uuid[])
returns jsonb language sql security definer set search_path=''
as $$ select public.master_set_local_business_categories(p_business_id,p_category_ids); $$;

create or replace function public.master_set_business_capability(p_business_id uuid,p_capability_code text,p_enabled boolean)
returns void language sql security definer set search_path=''
as $$ select public.master_set_local_capability(p_business_id,p_capability_code,p_enabled); $$;

create or replace function public.master_set_business_menu_design(p_business_id uuid,p_menu_design text)
returns text language sql security definer set search_path=''
as $$ select public.master_set_local_menu_design(p_business_id,p_menu_design); $$;

create or replace function public.master_apply_business_request(p_request_id uuid,p_convert_customer_to_business_admin boolean)
returns uuid language sql security definer set search_path=''
as $$ select public.master_apply_local_request(p_request_id,p_convert_customer_to_business_admin); $$;

create or replace function public.master_review_business_request(
 p_request_id uuid,p_status text,p_review_note text,p_possible_duplicate_business_id uuid
) returns void language sql security definer set search_path=''
as $$ select public.master_review_local_request(p_request_id,p_status,p_review_note,p_possible_duplicate_business_id); $$;

create or replace function public.master_list_business_plans()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.master_list_local_plans(); $$;

create or replace function public.master_list_business_categories()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.master_list_local_business_categories(); $$;

create or replace function public.update_my_business_content(
 p_business_id uuid,p_description text,p_banner_url text,p_logo_url text,p_phone text,p_whatsapp text,p_website_url text,
 p_instagram_url text,p_facebook_url text,p_tiktok_url text,p_telegram_url text
) returns uuid language sql security definer set search_path=''
as $$ select public.update_my_local_content(p_business_id,p_description,p_banner_url,p_logo_url,p_phone,p_whatsapp,p_website_url,p_instagram_url,p_facebook_url,p_tiktok_url,p_telegram_url); $$;

create or replace function public.business_commerce_snapshot(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.local_commerce_snapshot(p_business_id); $$;

create or replace function public.my_business_storefront_design_options(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.my_local_storefront_design_options(p_business_id); $$;

create or replace function public.my_business_delivery_options(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.my_local_delivery_options(p_business_id); $$;

create or replace function public.my_business_domain_snapshot(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.my_local_domain_snapshot(p_business_id); $$;

create or replace function public.save_my_business_commerce_settings(
 p_business_id uuid,p_storefront_enabled boolean,p_preset_code text,p_catalog_mode text,p_card_density text,
 p_order_mode text,p_pickup_enabled boolean,p_own_delivery_enabled boolean,p_htpweb_delivery_enabled boolean,
 p_primary_delivery_id uuid,p_accent_color text,p_surface_style text
) returns jsonb language sql security definer set search_path=''
as $$ select public.save_my_local_commerce_settings(p_business_id,p_storefront_enabled,p_preset_code,p_catalog_mode,p_card_density,p_order_mode,p_pickup_enabled,p_own_delivery_enabled,p_htpweb_delivery_enabled,p_primary_delivery_id,p_accent_color,p_surface_style); $$;

create or replace function public.save_my_business_storefront_content(p_business_id uuid,p_theme_code text,p_content_config jsonb)
returns jsonb language sql security definer set search_path=''
as $$ select public.save_my_local_storefront_content(p_business_id,p_theme_code,p_content_config); $$;

create or replace function public.request_business_delivery_partnership(p_business_id uuid,p_delivery_id uuid,p_note text)
returns uuid language sql security definer set search_path=''
as $$ select public.request_local_delivery_partnership(p_business_id,p_delivery_id,p_note); $$;

create or replace function public.my_business_social_content(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.my_local_social_content(p_business_id); $$;

create or replace function public.save_my_business_social_content(
 p_business_id uuid,p_content_id uuid,p_platform text,p_external_url text,p_product_id uuid,p_promotion_id uuid,
 p_campaign_code text,p_title text,p_active boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.save_my_local_social_content(p_business_id,p_content_id,p_platform,p_external_url,p_product_id,p_promotion_id,p_campaign_code,p_title,p_active); $$;

create or replace function public.my_business_inventory_snapshot(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.my_local_inventory_snapshot(p_business_id); $$;

create or replace function public.save_my_business_inventory(
 p_business_id uuid,p_product_id uuid,p_variant_id uuid,p_track_stock boolean,p_available_qty integer,p_low_stock_threshold integer
) returns uuid language sql security definer set search_path=''
as $$ select public.save_my_local_inventory(p_business_id,p_product_id,p_variant_id,p_track_stock,p_available_qty,p_low_stock_threshold); $$;

create or replace function public.request_my_business_domain(p_business_id uuid,p_domain text,p_request_type text)
returns jsonb language sql security definer set search_path=''
as $$ select public.request_my_local_domain(p_business_id,p_domain,p_request_type); $$;

create or replace function public.cancel_my_business_domain_request(p_request_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select public.cancel_my_local_domain_request(p_request_id); $$;

create or replace function public.list_my_business_blog_posts(p_business_id uuid)
returns setof public.local_blog_posts language sql stable security definer set search_path=''
as $$ select * from public.list_my_local_blog_posts(p_business_id); $$;

create or replace function public.save_my_business_blog_post(
 p_business_id uuid,p_post_id uuid,p_title text,p_excerpt text,p_body text,p_image_url text,p_published boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.save_my_local_blog_post(p_business_id,p_post_id,p_title,p_excerpt,p_body,p_image_url,p_published); $$;

create or replace function public.delete_my_business_blog_post(p_business_id uuid,p_post_id uuid)
returns void language sql security definer set search_path=''
as $$ select public.delete_my_local_blog_post(p_business_id,p_post_id); $$;

create or replace function public.save_business_category(
 p_business_id uuid,p_category_id uuid,p_name text,p_description text,p_image_url text,p_display_order integer,p_active boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.save_local_category(p_business_id,p_category_id,p_name,p_description,p_image_url,p_display_order,p_active); $$;

create or replace function public.save_business_product(
 p_business_id uuid,p_product_id uuid,p_category_id uuid,p_name text,p_description text,p_price numeric,p_image_url text,p_display_order integer,p_active boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.save_local_product(p_business_id,p_product_id,p_category_id,p_name,p_description,p_price,p_image_url,p_display_order,p_active); $$;

create or replace function public.save_business_product_presentation(
 p_business_id uuid,p_product_id uuid,p_compare_price numeric,p_short_description text,p_badge_type text,p_badge_text text,p_featured boolean
) returns uuid language sql security definer set search_path=''
as $$ select public.save_local_product_presentation(p_business_id,p_product_id,p_compare_price,p_short_description,p_badge_type,p_badge_text,p_featured); $$;

create or replace function public.save_business_promotion_v3(
 p_promotion_id uuid,p_business_id uuid,p_title text,p_body text,p_image_url text,p_starts_at timestamptz,p_ends_at timestamptz,
 p_days_of_week smallint[],p_display_order integer,p_active boolean,p_promotion_type text,p_promotion_price numeric,p_items jsonb
) returns uuid language sql security definer set search_path=''
as $$ select public.save_local_promotion_v3(p_promotion_id,p_business_id,p_title,p_body,p_image_url,p_starts_at,p_ends_at,p_days_of_week,p_display_order,p_active,p_promotion_type,p_promotion_price,p_items); $$;

create or replace function public.save_business_schedule_week(p_business_id uuid,p_days jsonb)
returns integer language sql security definer set search_path=''
as $$ select public.save_local_schedule_week(p_business_id,p_days); $$;

create or replace function public.list_business_gallery(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.list_local_gallery(p_business_id); $$;

create or replace function public.save_business_gallery_image(
 p_business_id uuid,p_image_id uuid,p_image_url text,p_storage_path text,p_display_order integer
) returns uuid language sql security definer set search_path=''
as $$ select public.save_local_gallery_image(p_business_id,p_image_id,p_image_url,p_storage_path,p_display_order); $$;

create or replace function public.delete_business_gallery_image(p_business_id uuid,p_image_id uuid)
returns text language sql security definer set search_path=''
as $$ select public.delete_local_gallery_image(p_business_id,p_image_id); $$;

grant execute on function public.user_is_business_admin_for(uuid) to authenticated,service_role;
grant execute on function public.user_can_manage_business_resource(uuid,text,text) to authenticated,service_role;
grant execute on function public.convert_profile_to_business_admin(uuid,boolean) to authenticated,service_role;
grant execute on function public.master_list_businesses() to authenticated,service_role;
grant execute on function public.master_save_business_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.master_set_business_active(uuid,boolean) to authenticated,service_role;
grant execute on function public.master_set_businesses_active(uuid[],boolean) to authenticated,service_role;
grant execute on function public.master_delete_business(uuid,text) to authenticated,service_role;
grant execute on function public.master_assign_business_admin(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.master_unassign_business_admin(uuid,uuid) to authenticated,service_role;
grant execute on function public.master_assign_business_plan(uuid,uuid,timestamptz) to authenticated,service_role;
grant execute on function public.master_set_business_categories(uuid,uuid[]) to authenticated,service_role;
grant execute on function public.master_set_business_capability(uuid,text,boolean) to authenticated,service_role;
grant execute on function public.master_set_business_menu_design(uuid,text) to authenticated,service_role;
grant execute on function public.master_apply_business_request(uuid,boolean) to authenticated,service_role;
grant execute on function public.master_review_business_request(uuid,text,text,uuid) to authenticated,service_role;
grant execute on function public.master_list_business_plans() to authenticated,service_role;
grant execute on function public.master_list_business_categories() to authenticated,service_role;
grant execute on function public.update_my_business_content(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.business_commerce_snapshot(uuid) to authenticated,service_role;
grant execute on function public.my_business_storefront_design_options(uuid) to authenticated,service_role;
grant execute on function public.my_business_delivery_options(uuid) to authenticated,service_role;
grant execute on function public.my_business_domain_snapshot(uuid) to authenticated,service_role;
grant execute on function public.save_my_business_commerce_settings(uuid,boolean,text,text,text,text,boolean,boolean,boolean,uuid,text,text) to authenticated,service_role;
grant execute on function public.save_my_business_storefront_content(uuid,text,jsonb) to authenticated,service_role;
grant execute on function public.request_business_delivery_partnership(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.my_business_social_content(uuid) to authenticated,service_role;
grant execute on function public.save_my_business_social_content(uuid,uuid,text,text,uuid,uuid,text,text,boolean) to authenticated,service_role;
grant execute on function public.my_business_inventory_snapshot(uuid) to authenticated,service_role;
grant execute on function public.save_my_business_inventory(uuid,uuid,uuid,boolean,integer,integer) to authenticated,service_role;
grant execute on function public.request_my_business_domain(uuid,text,text) to authenticated,service_role;
grant execute on function public.cancel_my_business_domain_request(uuid) to authenticated,service_role;
grant execute on function public.list_my_business_blog_posts(uuid) to authenticated,service_role;
grant execute on function public.save_my_business_blog_post(uuid,uuid,text,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.delete_my_business_blog_post(uuid,uuid) to authenticated,service_role;
grant execute on function public.save_business_category(uuid,uuid,text,text,text,integer,boolean) to authenticated,service_role;
grant execute on function public.save_business_product(uuid,uuid,uuid,text,text,numeric,text,integer,boolean) to authenticated,service_role;
grant execute on function public.save_business_product_presentation(uuid,uuid,numeric,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.save_business_promotion_v3(uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean,text,numeric,jsonb) to authenticated,service_role;
grant execute on function public.save_business_schedule_week(uuid,jsonb) to authenticated,service_role;
grant execute on function public.list_business_gallery(uuid) to authenticated,service_role;
grant execute on function public.save_business_gallery_image(uuid,uuid,text,text,integer) to authenticated,service_role;
grant execute on function public.delete_business_gallery_image(uuid,uuid) to authenticated,service_role;

commit;
