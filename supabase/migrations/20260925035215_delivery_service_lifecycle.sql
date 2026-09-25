-- HTPWEB — ciclo mensual del servicio DELIVERY, bloqueo por vencimiento y recordatorios.
-- El acceso administrativo depende de un periodo de servicio vigente.
-- MASTER define inicio/fin o renueva un mes calendario.
-- Cinco días antes del vencimiento se encolan avisos por email y SMS.

create extension if not exists pg_cron with schema pg_catalog;

insert into public.subscription_plans(
  code,name,description,target_type,price,currency,billing_interval,active,display_order
)
values(
  'DELIVERY_MONTHLY',
  'Servicio mensual DELIVERY',
  'Periodo mensual de acceso administrativo para un DELIVERY.',
  'DELIVERY',
  0,
  'USD',
  'MONTH',
  true,
  10
)
on conflict(code) do update
set name=excluded.name,
    description=excluded.description,
    target_type='DELIVERY',
    billing_interval='MONTH',
    active=true,
    updated_at=now();

create or replace function public.delivery_service_is_active(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_delivery_id is not null
    and exists (
      select 1
      from public.plan_assignments a
      join public.subscription_plans p on p.id=a.plan_id
      where a.delivery_id=p_delivery_id
        and p.code='DELIVERY_MONTHLY'
        and p.active=true
        and a.status in ('ACTIVE','TRIAL')
        and a.starts_at<=now()
        and a.ends_at is not null
        and a.ends_at>now()
        and (a.status<>'TRIAL' or a.trial_ends_at is null or a.trial_ends_at>now())
    );
$function$;

revoke all on function public.delivery_service_is_active(uuid)
  from public,anon,authenticated;

create or replace function public.delivery_service_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_allowed boolean;
  v_current record;
  v_next record;
  v_latest record;
  v_paid_through_on date;
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_state text;
  v_days integer;
begin
  v_allowed := public.is_master()
    or exists (
      select 1
      from public.user_deliveries ud
      where ud.user_id=auth.uid()
        and ud.delivery_id=p_delivery_id
        and ud.active=true
    );

  if not v_allowed then
    raise exception 'HTPWEB: no autorizado para consultar el servicio de este DELIVERY';
  end if;

  select a.id assignment_id,p.id plan_id,p.code plan_code,p.name plan_name,
         a.status,a.starts_at,a.ends_at,a.trial_ends_at
  into v_current
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and p.code='DELIVERY_MONTHLY'
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and a.ends_at is not null
    and a.ends_at>now()
    and (a.status<>'TRIAL' or a.trial_ends_at is null or a.trial_ends_at>now())
  order by a.ends_at desc
  limit 1;

  select a.id assignment_id,p.id plan_id,p.code plan_code,p.name plan_name,
         a.status,a.starts_at,a.ends_at,a.trial_ends_at
  into v_next
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and p.code='DELIVERY_MONTHLY'
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at>now()
    and a.ends_at is not null
  order by a.starts_at asc
  limit 1;

  select a.id assignment_id,p.id plan_id,p.code plan_code,p.name plan_name,
         a.status,a.starts_at,a.ends_at,a.trial_ends_at
  into v_latest
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and p.code='DELIVERY_MONTHLY'
  order by coalesce(a.ends_at,a.starts_at) desc,a.created_at desc
  limit 1;

  select max((a.ends_at at time zone 'America/Guayaquil')::date - 1)
  into v_paid_through_on
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and p.code='DELIVERY_MONTHLY'
    and a.status in ('ACTIVE','TRIAL')
    and a.ends_at is not null
    and a.ends_at>now();

  if v_current.assignment_id is not null then
    v_days := greatest(0,v_paid_through_on-v_today);
    v_state := case when v_days<=5 then 'EXPIRING' else 'ACTIVE' end;

    return jsonb_build_object(
      'delivery_id',p_delivery_id,'state',v_state,'active',true,
      'starts_on',(v_current.starts_at at time zone 'America/Guayaquil')::date,
      'ends_on',(v_current.ends_at at time zone 'America/Guayaquil')::date-1,
      'paid_through_on',v_paid_through_on,'days_remaining',v_days,
      'expiring_soon',(v_days<=5),'assignment_id',v_current.assignment_id,
      'plan_id',v_current.plan_id,'plan_code',v_current.plan_code,'plan_name',v_current.plan_name
    );
  end if;

  if v_next.assignment_id is not null then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,'state','SCHEDULED','active',false,
      'starts_on',(v_next.starts_at at time zone 'America/Guayaquil')::date,
      'ends_on',(v_next.ends_at at time zone 'America/Guayaquil')::date-1,
      'paid_through_on',v_paid_through_on,'days_remaining',null,'expiring_soon',false,
      'assignment_id',v_next.assignment_id,'plan_id',v_next.plan_id,
      'plan_code',v_next.plan_code,'plan_name',v_next.plan_name
    );
  end if;

  if v_latest.assignment_id is not null then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,'state','EXPIRED','active',false,
      'starts_on',(v_latest.starts_at at time zone 'America/Guayaquil')::date,
      'ends_on',case when v_latest.ends_at is null then null else (v_latest.ends_at at time zone 'America/Guayaquil')::date-1 end,
      'paid_through_on',case when v_latest.ends_at is null then null else (v_latest.ends_at at time zone 'America/Guayaquil')::date-1 end,
      'days_remaining',0,'expiring_soon',false,'assignment_id',v_latest.assignment_id,
      'plan_id',v_latest.plan_id,'plan_code',v_latest.plan_code,'plan_name',v_latest.plan_name
    );
  end if;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'state','NOT_CONFIGURED','active',false,
    'starts_on',null,'ends_on',null,'paid_through_on',null,'days_remaining',null,
    'expiring_soon',false,'assignment_id',null,'plan_id',null,
    'plan_code','DELIVERY_MONTHLY','plan_name','Servicio mensual DELIVERY'
  );
end;
$function$;

revoke all on function public.delivery_service_snapshot(uuid) from public,anon;
grant execute on function public.delivery_service_snapshot(uuid) to authenticated;

create or replace function public.master_set_delivery_service_period(
  p_delivery_id uuid,p_start_date date,p_end_date date
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
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
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
  where p.code='DELIVERY_MONTHLY' and p.active=true limit 1;
  if v_plan_id is null then raise exception 'HTPWEB: plan mensual DELIVERY no disponible'; end if;

  v_start := p_start_date::timestamp at time zone 'America/Guayaquil';
  v_end := (p_end_date+1)::timestamp at time zone 'America/Guayaquil';

  update public.plan_assignments a
  set status='CANCELLED',
      ends_at=least(coalesce(a.ends_at,v_start),v_start),
      updated_at=now()
  where a.delivery_id=p_delivery_id
    and a.plan_id=v_plan_id
    and a.status in ('ACTIVE','TRIAL','PAST_DUE')
    and a.starts_at<v_end;

  insert into public.plan_assignments(
    plan_id,delivery_id,local_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata
  )
  values(
    v_plan_id,p_delivery_id,null,'ACTIVE',v_start,v_end,null,auth.uid(),
    jsonb_build_object('service_period',true,'starts_on',p_start_date,'ends_on',p_end_date,'source','MASTER')
  );

  return public.delivery_service_snapshot(p_delivery_id);
end;
$function$;

revoke all on function public.master_set_delivery_service_period(uuid,date,date) from public,anon;
grant execute on function public.master_set_delivery_service_period(uuid,date,date) to authenticated;

create or replace function public.master_renew_delivery_service_month(p_delivery_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_plan_id uuid;
  v_last_end timestamptz;
  v_start timestamptz;
  v_start_on date;
  v_end_on date;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select p.id into v_plan_id
  from public.subscription_plans p
  where p.code='DELIVERY_MONTHLY' and p.active=true limit 1;

  select max(a.ends_at) into v_last_end
  from public.plan_assignments a
  where a.delivery_id=p_delivery_id
    and a.plan_id=v_plan_id
    and a.status in ('ACTIVE','TRIAL')
    and a.ends_at is not null
    and a.ends_at>now();

  if v_last_end is null then
    v_start_on := (now() at time zone 'America/Guayaquil')::date;
    v_end_on := (v_start_on + interval '1 month')::date;
    v_start := v_start_on::timestamp at time zone 'America/Guayaquil';
  else
    v_start := v_last_end;
    v_start_on := (v_last_end at time zone 'America/Guayaquil')::date;
    v_end_on := ((v_start_on-1) + interval '1 month')::date;
  end if;

  insert into public.plan_assignments(
    plan_id,delivery_id,local_id,status,starts_at,ends_at,trial_ends_at,assigned_by,metadata
  )
  values(
    v_plan_id,p_delivery_id,null,'ACTIVE',v_start,
    (v_end_on+1)::timestamp at time zone 'America/Guayaquil',
    null,auth.uid(),
    jsonb_build_object('service_period',true,'renewal',true,'starts_on',v_start_on,'ends_on',v_end_on,'source','MASTER_RENEW_1_MONTH')
  );

  return public.delivery_service_snapshot(p_delivery_id);
end;
$function$;

revoke all on function public.master_renew_delivery_service_month(uuid) from public,anon;
grant execute on function public.master_renew_delivery_service_month(uuid) to authenticated;

create or replace function public.my_delivery_service_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'role',public.current_role_code(),
    'has_delivery_link',exists(
      select 1 from public.user_deliveries ud where ud.user_id=auth.uid() and ud.active=true
    ),
    'has_active_service',exists(
      select 1 from public.user_deliveries ud
      where ud.user_id=auth.uid() and ud.active=true
        and public.delivery_service_is_active(ud.delivery_id)
    ),
    'deliveries',coalesce((
      select jsonb_agg(
        public.delivery_service_snapshot(ud.delivery_id)
        || jsonb_build_object('name',d.name,'slug',d.slug)
        order by d.name
      )
      from public.user_deliveries ud
      join public.deliveries d on d.id=ud.delivery_id
      where ud.user_id=auth.uid() and ud.active=true and d.active=true
    ),'[]'::jsonb)
  )
  where auth.uid() is not null;
$function$;

revoke all on function public.my_delivery_service_access() from public,anon;
grant execute on function public.my_delivery_service_access() to authenticated;

create or replace function public.user_has_delivery(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_master()
    or exists (
      select 1
      from public.profiles p
      join public.user_deliveries ud on ud.user_id=p.id
      join public.deliveries d on d.id=ud.delivery_id
      where p.id=auth.uid()
        and p.active=true
        and ud.delivery_id=p_delivery_id
        and ud.active=true
        and d.active=true
        and public.delivery_service_is_active(p_delivery_id)
    );
$function$;

create table if not exists public.delivery_service_notifications(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  assignment_id uuid references public.plan_assignments(id) on delete set null,
  channel text not null check(channel in ('EMAIL','SMS')),
  recipient text not null,
  representative_name text,
  service_end_on date not null,
  notification_type text not null default 'EXPIRY_5_DAYS'
    check(notification_type in ('EXPIRY_5_DAYS')),
  status text not null default 'PENDING'
    check(status in ('PENDING','PROCESSING','RETRY','SENT','SKIPPED')),
  attempts integer not null default 0 check(attempts>=0),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(delivery_id,service_end_on,channel,recipient,notification_type)
);

create index if not exists delivery_service_notifications_pending_idx
  on public.delivery_service_notifications(status,scheduled_for);

alter table public.delivery_service_notifications enable row level security;
revoke all on table public.delivery_service_notifications from anon,authenticated;

create or replace function public.queue_delivery_service_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_count integer := 0;
begin
  with coverage as (
    select a.delivery_id,max(a.ends_at) max_ends_at
    from public.plan_assignments a
    join public.subscription_plans p on p.id=a.plan_id
    where p.code='DELIVERY_MONTHLY'
      and a.status in ('ACTIVE','TRIAL')
      and a.ends_at is not null and a.ends_at>now()
    group by a.delivery_id
  ),
  due as (
    select c.delivery_id,
      (select a2.id
       from public.plan_assignments a2
       join public.subscription_plans p2 on p2.id=a2.plan_id
       where a2.delivery_id=c.delivery_id and p2.code='DELIVERY_MONTHLY' and a2.ends_at=c.max_ends_at
       order by a2.created_at desc limit 1) assignment_id,
      (c.max_ends_at at time zone 'America/Guayaquil')::date-1 service_end_on
    from coverage c
    where ((c.max_ends_at at time zone 'America/Guayaquil')::date-1)=v_today+5
  ),
  recipients as (
    select distinct on (d.delivery_id,a.email)
      d.delivery_id,d.assignment_id,d.service_end_on,a.representative_name,
      lower(a.email) email,
      coalesce(nullif(trim(a.phone),''),nullif(trim(p.phone),''),nullif(trim(del.whatsapp),''),nullif(trim(del.phone),'')) phone
    from due d
    join public.delivery_access_authorizations a
      on a.delivery_id=d.delivery_id and a.status='CLAIMED' and a.role_code='DELIVERY_ADMIN'
    left join public.profiles p on p.id=a.claimed_by
    join public.deliveries del on del.id=d.delivery_id
    order by d.delivery_id,a.email,a.claimed_at desc nulls last,a.created_at desc
  ),
  inserted_email as (
    insert into public.delivery_service_notifications(
      delivery_id,assignment_id,channel,recipient,representative_name,
      service_end_on,notification_type,status,scheduled_for
    )
    select r.delivery_id,r.assignment_id,'EMAIL',r.email,r.representative_name,
      r.service_end_on,'EXPIRY_5_DAYS','PENDING',now()
    from recipients r
    where nullif(trim(r.email),'') is not null
    on conflict(delivery_id,service_end_on,channel,recipient,notification_type) do nothing
    returning 1
  ),
  inserted_sms as (
    insert into public.delivery_service_notifications(
      delivery_id,assignment_id,channel,recipient,representative_name,
      service_end_on,notification_type,status,scheduled_for
    )
    select r.delivery_id,r.assignment_id,'SMS',r.phone,r.representative_name,
      r.service_end_on,'EXPIRY_5_DAYS','PENDING',now()
    from recipients r
    where nullif(trim(r.phone),'') is not null
    on conflict(delivery_id,service_end_on,channel,recipient,notification_type) do nothing
    returning 1
  )
  select (select count(*) from inserted_email)+(select count(*) from inserted_sms)
  into v_count;

  return coalesce(v_count,0);
end;
$function$;

revoke all on function public.queue_delivery_service_expiry_reminders()
  from public,anon,authenticated;

create or replace function public.verify_delivery_reminder_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1 from vault.decrypted_secrets s
    where s.name='delivery_reminder_cron_secret'
      and s.decrypted_secret=p_secret
  );
$function$;

revoke all on function public.verify_delivery_reminder_cron_secret(text)
  from public,anon,authenticated;
grant execute on function public.verify_delivery_reminder_cron_secret(text)
  to service_role;

do $block$
begin
  if not exists(select 1 from vault.secrets where name='delivery_reminder_project_url') then
    perform vault.create_secret('https://hwfloywzqlgqieonuswl.supabase.co','delivery_reminder_project_url');
  end if;
  if not exists(select 1 from vault.secrets where name='delivery_reminder_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'delivery_reminder_cron_secret');
  end if;
end
$block$;

select cron.schedule(
  'htpweb-delivery-service-reminders',
  '0 13 * * *',
  $cron$
    select public.queue_delivery_service_expiry_reminders();
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name='delivery_reminder_project_url'
      ) || '/functions/v1/delivery-service-reminders',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-htpweb-cron-secret',(
          select decrypted_secret from vault.decrypted_secrets
          where name='delivery_reminder_cron_secret'
        )
      ),
      body := jsonb_build_object('source','pg_cron','requested_at',now()),
      timeout_milliseconds := 15000
    );
  $cron$
);
