begin;

create or replace function public.save_my_business_editor_overrides(p_business_id uuid,p_editor_overrides jsonb)
returns jsonb language sql security definer set search_path=''
as $$ select public.save_my_local_editor_overrides(p_business_id,p_editor_overrides); $$;

create or replace function public.save_my_business_services(p_business_id uuid,p_services jsonb)
returns jsonb language sql security definer set search_path=''
as $$ select public.save_my_local_services(p_business_id,p_services); $$;

create or replace function public.update_business_gallery_project(
 p_business_id uuid,p_image_id uuid,p_title text,p_description text,p_display_order integer
) returns void language sql security definer set search_path=''
as $$ select public.update_local_gallery_project(p_business_id,p_image_id,p_title,p_description,p_display_order); $$;

create or replace function public.master_save_business_category(
 p_category_id uuid,p_name text,p_description text,p_active boolean,p_sector_id uuid
) returns uuid language sql security definer set search_path=''
as $$ select public.master_save_local_business_category(p_category_id,p_name,p_description,p_active,p_sector_id); $$;

create or replace function public.master_save_business_import_v1(
 p_city_id uuid,p_business_category_id uuid,p_name text,p_description text,p_address text,
 p_latitude numeric,p_longitude numeric,p_phone text,p_whatsapp text,p_location_url text
) returns uuid language sql security definer set search_path=''
as $$ select public.master_save_local_import_v1(p_city_id,p_business_category_id,p_name,p_description,p_address,p_latitude,p_longitude,p_phone,p_whatsapp,p_location_url); $$;

create or replace function public.master_list_business_google_reviews()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.master_list_local_google_reviews(); $$;

create or replace function public.master_approve_business_google_reviews(p_business_ids uuid[],p_publish boolean)
returns jsonb language sql security definer set search_path=''
as $$ select public.master_approve_local_google_reviews(p_business_ids,p_publish); $$;

create or replace function public.bulk_import_business_catalog_v3(p_rows jsonb,p_publish boolean)
returns jsonb language sql security definer set search_path=''
as $$
  select public.bulk_import_catalog_multilocal_v3(
    (
      select coalesce(jsonb_agg(
        case when jsonb_typeof(x)='object' then
          x || jsonb_build_object('local_id',coalesce(x->'local_id',x->'business_id'))
        else x end
      ),'[]'::jsonb)
      from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
    ),
    p_publish
  );
$$;

revoke execute on function public.save_my_business_editor_overrides(uuid,jsonb) from public;
revoke execute on function public.save_my_business_services(uuid,jsonb) from public;
revoke execute on function public.update_business_gallery_project(uuid,uuid,text,text,integer) from public;
revoke execute on function public.master_save_business_category(uuid,text,text,boolean,uuid) from public;
revoke execute on function public.master_save_business_import_v1(uuid,uuid,text,text,text,numeric,numeric,text,text,text) from public;
revoke execute on function public.master_list_business_google_reviews() from public;
revoke execute on function public.master_approve_business_google_reviews(uuid[],boolean) from public;
revoke execute on function public.bulk_import_business_catalog_v3(jsonb,boolean) from public;

grant execute on function public.save_my_business_editor_overrides(uuid,jsonb) to authenticated,service_role;
grant execute on function public.save_my_business_services(uuid,jsonb) to authenticated,service_role;
grant execute on function public.update_business_gallery_project(uuid,uuid,text,text,integer) to authenticated,service_role;
grant execute on function public.master_save_business_category(uuid,text,text,boolean,uuid) to authenticated,service_role;
grant execute on function public.master_save_business_import_v1(uuid,uuid,text,text,text,numeric,numeric,text,text,text) to authenticated,service_role;
grant execute on function public.master_list_business_google_reviews() to authenticated,service_role;
grant execute on function public.master_approve_business_google_reviews(uuid[],boolean) to authenticated,service_role;
grant execute on function public.bulk_import_business_catalog_v3(jsonb,boolean) to authenticated,service_role;

commit;
