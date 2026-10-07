begin;

create or replace function public.public_business_claim_state(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_local_claim_state(p_business_id); $$;

create or replace function public.public_businesses_order_availability(
  p_business_ids uuid[],
  p_at timestamptz default now()
)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_locals_order_availability(p_business_ids,p_at); $$;

create or replace function public.public_business_inventory(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_local_inventory(p_business_id); $$;

create or replace function public.public_business_menu_pages(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_local_menu_pages(p_business_id); $$;

create or replace function public.public_business_promotions_catalog(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_local_promotions_catalog(p_business_id); $$;

create or replace function public.public_list_business_gallery(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.public_list_local_gallery(p_business_id); $$;

create or replace function public.public_business_blog_posts(p_business_id uuid)
returns table(id uuid,title text,excerpt text,body text,image_url text,published_at timestamptz)
language sql stable security definer set search_path=''
as $$ select * from public.public_local_blog_posts(p_business_id); $$;

create or replace function public.public_business_storefront(p_business_key text)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when payload is null then null
    else (payload - 'local') || jsonb_build_object('business',payload->'local') end
  from (select public.public_local_storefront(p_business_key) payload) q;
$$;

create or replace function public.record_business_storefront_event(
  p_event_type text,p_business_id uuid,p_product_id uuid default null,
  p_session_id text default null,p_source text default 'direct',p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path=''
as $$
declare v_event text:=upper(trim(coalesce(p_event_type,'')));
begin
  if v_event='BUSINESS_VIEW' then v_event:='LOCAL_VIEW'; end if;
  perform public.record_local_storefront_event(v_event,p_business_id,p_product_id,p_session_id,p_source,p_metadata);
end
$$;

create or replace function public.create_direct_business_order(
  p_business_id uuid,p_customer_name text,p_customer_phone text,p_address text,p_notes text,p_fulfillment text,p_items jsonb
)
returns jsonb
language sql security definer set search_path=''
as $$
  select public.create_direct_local_order(p_business_id,p_customer_name,p_customer_phone,p_address,p_notes,p_fulfillment,p_items);
$$;

create or replace function public.create_direct_business_order(
  p_business_id uuid,p_customer_name text,p_customer_phone text,p_address text,p_reference text,
  p_latitude numeric,p_longitude numeric,p_requires_invoice boolean,p_document_type text,p_document_number text,
  p_invoice_email text,p_notes text,p_fulfillment text,p_items jsonb
)
returns jsonb
language sql security definer set search_path=''
as $$
  select public.create_direct_local_order(
    p_business_id,p_customer_name,p_customer_phone,p_address,p_reference,p_latitude,p_longitude,
    p_requires_invoice,p_document_type,p_document_number,p_invoice_email,p_notes,p_fulfillment,p_items
  );
$$;

create or replace function public.my_business_claims()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(
    (x - 'local_id' - 'local_name' - 'local_logo_url') ||
    jsonb_build_object(
      'business_id',x->'local_id',
      'business_name',x->'local_name',
      'business_logo_url',x->'local_logo_url'
    )
  ),'[]'::jsonb)
  from jsonb_array_elements(public.my_local_claims()) x;
$$;

create or replace function public.business_claim_context(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$ select public.claim_local_context(p_business_id); $$;

create or replace function public.prepare_business_claim_challenge(p_business_id uuid)
returns text
language sql security definer set search_path=''
as $$ select public.prepare_local_claim_challenge(p_business_id); $$;

create or replace function public.submit_business_claim(p_business_id uuid,p_evidence jsonb default '{}'::jsonb)
returns uuid
language sql security definer set search_path=''
as $$ select public.submit_local_claim(p_business_id,p_evidence); $$;

create or replace function public.current_business_account_context()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when ctx is null then null else ctx ||
    jsonb_build_object(
      'mode',case when ctx->>'mode'='LOCAL' then 'BUSINESS' else ctx->>'mode' end,
      'role_code',case when ctx->>'role_code'='LOCAL_ADMIN' then 'BUSINESS_ADMIN' else ctx->>'role_code' end
    ) end
  from (select public.current_account_context() ctx) q;
$$;

create or replace function public.my_business_account_modes()
returns jsonb
language sql stable security definer set search_path=''
as $$
  with src as (select public.my_account_modes() j),
  transformed as (select j,public.current_business_account_context() ctx from src)
  select (j - 'locals' - 'active_context' - 'current_role') ||
    jsonb_build_object(
      'businesses',coalesce(j->'locals','[]'::jsonb),
      'active_context',ctx,
      'current_role',case when j->>'current_role'='LOCAL_ADMIN' then 'BUSINESS_ADMIN' else j->>'current_role' end
    )
  from transformed;
$$;

create or replace function public.switch_my_business_account_mode(p_mode text,p_resource_id uuid default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_requested text:=upper(trim(coalesce(p_mode,''))); v_result jsonb;
begin
  v_result:=public.switch_my_account_mode(case when v_requested='BUSINESS' then 'LOCAL' else v_requested end,p_resource_id);
  if v_result is null then return null; end if;
  return v_result || jsonb_build_object(
    'mode',case when v_result->>'mode'='LOCAL' then 'BUSINESS' else v_result->>'mode' end,
    'role_code',case when v_result->>'role_code'='LOCAL_ADMIN' then 'BUSINESS_ADMIN' else v_result->>'role_code' end
  );
end
$$;

create or replace function public.my_business_plans_and_subscriptions()
returns jsonb
language sql stable security definer set search_path=''
as $$
  with src as (select public.my_plans_and_subscriptions() j),
  business_rows as (
    select coalesce(jsonb_agg(
      (x - 'local_id' - 'local_name' - 'local_slug') ||
      jsonb_build_object(
        'business_id',x->'local_id',
        'business_name',x->'local_name',
        'business_slug',x->'local_slug'
      )
    ),'[]'::jsonb) arr
    from src,jsonb_array_elements(coalesce(src.j->'locals','[]'::jsonb)) x
  )
  select (src.j - 'locals' - 'available_local_plans') ||
    jsonb_build_object(
      'businesses',business_rows.arr,
      'available_business_plans',coalesce(src.j->'available_local_plans','[]'::jsonb)
    )
  from src,business_rows;
$$;

grant execute on function public.public_business_claim_state(uuid) to anon,authenticated,service_role;
grant execute on function public.public_businesses_order_availability(uuid[],timestamptz) to anon,authenticated,service_role;
grant execute on function public.public_business_inventory(uuid) to anon,authenticated,service_role;
grant execute on function public.public_business_menu_pages(uuid) to anon,authenticated,service_role;
grant execute on function public.public_business_promotions_catalog(uuid) to anon,authenticated,service_role;
grant execute on function public.public_list_business_gallery(uuid) to anon,authenticated,service_role;
grant execute on function public.public_business_blog_posts(uuid) to anon,authenticated,service_role;
grant execute on function public.public_business_storefront(text) to anon,authenticated,service_role;
grant execute on function public.record_business_storefront_event(text,uuid,uuid,text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.create_direct_business_order(uuid,text,text,text,text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.create_direct_business_order(uuid,text,text,text,text,numeric,numeric,boolean,text,text,text,text,text,jsonb) to anon,authenticated,service_role;
grant execute on function public.my_business_claims() to authenticated,service_role;
grant execute on function public.business_claim_context(uuid) to authenticated,service_role;
grant execute on function public.prepare_business_claim_challenge(uuid) to authenticated,service_role;
grant execute on function public.submit_business_claim(uuid,jsonb) to authenticated,service_role;
grant execute on function public.current_business_account_context() to authenticated,service_role;
grant execute on function public.my_business_account_modes() to authenticated,service_role;
grant execute on function public.switch_my_business_account_mode(text,uuid) to authenticated,service_role;
grant execute on function public.my_business_plans_and_subscriptions() to authenticated,service_role;

commit;
