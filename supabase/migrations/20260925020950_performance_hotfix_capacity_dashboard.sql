-- HTPWEB performance hotfix — RLS initplans + covering indexes for FK paths.
-- Safe/non-destructive: no rows are deleted or rewritten.

-- 1) Avoid re-evaluating auth.uid()/stable role checks once per row.
alter policy user_deliveries_select on public.user_deliveries
using ((select public.is_master()) or user_id = (select auth.uid()));

alter policy user_locals_select on public.user_locals
using ((select public.is_master()) or user_id = (select auth.uid()));

alter policy local_requests_select_authorized on public.local_requests
using (
  (select public.is_master())
  or requested_by = (select auth.uid())
  or (delivery_id is not null and public.user_has_delivery(delivery_id))
  or (local_id is not null and public.user_can_access_local(local_id))
);

alter policy plan_assignments_scoped_read on public.plan_assignments
using (
  (select public.monetization_is_master())
  or (
    delivery_id is not null
    and exists (
      select 1
      from public.user_deliveries ud
      where ud.user_id = (select auth.uid())
        and ud.delivery_id = plan_assignments.delivery_id
    )
  )
  or (
    local_id is not null
    and exists (
      select 1
      from public.user_locals ul
      where ul.user_id = (select auth.uid())
        and ul.local_id = plan_assignments.local_id
    )
  )
);

alter policy plan_entitlements_scoped_read on public.plan_entitlements
using (
  (select public.monetization_is_master())
  or exists (
    select 1
    from public.plan_assignments a
    where a.plan_id = plan_entitlements.plan_id
      and a.status = any(array['ACTIVE'::text,'TRIAL'::text,'PAST_DUE'::text])
      and (a.ends_at is null or a.ends_at > now())
      and (
        (
          a.delivery_id is not null
          and exists (
            select 1
            from public.user_deliveries ud
            where ud.user_id = (select auth.uid())
              and ud.delivery_id = a.delivery_id
          )
        )
        or
        (
          a.local_id is not null
          and exists (
            select 1
            from public.user_locals ul
            where ul.user_id = (select auth.uid())
              and ul.local_id = a.local_id
          )
        )
      )
  )
);

alter policy local_promotions_admin_select on public.local_promotions
using (
  (select public.is_master())
  or exists (
    select 1
    from public.user_locals ul
    where ul.user_id = (select auth.uid())
      and ul.local_id = local_promotions.local_id
      and ul.active = true
  )
);

alter policy local_promotion_items_admin_select on public.local_promotion_items
using (
  exists (
    select 1
    from public.local_promotions lp
    where lp.id = local_promotion_items.promotion_id
      and (
        (select public.is_master())
        or exists (
          select 1
          from public.user_locals ul
          where ul.user_id = (select auth.uid())
            and ul.local_id = lp.local_id
            and ul.active = true
        )
      )
  )
);

alter policy local_deliveries_select_authenticated on public.local_deliveries
using (
  case
    when (select public.current_role_code()) = any(array['DELIVERY_ADMIN'::text,'DELIVERY_OPERATOR'::text])
    then exists (
      select 1
      from public.user_deliveries ud
      where ud.user_id = (select auth.uid())
        and ud.delivery_id = local_deliveries.delivery_id
        and ud.active = true
        and public.htp_delivery_covers_local(local_deliveries.delivery_id, local_deliveries.local_id)
    )
    else public.local_delivery_is_public(local_id, delivery_id)
      or public.user_can_access_local(local_id)
  end
);

-- 2) Cover every foreign key currently reported by Supabase Performance Advisor.
create index if not exists idx_advertisements_created_by_fk
  on public.advertisements(created_by);

create index if not exists idx_analytics_events_advertisement_id_fk
  on public.analytics_events(advertisement_id);
create index if not exists idx_analytics_events_customer_id_fk
  on public.analytics_events(customer_id);
create index if not exists idx_analytics_events_order_id_fk
  on public.analytics_events(order_id);

create index if not exists idx_bulk_import_jobs_requested_by_fk
  on public.bulk_import_jobs(requested_by);
create index if not exists idx_bulk_import_jobs_result_local_id_fk
  on public.bulk_import_jobs(result_local_id);

create index if not exists idx_delivery_capabilities_capability_id_fk
  on public.delivery_capabilities(capability_id);
create index if not exists idx_delivery_capabilities_configured_by_fk
  on public.delivery_capabilities(configured_by);

create index if not exists idx_delivery_limits_configured_by_fk
  on public.delivery_limits(configured_by);
create index if not exists idx_delivery_limits_limit_id_fk
  on public.delivery_limits(limit_id);

create index if not exists idx_delivery_zone_requests_zone_id_fk
  on public.delivery_zone_requests(zone_id);

create index if not exists idx_local_capabilities_capability_id_fk
  on public.local_capabilities(capability_id);
create index if not exists idx_local_capabilities_configured_by_fk
  on public.local_capabilities(configured_by);

create index if not exists idx_local_change_history_changed_by_fk
  on public.local_change_history(changed_by);
create index if not exists idx_local_change_history_request_id_fk
  on public.local_change_history(request_id);

create index if not exists idx_local_google_reviews_approved_by_fk
  on public.local_google_reviews(approved_by);

create index if not exists idx_local_limits_configured_by_fk
  on public.local_limits(configured_by);
create index if not exists idx_local_limits_limit_id_fk
  on public.local_limits(limit_id);

create index if not exists idx_local_promotion_items_variant_id_fk
  on public.local_promotion_items(variant_id);

create index if not exists idx_local_request_events_actor_user_id_fk
  on public.local_request_events(actor_user_id);

create index if not exists idx_local_requests_applied_by_fk
  on public.local_requests(applied_by);
create index if not exists idx_local_requests_possible_duplicate_local_id_fk
  on public.local_requests(possible_duplicate_local_id);
create index if not exists idx_local_requests_reviewed_by_fk
  on public.local_requests(reviewed_by);

create index if not exists idx_order_status_history_actor_user_id_fk
  on public.order_status_history(actor_user_id);

create index if not exists idx_plan_entitlement_overrides_local_id_fk
  on public.plan_entitlement_overrides(local_id);
