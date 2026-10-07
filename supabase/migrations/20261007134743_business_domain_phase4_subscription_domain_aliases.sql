begin;

create or replace function public.master_list_business_domain_requests()
returns table(
 id uuid,business_id uuid,business_name text,business_slug text,requested_by uuid,requester_email text,
 domain text,request_type text,purchase_basis text,status text,quoted_price numeric,currency text,registrar text,
 expires_at timestamptz,dns_verified_at timestamptz,ssl_verified_at timestamptz,master_note text,created_at timestamptz,updated_at timestamptz
)
language sql stable security definer set search_path=''
as $$
 select id,local_id,local_name,local_slug,requested_by,requester_email,domain,request_type,purchase_basis,status,
        quoted_price,currency,registrar,expires_at,dns_verified_at,ssl_verified_at,master_note,created_at,updated_at
 from public.master_list_local_domain_requests();
$$;

create or replace function public.master_update_business_domain_request(
 p_request_id uuid,p_status text,p_quoted_price numeric,p_registrar text,p_expires_at timestamptz,
 p_dns_verified boolean,p_ssl_verified boolean,p_master_note text
) returns jsonb language sql security definer set search_path=''
as $$
 select public.master_update_local_domain_request(
  p_request_id,p_status,p_quoted_price,p_registrar,p_expires_at,p_dns_verified,p_ssl_verified,p_master_note
 );
$$;

create or replace function public.master_list_business_subscriptions()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.master_list_local_subscriptions(); $$;

create or replace function public.master_list_business_subscription_payments()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.master_list_local_subscription_payments(); $$;

create or replace function public.master_review_business_transfer_payment(
 p_payment_id uuid,p_approve boolean,p_note text
) returns jsonb language sql security definer set search_path=''
as $$ select public.master_review_local_transfer_payment(p_payment_id,p_approve,p_note); $$;

create or replace function public.business_subscription_payment_settings()
returns jsonb language sql stable security definer set search_path=''
as $$ select public.local_subscription_payment_settings(); $$;

create or replace function public.business_create_subscription_payment(
 p_business_id uuid,p_plan_id uuid,p_method text
) returns jsonb language sql security definer set search_path=''
as $$ select public.local_create_subscription_payment(p_business_id,p_plan_id,p_method); $$;

create or replace function public.business_my_plan_summary(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select public.local_my_plan_summary(p_business_id); $$;

create or replace function public.activate_business_plan_from_payment(
 p_payment_id uuid,p_provider_transaction_id text
) returns jsonb language sql security definer set search_path=''
as $$ select public.activate_local_plan_from_payment(p_payment_id,p_provider_transaction_id); $$;

grant execute on function public.master_list_business_domain_requests() to authenticated,service_role;
grant execute on function public.master_update_business_domain_request(uuid,text,numeric,text,timestamptz,boolean,boolean,text) to authenticated,service_role;
grant execute on function public.master_list_business_subscriptions() to authenticated,service_role;
grant execute on function public.master_list_business_subscription_payments() to authenticated,service_role;
grant execute on function public.master_review_business_transfer_payment(uuid,boolean,text) to authenticated,service_role;
grant execute on function public.business_subscription_payment_settings() to authenticated,service_role;
grant execute on function public.business_create_subscription_payment(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.business_my_plan_summary(uuid) to authenticated,service_role;
grant execute on function public.activate_business_plan_from_payment(uuid,text) to authenticated,service_role;

commit;
