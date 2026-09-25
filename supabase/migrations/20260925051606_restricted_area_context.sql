
create or replace function public.delivery_restricted_area_context(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_zones jsonb;
  v_areas jsonb;
  v_limit integer;
begin
  if not (
    public.is_master()
    or exists(
      select 1
      from public.user_deliveries ud
      where ud.user_id=auth.uid()
        and ud.delivery_id=p_delivery_id
        and ud.active=true
    )
  )
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,
    'code',z.code,
    'name',z.name,
    'boundary',z.boundary
  ) order by z.code,lower(z.name)),'[]'::jsonb)
  into v_zones
  from public.delivery_zones dz
  join public.zones z on z.id=dz.zone_id
  where dz.delivery_id=p_delivery_id
    and dz.active=true
    and z.active=true
    and z.boundary is not null;

  v_areas:=public.delivery_restricted_areas_snapshot(p_delivery_id);
  v_limit:=public.delivery_limit_value(
    p_delivery_id,
    'restricted_areas.active.max'
  );

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'zones',coalesce(v_zones,'[]'::jsonb),
    'areas',coalesce(v_areas,'[]'::jsonb),
    'limit',v_limit,
    'used',(
      select count(*)
      from public.delivery_restricted_areas a
      where a.delivery_id=p_delivery_id
        and a.active=true
    ),
    'schedule_enabled',
      public.delivery_has_capability(
        p_delivery_id,
        'restricted_areas.schedule'
      )
  );
end;
$$;

revoke all on function public.delivery_restricted_area_context(uuid)
  from public,anon;
grant execute on function public.delivery_restricted_area_context(uuid)
  to authenticated;
