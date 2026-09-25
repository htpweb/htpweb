
create or replace function public.delivery_plan_snapshot(p_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_allowed boolean; v_current record; v_next record; v_entitlements jsonb; v_days integer;
begin
  v_allowed:=public.is_master() or exists(
    select 1 from public.user_deliveries ud where ud.user_id=auth.uid() and ud.delivery_id=p_delivery_id and ud.active=true
  );
  if not v_allowed then raise exception 'HTPWEB: no autorizado para consultar este plan'; end if;

  select a.*,p.code plan_code,p.name plan_name into v_current
  from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL') and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
  order by a.starts_at desc,a.created_at desc limit 1;

  select a.*,p.code plan_code,p.name plan_name into v_next
  from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL') and a.starts_at>now()
  order by a.starts_at,a.created_at limit 1;

  if v_current.id is null then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,'active',false,
      'state',case when v_next.id is not null then 'SCHEDULED' else 'NOT_CONFIGURED' end,
      'current',null,
      'next',case when v_next.id is null then null else jsonb_build_object(
        'assignment_id',v_next.id,'plan_id',v_next.plan_id,'plan_code',v_next.plan_code,
        'plan_name',coalesce(v_next.plan_name_snapshot,v_next.plan_name),
        'starts_at',v_next.starts_at,'ends_at',v_next.ends_at,'change_type',v_next.change_type
      ) end
    );
  end if;

  select coalesce(jsonb_object_agg(s.code,s.value),'{}'::jsonb) into v_entitlements
  from public.plan_assignment_entitlements s where s.assignment_id=v_current.id;

  v_days:=case when v_current.ends_at is null then null
    else greatest(0,ceil(extract(epoch from (v_current.ends_at-now()))/86400.0)::integer) end;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'active',true,
    'state',case when v_days is not null and v_days<=5 then 'EXPIRING' else 'ACTIVE' end,
    'days_remaining',v_days,'expiring_soon',coalesce(v_days<=5,false),
    'current',jsonb_build_object(
      'assignment_id',v_current.id,'plan_id',v_current.plan_id,'plan_code',v_current.plan_code,
      'plan_name',coalesce(v_current.plan_name_snapshot,v_current.plan_name),
      'price',v_current.price_snapshot,'currency',v_current.currency_snapshot,
      'duration_months',v_current.duration_months_snapshot,
      'starts_at',v_current.starts_at,'ends_at',v_current.ends_at,'change_type',v_current.change_type,
      'selection_reset_required',v_current.selection_reset_required,'entitlements',v_entitlements
    ),
    'next',case when v_next.id is null then null else jsonb_build_object(
      'assignment_id',v_next.id,'plan_id',v_next.plan_id,'plan_code',v_next.plan_code,
      'plan_name',coalesce(v_next.plan_name_snapshot,v_next.plan_name),
      'starts_at',v_next.starts_at,'ends_at',v_next.ends_at,'change_type',v_next.change_type
    ) end
  );
end $$;

create or replace function public.master_list_delivery_subscriptions()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'delivery_id',d.id,'delivery_name',d.name,'snapshot',public.delivery_plan_snapshot(d.id)
 ) order by lower(d.name)),'[]'::jsonb)
 into v from public.deliveries d;
 return v;
end $$;

create or replace function public.master_assign_commercial_plan(
  p_delivery_id uuid,p_plan_id uuid,p_effective_mode text default 'AUTO'
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_plan record; v_current record; v_current_id uuid; v_start timestamptz; v_end timestamptz;
 v_mode text:=upper(trim(coalesce(p_effective_mode,'AUTO'))); v_change text; v_downgrade boolean:=false;
 v_reset boolean:=false; v_assignment uuid;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if v_mode not in ('AUTO','NOW','NEXT_CYCLE') then raise exception 'HTPWEB: modo de vigencia inválido'; end if;
 if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then raise exception 'HTPWEB: DELIVERY inexistente o inactivo'; end if;

 select p.* into v_plan from public.subscription_plans p where p.id=p_plan_id and p.target_type='DELIVERY' and p.active=true;
 if v_plan.id is null then raise exception 'HTPWEB: plan comercial activo inexistente'; end if;

 select a.* into v_current from public.plan_assignments a
 where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL') and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
 order by a.starts_at desc,a.created_at desc limit 1;
 v_current_id:=v_current.id;

 if v_current_id is null then v_change:='NEW';
 elsif v_current.plan_id=p_plan_id then v_change:='RENEW';
 else
   select exists(
     select 1 from public.plan_assignment_entitlements olde
     left join public.plan_entitlements newe on newe.plan_id=p_plan_id and newe.entitlement_type=olde.entitlement_type and newe.code=olde.code
     where olde.assignment_id=v_current_id and (
       (olde.entitlement_type='LIMIT' and coalesce((newe.value#>>'{}')::numeric,0)<(olde.value#>>'{}')::numeric)
       or (olde.entitlement_type='CAPABILITY' and (olde.value#>>'{}')::boolean=true and coalesce((newe.value#>>'{}')::boolean,false)=false)
     )
   ) into v_downgrade;
   v_change:=case when v_downgrade then 'DOWNGRADE' else 'UPGRADE' end;
 end if;

 if v_mode='AUTO' then
   v_mode:=case when v_change in ('RENEW','DOWNGRADE') and v_current_id is not null then 'NEXT_CYCLE' else 'NOW' end;
 end if;

 update public.plan_assignments set status='CANCELLED',updated_at=now()
 where delivery_id=p_delivery_id and status in ('ACTIVE','TRIAL') and starts_at>now();

 if v_mode='NEXT_CYCLE' and v_current_id is not null and v_current.ends_at is not null then
   v_start:=v_current.ends_at;
 else
   v_start:=now();
   if v_current_id is not null then
     update public.plan_assignments set status='CANCELLED',
       ends_at=case when starts_at<now() then greatest(starts_at+interval '1 second',now()) else ends_at end,updated_at=now()
     where id=v_current_id;
   end if;
 end if;

 v_end:=v_start+make_interval(months=>v_plan.duration_months);

 if v_change='DOWNGRADE' and v_current_id is not null then
   select exists(
     select 1 from public.plan_assignment_entitlements olde
     left join public.plan_entitlements newe on newe.plan_id=p_plan_id and newe.entitlement_type='LIMIT' and newe.code=olde.code
     where olde.assignment_id=v_current_id and olde.entitlement_type='LIMIT'
       and olde.code in ('zones.active.max','drivers.active.max','operators.active.max','restricted_areas.active.max')
       and coalesce((newe.value#>>'{}')::numeric,0)<(olde.value#>>'{}')::numeric
   ) into v_reset;
 end if;

 insert into public.plan_assignments(
   plan_id,delivery_id,status,starts_at,ends_at,assigned_by,metadata,plan_name_snapshot,price_snapshot,
   currency_snapshot,duration_months_snapshot,change_type,previous_assignment_id,selection_reset_required
 ) values(
   p_plan_id,p_delivery_id,'ACTIVE',v_start,v_end,auth.uid(),jsonb_build_object('source','MASTER_PLAN_MODULE','effective_mode',v_mode),
   v_plan.name,v_plan.price,v_plan.currency,v_plan.duration_months,v_change,v_current_id,v_reset
 ) returning id into v_assignment;

 insert into public.plan_assignment_entitlements(assignment_id,entitlement_type,code,value)
 select v_assignment,e.entitlement_type,e.code,e.value from public.plan_entitlements e where e.plan_id=p_plan_id;

 return jsonb_build_object('assignment_id',v_assignment,'change_type',v_change,'effective_mode',v_mode,
   'starts_at',v_start,'ends_at',v_end,'selection_reset_required',v_reset);
end $$;

create or replace function public.delivery_service_is_active(p_delivery_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select p_delivery_id is not null and exists(
   select 1 from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
   where a.delivery_id=p_delivery_id and p.target_type='DELIVERY' and a.status in ('ACTIVE','TRIAL')
     and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
     and (a.status<>'TRIAL' or a.trial_ends_at is null or a.trial_ends_at>now())
 );
$$;

create or replace function public.delivery_service_snapshot(p_delivery_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb; c jsonb;
begin
 v:=public.delivery_plan_snapshot(p_delivery_id); c:=v->'current';
 return jsonb_build_object(
   'delivery_id',p_delivery_id,'state',v->>'state','active',coalesce((v->>'active')::boolean,false),
   'starts_on',case when c is null then null else ((c->>'starts_at')::timestamptz at time zone 'America/Guayaquil')::date end,
   'ends_on',case when c is null or c->>'ends_at' is null then null else ((c->>'ends_at')::timestamptz at time zone 'America/Guayaquil')::date end,
   'paid_through_on',case when c is null or c->>'ends_at' is null then null else ((c->>'ends_at')::timestamptz at time zone 'America/Guayaquil')::date end,
   'days_remaining',case when v->>'days_remaining' is null then null else (v->>'days_remaining')::integer end,
   'expiring_soon',coalesce((v->>'expiring_soon')::boolean,false),
   'assignment_id',case when c is null then null else (c->>'assignment_id')::uuid end,
   'plan_id',case when c is null then null else (c->>'plan_id')::uuid end,
   'plan_code',case when c is null then null else c->>'plan_code' end,
   'plan_name',case when c is null then null else c->>'plan_name' end,
   'next_plan',v->'next'
 );
end $$;

create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 delivery_id uuid references public.deliveries(id) on delete cascade,
 notification_type text not null,title text not null,message text not null,action_url text,dedupe_key text,
 read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,dedupe_key)
);
create index if not exists notifications_user_unread_idx on public.notifications(user_id,read_at,created_at desc);
alter table public.notifications enable row level security;
revoke all on table public.notifications from anon,authenticated;

create or replace function public.sync_my_plan_notifications()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer:=0;
begin
 if auth.uid() is null then return 0; end if;
 insert into public.notifications(user_id,delivery_id,notification_type,title,message,action_url,dedupe_key)
 select auth.uid(),a.delivery_id,'PLAN_EXPIRING','Tu plan vence pronto',
   'El plan '||coalesce(a.plan_name_snapshot,p.name)||' vence en '||
   greatest(0,ceil(extract(epoch from (a.ends_at-now()))/86400.0)::integer)::text||
   ' día(s). Contacta con HTPWEB para renovar.',
   '../admin/index.html','PLAN_EXPIRING:'||a.id::text
 from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
 join public.user_deliveries ud on ud.delivery_id=a.delivery_id and ud.user_id=auth.uid() and ud.active=true
 where a.status in ('ACTIVE','TRIAL') and a.starts_at<=now() and a.ends_at>now() and a.ends_at<=now()+interval '5 days'
 on conflict(user_id,dedupe_key) do nothing;
 get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.my_notifications(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v jsonb;
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 perform public.sync_my_plan_notifications();
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,'action_url',n.action_url,
   'read_at',n.read_at,'created_at',n.created_at,'delivery_id',n.delivery_id
 ) order by n.created_at desc),'[]'::jsonb)
 into v from (select * from public.notifications where user_id=auth.uid() order by created_at desc limit greatest(1,least(coalesce(p_limit,30),100))) n;
 return v;
end $$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=auth.uid();
 return found;
end $$;

do $$
declare v_job bigint;
begin
 if to_regnamespace('cron') is not null then
   select jobid into v_job from cron.job where jobname='htpweb-delivery-service-reminders' limit 1;
   if v_job is not null then perform cron.unschedule(v_job); end if;
 end if;
end $$;

drop function if exists public.queue_delivery_service_expiry_reminders();
drop function if exists public.verify_delivery_reminder_cron_secret(text);
drop table if exists public.delivery_service_notifications;

revoke all on function public.delivery_plan_snapshot(uuid) from public,anon;
revoke all on function public.master_list_delivery_subscriptions() from public,anon;
revoke all on function public.master_assign_commercial_plan(uuid,uuid,text) from public,anon;
revoke all on function public.sync_my_plan_notifications() from public,anon;
revoke all on function public.my_notifications(integer) from public,anon;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.delivery_plan_snapshot(uuid) to authenticated;
grant execute on function public.master_list_delivery_subscriptions() to authenticated;
grant execute on function public.master_assign_commercial_plan(uuid,uuid,text) to authenticated;
grant execute on function public.sync_my_plan_notifications() to authenticated;
grant execute on function public.my_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
