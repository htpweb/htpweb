begin;

do $$
declare
  sig regprocedure;
begin
  foreach sig in array[
    'public.user_is_business_admin_for(uuid)'::regprocedure,
    'public.user_can_manage_business_resource(uuid,text,text)'::regprocedure,
    'public.convert_profile_to_business_admin(uuid,boolean)'::regprocedure,
    'public.master_list_businesses()'::regprocedure,
    'public.master_set_business_active(uuid,boolean)'::regprocedure,
    'public.master_set_businesses_active(uuid[],boolean)'::regprocedure,
    'public.master_delete_business(uuid,text)'::regprocedure,
    'public.master_assign_business_admin(uuid,uuid,boolean)'::regprocedure,
    'public.master_unassign_business_admin(uuid,uuid)'::regprocedure,
    'public.master_assign_business_plan(uuid,uuid,timestamptz)'::regprocedure,
    'public.master_set_business_categories(uuid,uuid[])'::regprocedure,
    'public.master_set_business_capability(uuid,text,boolean)'::regprocedure,
    'public.master_set_business_menu_design(uuid,text)'::regprocedure,
    'public.master_apply_business_request(uuid,boolean)'::regprocedure,
    'public.master_review_business_request(uuid,text,text,uuid)'::regprocedure,
    'public.master_list_business_plans()'::regprocedure,
    'public.master_list_business_categories()'::regprocedure,
    'public.update_my_business_content(uuid,text,text,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.business_commerce_snapshot(uuid)'::regprocedure,
    'public.my_business_storefront_design_options(uuid)'::regprocedure,
    'public.my_business_delivery_options(uuid)'::regprocedure,
    'public.my_business_domain_snapshot(uuid)'::regprocedure,
    'public.request_business_delivery_partnership(uuid,uuid,text)'::regprocedure,
    'public.my_business_social_content(uuid)'::regprocedure,
    'public.my_business_inventory_snapshot(uuid)'::regprocedure,
    'public.request_my_business_domain(uuid,text,text)'::regprocedure,
    'public.cancel_my_business_domain_request(uuid)'::regprocedure,
    'public.list_my_business_blog_posts(uuid)'::regprocedure,
    'public.delete_my_business_blog_post(uuid,uuid)'::regprocedure,
    'public.list_business_gallery(uuid)'::regprocedure,
    'public.master_list_business_domain_requests()'::regprocedure,
    'public.master_list_business_subscriptions()'::regprocedure,
    'public.master_list_business_subscription_payments()'::regprocedure,
    'public.business_subscription_payment_settings()'::regprocedure,
    'public.business_my_plan_summary(uuid)'::regprocedure,
    'public.my_business_claims()'::regprocedure,
    'public.business_claim_context(uuid)'::regprocedure,
    'public.prepare_business_claim_challenge(uuid)'::regprocedure,
    'public.current_business_account_context()'::regprocedure,
    'public.my_business_account_modes()'::regprocedure,
    'public.my_business_plans_and_subscriptions()'::regprocedure
  ]
  loop
    execute format('revoke execute on function %s from public',sig);
    execute format('grant execute on function %s to authenticated,service_role',sig);
  end loop;
end
$$;

revoke execute on function public.master_save_business_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) from public;
revoke execute on function public.master_update_business_domain_request(uuid,text,numeric,text,timestamptz,boolean,boolean,text) from public;
revoke execute on function public.master_review_business_transfer_payment(uuid,boolean,text) from public;
revoke execute on function public.business_create_subscription_payment(uuid,uuid,text) from public;
revoke execute on function public.activate_business_plan_from_payment(uuid,text) from public;
revoke execute on function public.save_my_business_commerce_settings(uuid,boolean,text,text,text,text,boolean,boolean,boolean,uuid,text,text) from public;
revoke execute on function public.save_my_business_storefront_content(uuid,text,jsonb) from public;
revoke execute on function public.save_my_business_social_content(uuid,uuid,text,text,uuid,uuid,text,text,boolean) from public;
revoke execute on function public.save_my_business_inventory(uuid,uuid,uuid,boolean,integer,integer) from public;
revoke execute on function public.save_my_business_blog_post(uuid,uuid,text,text,text,text,boolean) from public;
revoke execute on function public.save_business_category(uuid,uuid,text,text,text,integer,boolean) from public;
revoke execute on function public.save_business_product(uuid,uuid,uuid,text,text,numeric,text,integer,boolean) from public;
revoke execute on function public.save_business_product_presentation(uuid,uuid,numeric,text,text,text,boolean) from public;
revoke execute on function public.save_business_promotion_v3(uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean,text,numeric,jsonb) from public;
revoke execute on function public.save_business_schedule_week(uuid,jsonb) from public;
revoke execute on function public.save_business_gallery_image(uuid,uuid,text,text,integer) from public;
revoke execute on function public.delete_business_gallery_image(uuid,uuid) from public;
revoke execute on function public.submit_business_claim(uuid,jsonb) from public;
revoke execute on function public.switch_my_business_account_mode(text,uuid) from public;

commit;
