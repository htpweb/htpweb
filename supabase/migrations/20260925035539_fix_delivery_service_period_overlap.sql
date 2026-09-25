create or replace function public.master_set_delivery_service_period(
  p_delivery_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_plan_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'HTPWEB: fecha de inicio y fecha de fin son obligatorias';
  end if;

  if p_end_date<p_start_date then
    raise exception 'HTPWEB: la fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select p.id into v_plan_id
  from public.subscription_plans p
  where p.code='DELIVERY_MONTHLY' and p.active=true
  limit 1;

  if v_plan_id is null then
    raise exception 'HTPWEB: plan mensual DELIVERY no disponible';
  end if;

  v_start := p_start_date::timestamp at time zone 'America/Guayaquil';
  v_end := (p_end_date+1)::timestamp at time zone 'America/Guayaquil';

  update public.plan_assignments a
  set status='CANCELLED',
      ends_at=case
        when a.starts_at<v_start
          then greatest(a.starts_at+interval '1 second',least(coalesce(a.ends_at,v_start),v_start))
        else a.ends_at
      end,
      updated_at=now()
  where a.delivery_id=p_delivery_id
    and a.plan_id=v_plan_id
    and a.status in ('ACTIVE','TRIAL','PAST_DUE')
    and a.starts_at<v_end
    and (a.ends_at is null or a.ends_at>v_start);

  insert into public.plan_assignments(
    plan_id,delivery_id,local_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata
  )
  values(
    v_plan_id,p_delivery_id,null,'ACTIVE',v_start,v_end,null,auth.uid(),
    jsonb_build_object(
      'service_period',true,
      'starts_on',p_start_date,
      'ends_on',p_end_date,
      'source','MASTER'
    )
  );

  return public.delivery_service_snapshot(p_delivery_id);
end;
$function$;
