create or replace function public.delivery_fee_capability_status(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not (
    public.is_master()
    or public.user_has_delivery(p_delivery_id)
  ) then
    raise exception 'HTPWEB: no autorizado para consultar las modalidades de tarifa';
  end if;

  return jsonb_build_object(
    'fixed', public.delivery_has_capability(p_delivery_id,'delivery_fees.fixed'),
    'distance', public.delivery_has_capability(p_delivery_id,'delivery_fees.distance'),
    'day_night', public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night')
  );
end;
$$;

revoke execute on function public.delivery_fee_capability_status(uuid) from public, anon;
grant execute on function public.delivery_fee_capability_status(uuid) to authenticated;

revoke execute on function public.effective_plan_entitlement(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.effective_plan_entitlement(uuid,uuid,text,text) to service_role;

revoke execute on function public.delivery_limit_value(uuid,text) from public, anon, authenticated;
grant execute on function public.delivery_limit_value(uuid,text) to service_role;

revoke execute on function public.delivery_has_capability(uuid,text) from public, anon, authenticated;
grant execute on function public.delivery_has_capability(uuid,text) to service_role;

alter function public.plan_usage_snapshot(uuid,uuid) set search_path = '';

create index if not exists customer_deliveries_referral_code_idx
  on public.customer_deliveries(referral_code_id)
  where referral_code_id is not null;

create index if not exists delivery_restricted_areas_zone_id_idx
  on public.delivery_restricted_areas(zone_id);

create index if not exists notifications_delivery_id_idx
  on public.notifications(delivery_id)
  where delivery_id is not null;

create index if not exists plan_assignments_previous_assignment_id_idx
  on public.plan_assignments(previous_assignment_id)
  where previous_assignment_id is not null;
