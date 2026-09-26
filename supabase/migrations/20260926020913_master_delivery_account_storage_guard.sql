create or replace function public.master_prepare_user_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_is_target_master boolean := false;
  v_blockers jsonb := '[]'::jsonb;
  v_count bigint;
  r record;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if p_user_id is null then raise exception 'HTPWEB: usuario inválido'; end if;
  if p_user_id=auth.uid() then
    raise exception 'HTPWEB: MASTER no puede eliminar su propia cuenta desde este módulo';
  end if;

  select exists(
    select 1 from public.profiles p
    join public.roles ro on ro.id=p.role_id
    where p.id=p_user_id and ro.code='MASTER'
  ) into v_is_target_master;
  if v_is_target_master then
    raise exception 'HTPWEB: una cuenta MASTER no puede eliminarse desde DELIVERY';
  end if;

  if exists(
    select 1
    from public.order_driver_assignments oda
    join public.orders o on o.id=oda.order_id
    where oda.driver_user_id=p_user_id
      and oda.status='ACTIVE'
      and oda.unassigned_at is null
      and o.status in ('READY','EN_ROUTE')
  ) then
    raise exception 'HTPWEB: el usuario tiene entregas activas y no puede eliminarse';
  end if;

  select count(*) into v_count
  from storage.objects o
  where o.owner_id=p_user_id::text or o.owner=p_user_id;
  if v_count>0 then
    v_blockers=v_blockers || jsonb_build_array(jsonb_build_object(
      'table','storage.objects','column','owner','rows',v_count
    ));
  end if;

  for r in
    select src_ns.nspname source_schema,src.relname source_table,
           src_att.attname source_column,con.confdeltype delete_type
    from pg_constraint con
    join pg_class target on target.oid=con.confrelid
    join pg_namespace target_ns on target_ns.oid=target.relnamespace
    join pg_class src on src.oid=con.conrelid
    join pg_namespace src_ns on src_ns.oid=src.relnamespace
    join lateral unnest(con.conkey) with ordinality ck(attnum,ord) on true
    join lateral unnest(con.confkey) with ordinality fk(attnum,ord) on fk.ord=ck.ord
    join pg_attribute src_att on src_att.attrelid=src.oid and src_att.attnum=ck.attnum
    join pg_attribute target_att on target_att.attrelid=target.oid and target_att.attnum=fk.attnum
    where con.contype='f'
      and target_ns.nspname='public'
      and target.relname='profiles'
      and target_att.attname='id'
      and array_length(con.conkey,1)=1
      and array_length(con.confkey,1)=1
  loop
    if (r.source_schema='public' and r.source_table in ('user_deliveries','user_locals','notifications','driver_live_locations'))
       or (r.source_schema='public' and r.source_table='delivery_access_authorizations' and r.source_column='claimed_by') then
      continue;
    end if;
    if r.delete_type='n' then continue; end if;

    execute format('select count(*) from %I.%I where %I=$1',
      r.source_schema,r.source_table,r.source_column)
    into v_count using p_user_id;

    if v_count>0 then
      v_blockers=v_blockers || jsonb_build_array(jsonb_build_object(
        'table',r.source_schema||'.'||r.source_table,
        'column',r.source_column,
        'rows',v_count
      ));
    end if;
  end loop;

  if jsonb_array_length(v_blockers)>0 then
    return jsonb_build_object('ok',false,'reason','HISTORY_PROTECTED','blockers',v_blockers);
  end if;

  update public.delivery_access_authorizations
  set status='REVOKED',
      revoked_by=coalesce(revoked_by,auth.uid()),
      revoked_at=coalesce(revoked_at,now()),
      claimed_by=null,
      updated_at=now()
  where claimed_by=p_user_id;

  delete from public.user_deliveries where user_id=p_user_id;
  delete from public.user_locals where user_id=p_user_id;
  delete from public.notifications where user_id=p_user_id;
  delete from public.driver_live_locations where driver_user_id=p_user_id;

  return jsonb_build_object('ok',true,'blockers','[]'::jsonb);
end;
$function$;

revoke all on function public.master_prepare_user_account_deletion(uuid) from public;
grant execute on function public.master_prepare_user_account_deletion(uuid) to authenticated;
