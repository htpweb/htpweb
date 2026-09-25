create or replace function public.prune_driver_location_history()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_days integer;
  v_deleted integer;
  v_total integer:=0;
begin
  delete from public.driver_live_locations l
  where not public.delivery_service_is_active(l.delivery_id)
     or not public.delivery_has_capability(l.delivery_id,'gps.live')
     or not exists(
       select 1
       from public.order_driver_assignments a
       join public.orders o on o.id=a.order_id
       where a.delivery_id=l.delivery_id
         and a.driver_user_id=l.driver_user_id
         and a.status='ACTIVE'
         and a.unassigned_at is null
         and o.status='EN_ROUTE'
     );

  get diagnostics v_deleted=row_count;
  v_total:=v_total+v_deleted;

  for v_delivery in
    select distinct h.delivery_id
    from public.driver_location_history h
  loop
    if not public.delivery_service_is_active(v_delivery.delivery_id)
       or not public.delivery_has_capability(v_delivery.delivery_id,'gps.live')
    then
      delete from public.driver_location_history
      where delivery_id=v_delivery.delivery_id;
    else
      v_days:=public.delivery_limit_value(v_delivery.delivery_id,'gps_history.days');

      if coalesce(v_days,0)<=0 then
        delete from public.driver_location_history
        where delivery_id=v_delivery.delivery_id;
      else
        delete from public.driver_location_history
        where delivery_id=v_delivery.delivery_id
          and captured_at<now()-make_interval(days=>v_days);
      end if;
    end if;

    get diagnostics v_deleted=row_count;
    v_total:=v_total+v_deleted;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.prune_driver_location_history()
  from public,anon,authenticated;
grant execute on function public.prune_driver_location_history()
  to service_role;
