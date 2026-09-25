create index if not exists notifications_delivery_id_idx
  on public.notifications(delivery_id)
  where delivery_id is not null;

create or replace function public.sync_my_plan_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer:=0;
  v_inserted integer:=0;
  v_days integer;
  v_key text;
  v_row record;
begin
  if auth.uid() is null then
    return 0;
  end if;

  for v_row in
    select
      a.id assignment_id,
      a.delivery_id,
      a.ends_at,
      coalesce(a.plan_name_snapshot,p.name) plan_name
    from public.plan_assignments a
    join public.subscription_plans p on p.id=a.plan_id
    join public.user_deliveries ud
      on ud.delivery_id=a.delivery_id
     and ud.user_id=auth.uid()
     and ud.active=true
    where a.status in ('ACTIVE','TRIAL')
      and a.starts_at<=now()
      and a.ends_at>now()
      and a.ends_at<=now()+interval '5 days'
      and (
        a.status<>'TRIAL'
        or a.trial_ends_at is null
        or a.trial_ends_at>now()
      )
  loop
    v_days:=greatest(
      1,
      ceil(extract(epoch from (v_row.ends_at-now()))/86400.0)::integer
    );
    v_key:='PLAN_EXPIRING:'||v_row.assignment_id::text||':'||v_days::text;

    update public.notifications n
    set read_at=coalesce(n.read_at,now())
    where n.user_id=auth.uid()
      and n.notification_type='PLAN_EXPIRING'
      and (
        n.dedupe_key='PLAN_EXPIRING:'||v_row.assignment_id::text
        or n.dedupe_key like 'PLAN_EXPIRING:'||v_row.assignment_id::text||':%'
      )
      and n.dedupe_key<>v_key
      and n.read_at is null;

    insert into public.notifications(
      user_id,delivery_id,notification_type,title,message,action_url,dedupe_key
    )
    values(
      auth.uid(),
      v_row.delivery_id,
      'PLAN_EXPIRING',
      'Tu plan vence pronto',
      'El plan '||v_row.plan_name||' vence en '||v_days::text||
      ' día(s). Contacta con HTPWEB para renovar.',
      '../admin/index.html',
      v_key
    )
    on conflict(user_id,dedupe_key) do nothing;

    get diagnostics v_inserted=row_count;
    v_count:=v_count+v_inserted;
  end loop;

  insert into public.notifications(
    user_id,delivery_id,notification_type,title,message,action_url,dedupe_key
  )
  select
    auth.uid(),
    a.delivery_id,
    'PLAN_EXPIRED',
    'Tu plan venció',
    'El plan '||coalesce(a.plan_name_snapshot,p.name)||
    ' venció. Tu cuenta CLIENT sigue activa; contacta con HTPWEB para renovar el acceso administrativo.',
    '../admin/index.html',
    'PLAN_EXPIRED:'||a.id::text
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  join public.user_deliveries ud
    on ud.delivery_id=a.delivery_id
   and ud.user_id=auth.uid()
   and ud.active=true
  where a.status in ('ACTIVE','TRIAL')
    and a.ends_at is not null
    and a.ends_at<=now()
    and a.id=(
      select a2.id
      from public.plan_assignments a2
      where a2.delivery_id=a.delivery_id
        and a2.ends_at is not null
        and a2.ends_at<=now()
      order by a2.ends_at desc,a2.created_at desc
      limit 1
    )
    and not public.delivery_service_is_active(a.delivery_id)
  on conflict(user_id,dedupe_key) do nothing;

  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;

  return v_count;
end;
$$;

revoke execute on function public.sync_my_plan_notifications() from public,anon;
grant execute on function public.sync_my_plan_notifications() to authenticated;
