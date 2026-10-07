begin;

drop function if exists public.my_business_plans_and_subscriptions();
drop function if exists public.switch_my_business_account_mode(text,uuid);
drop function if exists public.my_business_account_modes();
drop function if exists public.current_business_account_context();
drop function if exists public.submit_business_claim(uuid,jsonb);
drop function if exists public.prepare_business_claim_challenge(uuid);
drop function if exists public.business_claim_context(uuid);
drop function if exists public.my_business_claims();
drop function if exists public.create_direct_business_order(uuid,text,text,text,text,numeric,numeric,boolean,text,text,text,text,text,jsonb);
drop function if exists public.create_direct_business_order(uuid,text,text,text,text,text,jsonb);
drop function if exists public.record_business_storefront_event(text,uuid,uuid,text,text,jsonb);
drop function if exists public.public_business_storefront(text);
drop function if exists public.public_business_blog_posts(uuid);
drop function if exists public.public_list_business_gallery(uuid);
drop function if exists public.public_business_promotions_catalog(uuid);
drop function if exists public.public_business_menu_pages(uuid);
drop function if exists public.public_business_inventory(uuid);
drop function if exists public.public_businesses_order_availability(uuid[],timestamptz);
drop function if exists public.public_business_claim_state(uuid);

commit;
