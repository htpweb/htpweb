revoke execute on function public.delivery_customer_access_mode_at(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.delivery_customer_access_mode_at(uuid,timestamptz)
  to service_role;

revoke execute on function public.delivery_limit_value_legacy(uuid,text)
  from public,anon,authenticated;
grant execute on function public.delivery_limit_value_legacy(uuid,text)
  to service_role;

revoke execute on function public.delivery_restricted_areas_snapshot(uuid)
  from public,anon,authenticated;
grant execute on function public.delivery_restricted_areas_snapshot(uuid)
  to service_role;

revoke execute on function public.sync_my_plan_notifications()
  from public,anon,authenticated;
grant execute on function public.sync_my_plan_notifications()
  to service_role;
