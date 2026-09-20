-- HTPWEB Código #88A — gestión manual de LOCAL para MASTER
-- CRUD seguro, activación y relaciones LOCAL <-> DELIVERY.

create or replace function public.master_list_locals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,
      'address',l.address,'latitude',l.latitude,'longitude',l.longitude,
      'phone',l.phone,'whatsapp',l.whatsapp,'active',l.active,
      'logo_url',l.logo_url,'banner_url',l.banner_url,
      'delivery_ids',coalesce((
        select jsonb_agg(ld.delivery_id order by ld.delivery_id)
        from public.local_deliveries ld
        where ld.local_id=l.id and ld.active=true
      ),'[]'::jsonb)
    ) order by lower(l.name),l.id
  ),'[]'::jsonb)
  from public.locals l
  where public.is_master();
$$;

create or replace function public.master_save_local(
  p_local_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text,
  p_whatsapp text,
  p_active boolean,
  p_delivery_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid:=coalesce(p_local_id,gen_random_uuid());
  v_name text:=nullif(trim(p_name),'');
  v_slug text:=lower(trim(coalesce(p_slug,'')));
  v_before jsonb;
  v_after jsonb;
  v_delivery_id uuid;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if v_name is null then raise exception 'HTPWEB: nombre del LOCAL requerido'; end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'HTPWEB: latitud y longitud deben completarse juntas';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'HTPWEB: latitud inválida'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'HTPWEB: longitud inválida'; end if;
  if coalesce(p_active,false) and (p_latitude is null or p_longitude is null) then
    raise exception 'HTPWEB: para activar el LOCAL complete latitud y longitud';
  end if;

  if v_slug='' then
    v_slug:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'));
    v_slug:=regexp_replace(v_slug,'(^-+|-+$)','','g');
  end if;
  if v_slug='' then v_slug:='local'; end if;
  if p_local_id is null then v_slug:=v_slug||'-'||substr(replace(v_id::text,'-',''),1,8); end if;

  if p_local_id is not null then
    select to_jsonb(l) into v_before from public.locals l where l.id=p_local_id for update;
    if v_before is null then raise exception 'HTPWEB: LOCAL inexistente'; end if;
  end if;

  insert into public.locals(id,zone_id,name,slug,description,address,latitude,longitude,phone,whatsapp,active,created_at,updated_at)
  values(v_id,null,v_name,v_slug,nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_address,'')),''),p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
    coalesce(p_active,false),now(),now())
  on conflict(id) do update set
    name=excluded.name,slug=excluded.slug,description=excluded.description,address=excluded.address,
    latitude=excluded.latitude,longitude=excluded.longitude,phone=excluded.phone,
    whatsapp=excluded.whatsapp,active=excluded.active,updated_at=now();

  update public.local_deliveries set active=false
  where local_id=v_id and active=true
    and not (delivery_id=any(coalesce(p_delivery_ids,'{}'::uuid[])));

  foreach v_delivery_id in array coalesce(p_delivery_ids,'{}'::uuid[])
  loop
    if not exists(select 1 from public.deliveries d where d.id=v_delivery_id) then
      raise exception 'HTPWEB: DELIVERY inválido';
    end if;
    insert into public.local_deliveries(local_id,delivery_id,active,created_at)
    values(v_id,v_delivery_id,true,now())
    on conflict(local_id,delivery_id) do update set active=true;
  end loop;

  select to_jsonb(l) into v_after from public.locals l where l.id=v_id;
  insert into public.local_change_history(local_id,request_id,change_type,before_data,after_data,changed_by,created_at)
  values(v_id,null,case when p_local_id is null then 'MASTER_CREATE' else 'MASTER_UPDATE' end,
    v_before,v_after,auth.uid(),now());
  return v_id;
end;
$$;

create or replace function public.master_set_local_active(p_local_id uuid,p_active boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_local public.locals%rowtype;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  select * into v_local from public.locals where id=p_local_id for update;
  if not found then raise exception 'HTPWEB: LOCAL inexistente'; end if;
  if p_active and (v_local.latitude is null or v_local.longitude is null) then
    raise exception 'HTPWEB: complete latitud y longitud antes de activar';
  end if;
  update public.locals set active=p_active,updated_at=now() where id=p_local_id;
  if not p_active then update public.local_deliveries set active=false where local_id=p_local_id; end if;
  insert into public.local_change_history(local_id,request_id,change_type,before_data,after_data,changed_by,created_at)
  values(p_local_id,null,case when p_active then 'MASTER_ACTIVATE' else 'MASTER_DEACTIVATE' end,
    to_jsonb(v_local),(select to_jsonb(l) from public.locals l where l.id=p_local_id),auth.uid(),now());
end;
$$;

create or replace function public.master_delete_local(p_local_id uuid,p_confirm_name text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_local public.locals%rowtype;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  select * into v_local from public.locals where id=p_local_id for update;
  if not found then raise exception 'HTPWEB: LOCAL inexistente'; end if;
  if lower(trim(coalesce(p_confirm_name,'')))<>lower(trim(v_local.name)) then
    raise exception 'HTPWEB: escriba el nombre exacto del LOCAL para eliminar';
  end if;
  if exists(select 1 from public.order_locals ol where ol.local_id=p_local_id) then
    update public.locals set active=false,updated_at=now() where id=p_local_id;
    update public.local_deliveries set active=false where local_id=p_local_id;
    return 'INACTIVATED_HISTORY';
  end if;
  begin
    delete from public.locals where id=p_local_id;
    return 'DELETED';
  exception when foreign_key_violation then
    update public.locals set active=false,updated_at=now() where id=p_local_id;
    update public.local_deliveries set active=false where local_id=p_local_id;
    return 'INACTIVATED_RELATIONS';
  end;
end;
$$;

revoke all on function public.master_list_locals() from public,anon;
revoke all on function public.master_save_local(uuid,text,text,text,text,numeric,numeric,text,text,boolean,uuid[]) from public,anon;
revoke all on function public.master_set_local_active(uuid,boolean) from public,anon;
revoke all on function public.master_delete_local(uuid,text) from public,anon;
grant execute on function public.master_list_locals() to authenticated;
grant execute on function public.master_save_local(uuid,text,text,text,text,numeric,numeric,text,text,boolean,uuid[]) to authenticated;
grant execute on function public.master_set_local_active(uuid,boolean) to authenticated;
grant execute on function public.master_delete_local(uuid,text) to authenticated;
