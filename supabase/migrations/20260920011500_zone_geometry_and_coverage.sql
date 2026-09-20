-- Canonical zone geometry and derived LOCAL/DELIVERY eligibility.
-- Coordinates use [latitude, longitude]. No external geospatial extension needed.
create or replace function public.htp_zone_polygon(p_boundary jsonb)
returns polygon language plpgsql immutable set search_path=''
as $$
declare v jsonb; v_points text[]:='{}'; n integer; i integer; j integer; a point; b point; c point; d point; points point[]:='{}'; area double precision:=0;
begin
  if p_boundary is null then return null; end if;
  if jsonb_typeof(p_boundary)<>'array' then raise exception 'Límite inválido'; end if;
  n:=jsonb_array_length(p_boundary);
  if n<3 or n>200 then raise exception 'El límite requiere entre 3 y 200 puntos'; end if;
  for v in select value from jsonb_array_elements(p_boundary) loop
    if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>2
       or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number' then
      raise exception 'Punto inválido';
    end if;
    if (v->>0)::numeric not between -90 and 90 or (v->>1)::numeric not between -180 and 180 then
      raise exception 'Coordenada fuera de rango';
    end if;
    a:=point((v->>1)::double precision,(v->>0)::double precision);
    for i in 1..coalesce(array_length(points,1),0) loop
      if a~=points[i] then raise exception 'Vértice repetido'; end if;
    end loop;
    points:=array_append(points,a);
    v_points:=array_append(v_points,a::text);
  end loop;
  for i in 1..n loop
    a:=points[i]; b:=points[(i%n)+1];
    area:=area+a[0]*b[1]-b[0]*a[1];
    for j in i+1..n loop
      if j=i+1 or (i=1 and j=n) then continue; end if;
      c:=points[j]; d:=points[(j%n)+1];
      if lseg(a,b) ?# lseg(c,d) then raise exception 'El límite se cruza consigo mismo'; end if;
    end loop;
  end loop;
  if abs(area)<1e-12 then raise exception 'La zona no tiene superficie'; end if;
  return ('('||array_to_string(v_points,',')||')')::polygon;
end $$;

create or replace function public.htp_zone_contains(p_boundary jsonb,p_lat numeric,p_lng numeric)
returns boolean language sql immutable set search_path=''
as $$ select coalesce(point(p_lng::double precision,p_lat::double precision) <@ public.htp_zone_polygon(p_boundary),false); $$;

-- Overlap is checked conservatively: crossing/intersecting non-shared edges or an
-- interior vertex. Boundary-only adjacency is allowed; identical polygons are not.
create or replace function public.htp_zones_overlap(a jsonb,b jsonb)
returns boolean language plpgsql immutable set search_path=''
as $$
declare ap polygon:=public.htp_zone_polygon(a); bp polygon:=public.htp_zone_polygon(b);
  v jsonb; w jsonb; i integer; j integer; p point; q point; r point; s point; hit point; on_edge boolean;
begin
  if ap is null or bp is null then return false; end if;
  if ap~=bp then return true; end if;
  for v,w in select a,b union all select b,a loop
    for i in 0..jsonb_array_length(v)-1 loop
      p:=point((v->i->>1)::float8,(v->i->>0)::float8);
      on_edge:=false;
      for j in 0..jsonb_array_length(w)-1 loop
        q:=point((w->j->>1)::float8,(w->j->>0)::float8);
        r:=point((w->((j+1)%jsonb_array_length(w))->>1)::float8,(w->((j+1)%jsonb_array_length(w))->>0)::float8);
        if p <@ lseg(q,r) then on_edge:=true; exit; end if;
      end loop;
      if not on_edge and p <@ public.htp_zone_polygon(w) then return true; end if;
    end loop;
  end loop;
  for i in 0..jsonb_array_length(a)-1 loop
    p:=point((a->i->>1)::float8,(a->i->>0)::float8);
    q:=point((a->((i+1)%jsonb_array_length(a))->>1)::float8,(a->((i+1)%jsonb_array_length(a))->>0)::float8);
    for j in 0..jsonb_array_length(b)-1 loop
      r:=point((b->j->>1)::float8,(b->j->>0)::float8);
      s:=point((b->((j+1)%jsonb_array_length(b))->>1)::float8,(b->((j+1)%jsonb_array_length(b))->>0)::float8);
      hit:=lseg(p,q) # lseg(r,s);
      if hit is not null and not (hit~=p or hit~=q or hit~=r or hit~=s) then return true; end if;
    end loop;
    -- Midpoints detect overlapping rectangles with collinear edges.
    hit:=point((p[0]+q[0])/2,(p[1]+q[1])/2); on_edge:=false;
    for j in 0..jsonb_array_length(b)-1 loop
      r:=point((b->j->>1)::float8,(b->j->>0)::float8);
      s:=point((b->((j+1)%jsonb_array_length(b))->>1)::float8,(b->((j+1)%jsonb_array_length(b))->>0)::float8);
      if hit <@ lseg(r,s) then on_edge:=true; exit; end if;
    end loop;
    if not on_edge and hit <@ bp then return true; end if;
  end loop;
  return false;
end $$;

create table public.zone_change_history(
  id uuid primary key default gen_random_uuid(),zone_id uuid not null,
  before_data jsonb,after_data jsonb,changed_by uuid,created_at timestamptz not null default now()
);
alter table public.zone_change_history enable row level security;
create policy zone_history_master on public.zone_change_history for select to authenticated using(public.is_master());
grant select on public.zone_change_history to authenticated;

create or replace function public.htp_validate_zone()
returns trigger language plpgsql security definer set search_path=''
as $$
declare z record;
begin
  -- Serialize all boundary writes; two simultaneous zones must not overlap.
  perform pg_advisory_xact_lock(880115);
  perform public.htp_zone_polygon(new.boundary);
  if new.active and new.boundary is not null then
    for z in select id,code,boundary from public.zones where active and id<>new.id and boundary is not null loop
      if public.htp_zones_overlap(new.boundary,z.boundary) then raise exception 'La zona se superpone con %',z.code; end if;
    end loop;
  end if;
  if tg_op='UPDATE' then
    if new.city_id<>old.city_id and exists(select 1 from public.locals where zone_id=old.id) then
      raise exception 'No cambie de cantón una zona con locales; reclasifique los locales primero';
    end if;
    if new.boundary is distinct from old.boundary and new.boundary is not null and exists(
      select 1 from public.locals l where l.zone_id=new.id and l.latitude is not null
      and not public.htp_zone_contains(new.boundary,l.latitude,l.longitude)
    ) then raise exception 'El nuevo límite deja locales fuera: reclasifíquelos antes de guardar'; end if;
  end if;
  if not new.active and exists(select 1 from public.locals where zone_id=new.id and active) then
    raise exception 'Inactive o reclasifique los locales antes de desactivar la zona';
  end if;
  return new;
end $$;
create trigger htp_validate_zone before insert or update on public.zones for each row execute function public.htp_validate_zone();

create or replace function public.htp_zone_audit()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.zone_change_history(zone_id,before_data,after_data,changed_by)
 values(new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
create trigger htp_zone_audit after insert or update on public.zones for each row execute function public.htp_zone_audit();

create or replace function public.htp_validate_local_zone()
returns trigger language plpgsql security definer set search_path=''
as $$
declare z public.zones%rowtype;
begin
  perform pg_advisory_xact_lock(880115);
  if new.zone_id is null then
    if new.active then raise exception 'Seleccione una zona antes de activar el local'; end if;
    return new;
  end if;
  select * into z from public.zones where id=new.zone_id;
  if not found or (new.active and not z.active) then raise exception 'Zona inexistente o inactiva'; end if;
  if new.active and (new.latitude is null or new.longitude is null) then raise exception 'Confirme la ubicación antes de activar'; end if;
  if new.latitude is not null and z.boundary is not null
    and not public.htp_zone_contains(z.boundary,new.latitude,new.longitude) then
    raise exception 'La ubicación no pertenece a la zona seleccionada';
  end if;
  return new;
end $$;
create trigger htp_validate_local_zone before insert or update of zone_id,latitude,longitude,active
on public.locals for each row execute function public.htp_validate_local_zone();

-- Coverage approval is independent of the old active assignment.
create table public.delivery_zone_requests(
  delivery_id uuid references public.deliveries(id),zone_id uuid references public.zones(id),
  status text not null check(status in ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  requested_by uuid,reviewed_by uuid,updated_at timestamptz not null default now(),
  primary key(delivery_id,zone_id)
);
alter table public.delivery_zone_requests enable row level security;
create policy zone_requests_read on public.delivery_zone_requests for select to authenticated
using(public.is_master() or public.user_has_delivery(delivery_id));
grant select on public.delivery_zone_requests to authenticated;
insert into public.delivery_zone_requests(delivery_id,zone_id,status)
select delivery_id,zone_id,'APPROVED' from public.delivery_zones where active;

-- Reuse existing permission/capability/limit checks, while disallowing self-approval.
alter function public.set_delivery_zone(uuid,uuid,boolean) rename to set_delivery_zone_88_legacy;
revoke all on function public.set_delivery_zone_88_legacy(uuid,uuid,boolean) from public,anon,authenticated;
create or replace function public.set_delivery_zone(p_delivery_id uuid,p_zone_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_master() then raise exception 'Solicite la zona para aprobación del MASTER'; end if;
  perform pg_advisory_xact_lock(880115);
  perform public.set_delivery_zone_88_legacy(p_delivery_id,p_zone_id,p_active);
  insert into public.delivery_zone_requests(delivery_id,zone_id,status,reviewed_by)
  values(p_delivery_id,p_zone_id,case when p_active then 'APPROVED' else 'SUSPENDED' end,auth.uid())
  on conflict(delivery_id,zone_id) do update set status=excluded.status,reviewed_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.set_delivery_zone(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_delivery_zone(uuid,uuid,boolean) to authenticated;

create or replace function public.request_delivery_zone(p_delivery_id uuid,p_zone_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
  if auth.uid() is null or public.current_role_code()<>'DELIVERY_ADMIN'
    or not public.user_has_delivery(p_delivery_id) or not public.has_permission('zones.assign')
    or not public.delivery_has_capability(p_delivery_id,'zones.manage') then raise exception 'Solicitud no autorizada'; end if;
  if not exists(select 1 from public.zones z join public.deliveries d on d.city_id=z.city_id
    where z.id=p_zone_id and d.id=p_delivery_id and z.active and d.active) then raise exception 'Zona fuera del cantón del DELIVERY'; end if;
  if exists(select 1 from public.delivery_zones where delivery_id=p_delivery_id and zone_id=p_zone_id and active) then return; end if;
  insert into public.delivery_zone_requests(delivery_id,zone_id,status,requested_by)
  values(p_delivery_id,p_zone_id,'PENDING',auth.uid())
  on conflict(delivery_id,zone_id) do update set status='PENDING',requested_by=auth.uid(),reviewed_by=null,updated_at=now();
end $$;
revoke all on function public.request_delivery_zone(uuid,uuid) from public,anon;
grant execute on function public.request_delivery_zone(uuid,uuid) to authenticated;

create or replace function public.reject_delivery_zone_request(p_delivery_id uuid,p_zone_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
  if not public.is_master() then raise exception 'Operación exclusiva de MASTER'; end if;
  update public.delivery_zone_requests set status='REJECTED',reviewed_by=auth.uid(),updated_at=now()
  where delivery_id=p_delivery_id and zone_id=p_zone_id and status='PENDING';
end $$;
revoke all on function public.reject_delivery_zone_request(uuid,uuid) from public,anon;
grant execute on function public.reject_delivery_zone_request(uuid,uuid) to authenticated;

-- Retire manual assignment APIs: an old browser tab must not clear derived links.
revoke execute on function public.master_save_local(uuid,text,text,text,text,numeric,numeric,text,text,boolean,uuid[])
from public,anon,authenticated;

create or replace function public.htp_delivery_covers_local(p_delivery uuid,p_local uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.locals l join public.zones z on z.id=l.zone_id and z.active
  join public.delivery_zones dz on dz.zone_id=z.id and dz.active
  join public.deliveries d on d.id=dz.delivery_id and d.active and d.city_id=z.city_id
  where l.id=p_local and l.active and d.id=p_delivery
); $$;
revoke all on function public.htp_delivery_covers_local(uuid,uuid) from public;
grant execute on function public.htp_delivery_covers_local(uuid,uuid) to anon,authenticated,service_role;

-- Compatibility index: all existing catalog, share and checkout readers retain
-- their API, but every active relation is now derived exclusively from zones.
create or replace function public.htp_refresh_zone_links()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  perform pg_advisory_xact_lock(880115);
  update public.local_deliveries ld set active=false
  where active and not public.htp_delivery_covers_local(ld.delivery_id,ld.local_id);
  insert into public.local_deliveries(local_id,delivery_id,active)
  select l.id,dz.delivery_id,true from public.locals l
  join public.zones z on z.id=l.zone_id and z.active
  join public.delivery_zones dz on dz.zone_id=z.id and dz.active
  join public.deliveries d on d.id=dz.delivery_id and d.active and d.city_id=z.city_id
  where l.active
  on conflict(local_id,delivery_id) do update set active=true where not public.local_deliveries.active;
  return null;
end $$;
create trigger htp_refresh_local_links after insert or update of zone_id,active or delete on public.locals
for each statement execute function public.htp_refresh_zone_links();
create trigger htp_refresh_coverage_links after insert or update or delete on public.delivery_zones
for each statement execute function public.htp_refresh_zone_links();
create trigger htp_refresh_delivery_links after update of active,city_id on public.deliveries
for each statement execute function public.htp_refresh_zone_links();
create trigger htp_refresh_zone_links after update of active on public.zones
for each statement execute function public.htp_refresh_zone_links();

create or replace function public.htp_guard_local_link()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if new.active and not public.htp_delivery_covers_local(new.delivery_id,new.local_id) then
    raise exception 'Este DELIVERY no tiene cobertura en la zona del local';
  end if;
  return new;
end $$;
create trigger htp_guard_local_link before insert or update on public.local_deliveries
for each row execute function public.htp_guard_local_link();

-- Do not modify orders or delete historical assignments. Refresh eligible links.
update public.local_deliveries ld set active=false
where active and not public.htp_delivery_covers_local(ld.delivery_id,ld.local_id);
insert into public.local_deliveries(local_id,delivery_id,active)
select l.id,dz.delivery_id,true from public.locals l
join public.zones z on z.id=l.zone_id and z.active
join public.delivery_zones dz on dz.zone_id=z.id and dz.active
join public.deliveries d on d.id=dz.delivery_id and d.active and d.city_id=z.city_id
where l.active on conflict(local_id,delivery_id) do update set active=true;

-- An authenticated DELIVERY cannot bypass filtering with a raw REST query.
create or replace function public.htp_delivery_scope(p_local uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select case when public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
  then exists(select 1 from public.user_deliveries ud where ud.user_id=auth.uid() and ud.active
    and public.user_has_delivery(ud.delivery_id) and public.htp_delivery_covers_local(ud.delivery_id,p_local))
  else true end; $$;
revoke all on function public.htp_delivery_scope(uuid) from public,anon;
grant execute on function public.htp_delivery_scope(uuid) to authenticated;
create policy htp_local_zone_scope on public.locals as restrictive for select to authenticated using(public.htp_delivery_scope(id));
create policy htp_product_zone_scope on public.products as restrictive for select to authenticated using(public.htp_delivery_scope(local_id));
create policy htp_category_zone_scope on public.categories as restrictive for select to authenticated using(public.htp_delivery_scope(local_id));
create policy htp_relation_zone_scope on public.local_deliveries as restrictive for select to authenticated using(public.htp_delivery_scope(local_id));

revoke all on function public.htp_refresh_zone_links(),public.htp_guard_local_link(),
  public.htp_validate_zone(),public.htp_validate_local_zone(),public.htp_zone_audit()
from public,anon,authenticated;
