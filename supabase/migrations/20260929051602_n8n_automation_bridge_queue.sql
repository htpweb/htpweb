create table if not exists private.automation_bridge_settings(
  bridge_code text primary key,
  secret_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.automation_bridge_settings enable row level security;
revoke all on table private.automation_bridge_settings from public,anon,authenticated;

drop policy if exists automation_bridge_settings_deny_all
  on private.automation_bridge_settings;
create policy automation_bridge_settings_deny_all
  on private.automation_bridge_settings
  for all to public
  using (false)
  with check (false);

create table if not exists private.automation_jobs(
  id uuid primary key default gen_random_uuid(),
  bridge_code text not null default 'N8N',
  delivery_id uuid references public.deliveries(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  local_id uuid references public.locals(id) on delete cascade,
  driver_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','DONE','FAILED','CANCELLED')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_jobs_poll
  on private.automation_jobs(bridge_code,status,available_at,created_at);

create index if not exists idx_automation_jobs_order
  on private.automation_jobs(order_id,created_at desc);

alter table private.automation_jobs enable row level security;
revoke all on table private.automation_jobs from public,anon,authenticated;

drop policy if exists automation_jobs_deny_all on private.automation_jobs;
create policy automation_jobs_deny_all
  on private.automation_jobs
  for all to public
  using (false)
  with check (false);

create or replace function private.automation_bridge_authorized(p_bridge_code text default 'N8N')
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_headers jsonb;
  v_secret text;
  v_hash text;
begin
  begin
    v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    v_headers:='{}'::jsonb;
  end;

  v_secret:=coalesce(v_headers->>'x-htpweb-automation-secret','');
  if length(v_secret)<32 then
    return false;
  end if;

  select s.secret_hash
  into v_hash
  from private.automation_bridge_settings s
  where upper(s.bridge_code)=upper(coalesce(p_bridge_code,'N8N'))
    and s.active=true
  limit 1;

  return v_hash is not null
    and v_hash=encode(extensions.digest(v_secret,'sha256'),'hex');
end;
$function$;

revoke all on function private.automation_bridge_authorized(text)
from public,anon,authenticated;

create or replace function private.enqueue_automation_job(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_delivery_id uuid default null,
  p_order_id uuid default null,
  p_local_id uuid default null,
  p_driver_user_id uuid default null,
  p_available_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
begin
  insert into private.automation_jobs(
    bridge_code,delivery_id,order_id,local_id,driver_user_id,
    event_type,payload,status,attempts,available_at,created_at,updated_at
  )
  values(
    'N8N',p_delivery_id,p_order_id,p_local_id,p_driver_user_id,
    upper(trim(p_event_type)),coalesce(p_payload,'{}'::jsonb),
    'PENDING',0,coalesce(p_available_at,now()),now(),now()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.enqueue_automation_job(text,jsonb,uuid,uuid,uuid,uuid,timestamptz)
from public,anon,authenticated;

create or replace function public.automation_claim_jobs(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rows jsonb;
begin
  if not private.automation_bridge_authorized('N8N') then
    raise exception 'HTPWEB: automation bridge unauthorized';
  end if;

  with picked as (
    select j.id
    from private.automation_jobs j
    where j.bridge_code='N8N'
      and j.status='PENDING'
      and j.available_at<=now()
    order by j.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  ),
  claimed as (
    update private.automation_jobs j
    set status='PROCESSING',
        attempts=j.attempts+1,
        locked_at=now(),
        updated_at=now()
    from picked
    where j.id=picked.id
    returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'event_type',c.event_type,
    'delivery_id',c.delivery_id,
    'order_id',c.order_id,
    'local_id',c.local_id,
    'driver_user_id',c.driver_user_id,
    'payload',c.payload,
    'attempts',c.attempts,
    'created_at',c.created_at
  ) order by c.created_at),'[]'::jsonb)
  into v_rows
  from claimed c;

  return jsonb_build_object(
    'ok',true,
    'jobs',v_rows,
    'claimed_at',now()
  );
end;
$function$;

revoke all on function public.automation_claim_jobs(integer) from public;
grant execute on function public.automation_claim_jobs(integer)
to anon,authenticated,service_role;

create or replace function public.automation_complete_job(
  p_job_id uuid,
  p_ok boolean default true,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.automation_bridge_authorized('N8N') then
    raise exception 'HTPWEB: automation bridge unauthorized';
  end if;

  update private.automation_jobs
  set status=case when coalesce(p_ok,false) then 'DONE'
                  when attempts>=5 then 'FAILED'
                  else 'PENDING' end,
      completed_at=case when coalesce(p_ok,false) or attempts>=5 then now() else null end,
      available_at=case when not coalesce(p_ok,false) and attempts<5
                        then now()+make_interval(mins=>least(30,greatest(1,attempts*2)))
                        else available_at end,
      locked_at=null,
      last_error=case when coalesce(p_ok,false) then null else left(coalesce(p_error,'Unknown automation error'),1000) end,
      updated_at=now()
  where id=p_job_id
    and bridge_code='N8N'
    and status='PROCESSING';

  return found;
end;
$function$;

revoke all on function public.automation_complete_job(uuid,boolean,text) from public;
grant execute on function public.automation_complete_job(uuid,boolean,text)
to anon,authenticated,service_role;

create or replace function public.automation_bridge_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_pending bigint;
  v_processing bigint;
begin
  if not private.automation_bridge_authorized('N8N') then
    raise exception 'HTPWEB: automation bridge unauthorized';
  end if;

  select count(*) filter(where status='PENDING'),
         count(*) filter(where status='PROCESSING')
  into v_pending,v_processing
  from private.automation_jobs
  where bridge_code='N8N';

  return jsonb_build_object(
    'ok',true,
    'bridge','N8N',
    'pending',v_pending,
    'processing',v_processing,
    'server_time',now()
  );
end;
$function$;

revoke all on function public.automation_bridge_health() from public;
grant execute on function public.automation_bridge_health()
to anon,authenticated,service_role;
