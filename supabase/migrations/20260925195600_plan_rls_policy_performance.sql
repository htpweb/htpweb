-- Preserve plan authorization semantics while removing duplicate permissive SELECT evaluation.
-- Each *_scoped_read policy already includes MASTER in its USING expression.
-- Therefore the previous *_master_all policy was redundant for SELECT and only needs
-- to be replaced by explicit write policies.

begin;

-- plan_assignments
drop policy if exists plan_assignments_master_all on public.plan_assignments;

create policy plan_assignments_master_insert
on public.plan_assignments
for insert
to authenticated
with check ((select public.monetization_is_master()));

create policy plan_assignments_master_update
on public.plan_assignments
for update
to authenticated
using ((select public.monetization_is_master()))
with check ((select public.monetization_is_master()));

create policy plan_assignments_master_delete
on public.plan_assignments
for delete
to authenticated
using ((select public.monetization_is_master()));

-- plan_entitlements
drop policy if exists plan_entitlements_master_all on public.plan_entitlements;

create policy plan_entitlements_master_insert
on public.plan_entitlements
for insert
to authenticated
with check ((select public.monetization_is_master()));

create policy plan_entitlements_master_update
on public.plan_entitlements
for update
to authenticated
using ((select public.monetization_is_master()))
with check ((select public.monetization_is_master()));

create policy plan_entitlements_master_delete
on public.plan_entitlements
for delete
to authenticated
using ((select public.monetization_is_master()));

-- subscription_plans
drop policy if exists subscription_plans_master_all on public.subscription_plans;

create policy subscription_plans_master_insert
on public.subscription_plans
for insert
to authenticated
with check ((select public.monetization_is_master()));

create policy subscription_plans_master_update
on public.subscription_plans
for update
to authenticated
using ((select public.monetization_is_master()))
with check ((select public.monetization_is_master()));

create policy subscription_plans_master_delete
on public.subscription_plans
for delete
to authenticated
using ((select public.monetization_is_master()));

commit;
