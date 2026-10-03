create table if not exists public.delivery_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  name text not null,
  description text,
  phone text,
  whatsapp text,
  city_name text,
  status text not null default 'PENDING' check(status in ('PENDING','NEEDS_INFO','APPROVED','REJECTED','CANCELLED')),
  review_note text,
  review_deadline timestamptz not null default (now()+interval '3 days'),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  result_delivery_id uuid references public.deliveries(id),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.delivery_creation_requests enable row level security;
drop policy if exists delivery_creation_requests_select_self on public.delivery_creation_requests;
create policy delivery_creation_requests_select_self on public.delivery_creation_requests for select to authenticated
using(requested_by=auth.uid() or public.is_master());

create or replace function public.submit_my_delivery_creation_request(
 p_name text,p_description text,p_phone text,p_whatsapp text,p_city_name text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=gen_random_uuid(); v_name text:=nullif(trim(p_name),'');
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 if v_name is null then raise exception 'HTPWEB: nombre del DELIVERY requerido'; end if;
 if exists(select 1 from public.delivery_creation_requests r where r.requested_by=auth.uid() and r.status in ('PENDING','NEEDS_INFO'))
   then raise exception 'HTPWEB: ya tienes una solicitud DELIVERY abierta'; end if;
 insert into public.delivery_creation_requests(id,requested_by,name,description,phone,whatsapp,city_name)
 values(v_id,auth.uid(),v_name,nullif(trim(coalesce(p_description,'')),''),
  nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
  nullif(trim(coalesce(p_city_name,'')),''));
 return v_id;
end $$;
revoke all on function public.submit_my_delivery_creation_request(text,text,text,text,text) from public;
grant execute on function public.submit_my_delivery_creation_request(text,text,text,text,text) to authenticated;

create or replace function public.my_delivery_creation_requests()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'name',r.name,'description',r.description,'phone',r.phone,'whatsapp',r.whatsapp,'city_name',r.city_name,
  'status',r.status,'review_note',r.review_note,'review_deadline',r.review_deadline,
  'result_delivery_id',r.result_delivery_id,'applied_at',r.applied_at,'created_at',r.created_at
 ) order by r.created_at desc),'[]'::jsonb)
 from public.delivery_creation_requests r where r.requested_by=auth.uid();
$$;
revoke all on function public.my_delivery_creation_requests() from public;
grant execute on function public.my_delivery_creation_requests() to authenticated;

create or replace function public.master_list_delivery_creation_requests()
returns jsonb language sql stable security definer set search_path=''
as $$
 select case when not public.is_master() then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'requested_by',r.requested_by,'requester_name',p.full_name,
  'name',r.name,'description',r.description,'phone',r.phone,'whatsapp',r.whatsapp,'city_name',r.city_name,
  'status',r.status,'review_note',r.review_note,'review_deadline',r.review_deadline,
  'result_delivery_id',r.result_delivery_id,'applied_at',r.applied_at,'created_at',r.created_at
 ) order by case r.status when 'PENDING' then 0 when 'NEEDS_INFO' then 1 else 2 end,r.created_at desc),'[]'::jsonb) end
 from public.delivery_creation_requests r left join public.profiles p on p.id=r.requested_by;
$$;
revoke all on function public.master_list_delivery_creation_requests() from public;
grant execute on function public.master_list_delivery_creation_requests() to authenticated;

create or replace function public.master_review_delivery_creation_request(
 p_request_id uuid,p_status text,p_review_note text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare r public.delivery_creation_requests%rowtype; v_status text:=upper(trim(coalesce(p_status,''))); v_id uuid; v_slug text;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if v_status not in ('APPROVED','REJECTED','NEEDS_INFO') then raise exception 'HTPWEB: estado inválido'; end if;
 select * into r from public.delivery_creation_requests where id=p_request_id for update;
 if not found or r.status not in ('PENDING','NEEDS_INFO') then raise exception 'HTPWEB: solicitud inexistente o cerrada'; end if;
 if v_status='APPROVED' and nullif(trim(coalesce(p_review_note,'')),'') is null
   then raise exception 'HTPWEB: documenta la revisión antes de aprobar'; end if;
 update public.delivery_creation_requests set status=v_status,review_note=nullif(trim(coalesce(p_review_note,'')),''),
   reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
 if v_status<>'APPROVED' then return null; end if;
 v_id:=gen_random_uuid();
 v_slug:=trim(both '-' from regexp_replace(lower(r.name),'[^a-z0-9]+','-','g'));
 if v_slug='' then v_slug:='delivery'; end if;
 v_slug:=v_slug||'-'||substr(replace(v_id::text,'-',''),1,8);
 insert into public.deliveries(id,name,slug,description,phone,whatsapp,active,created_at,updated_at)
 values(v_id,r.name,v_slug,r.description,r.phone,r.whatsapp,false,now(),now());
 insert into public.user_deliveries(user_id,delivery_id,active,created_at)
 values(r.requested_by,v_id,true,now()) on conflict(user_id,delivery_id) do update set active=true;
 insert into public.account_delivery_roles(user_id,delivery_id,role_code,active,updated_at)
 values(r.requested_by,v_id,'DELIVERY_ADMIN',true,now())
 on conflict(user_id,delivery_id) do update set role_code='DELIVERY_ADMIN',active=true,updated_at=now();
 perform public.convert_profile_to_delivery_role(r.requested_by,'DELIVERY_ADMIN',false);
 update public.delivery_creation_requests set result_delivery_id=v_id,applied_at=now(),updated_at=now() where id=r.id;
 return v_id;
end $$;
revoke all on function public.master_review_delivery_creation_request(uuid,text,text) from public;
grant execute on function public.master_review_delivery_creation_request(uuid,text,text) to authenticated;

