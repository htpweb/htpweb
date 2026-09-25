
-- Capability-aware restricted areas and complete downgrade resource reset.

create or replace function public.ensure_delivery_plan_transition_applied(
  p_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_assignment uuid;
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

  select a.id into v_assignment
  from public.plan_assignments a
  where a.delivery_id=p_delivery_id
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
    and a.selection_reset_required=true
    and a.transition_applied_at is null
  order by a.starts_at desc,a.created_at desc
  limit 1;

  if v_assignment is null then return false; end if;

  -- Los recursos históricos se conservan; solo salen de operación.
  update public.delivery_zones
  set active=false
  where delivery_id=p_delivery_id
    and active=true;

  update public.delivery_restricted_areas
  set active=false,
      updated_at=now()
  where delivery_id=p_delivery_id
    and active=true;

  update public.plan_assignments
  set transition_applied_at=now(),
      updated_at=now()
  where id=v_assignment;

  return true;
end;
$$;

create or replace function public.delivery_location_is_restricted(
  p_delivery_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_local timestamp:=p_at at time zone 'America/Guayaquil';
  v_dow integer;
  v_prev integer;
  v_time time;
  v_schedule_enabled boolean;
begin
  if not public.delivery_has_capability(
    p_delivery_id,
    'restricted_areas.manage'
  )
  then
    return false;
  end if;

  v_schedule_enabled:=public.delivery_has_capability(
    p_delivery_id,
    'restricted_areas.schedule'
  );

  v_dow:=extract(dow from v_local)::integer;
  v_prev:=(v_dow+6)%7;
  v_time:=v_local::time;

  return exists(
    select 1
    from public.delivery_restricted_areas a
    join public.delivery_zones dz
      on dz.delivery_id=a.delivery_id
     and dz.zone_id=a.zone_id
     and dz.active=true
    where a.delivery_id=p_delivery_id
      and a.active=true
      and public.htp_zone_contains(
        a.boundary,
        p_latitude,
        p_longitude
      )
      and (
        a.restriction_mode='PERMANENT'
        or (
          a.restriction_mode='SCHEDULE'
          and v_schedule_enabled
          and exists(
            select 1
            from public.delivery_restricted_area_rules r
            where r.area_id=a.id
              and r.active=true
              and (
                (
                  r.start_time<r.end_time
                  and r.day_of_week=v_dow
                  and v_time>=r.start_time
                  and v_time<r.end_time
                )
                or (
                  r.start_time>r.end_time
                  and (
                    (
                      r.day_of_week=v_dow
                      and v_time>=r.start_time
                    )
                    or (
                      r.day_of_week=v_prev
                      and v_time<r.end_time
                    )
                  )
                )
                or (
                  r.start_time=r.end_time
                  and r.day_of_week=v_dow
                )
              )
          )
        )
      )
  );
end;
$$;
