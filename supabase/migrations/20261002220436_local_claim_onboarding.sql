-- HTPWEB Local claim onboarding and non-destructive CLIENT -> LOCAL_ADMIN conversion.

create or replace function public.convert_profile_to_local_admin(p_user_id uuid,p_convert_customer boolean)
returns void
language plpgsql security definer set search_path=''
as $$
declare v_role_code text; v_local_admin_role_id uuid;
begin
  select r.code into v_role_code
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true and r.active=true;

  if v_role_code is null then raise exception 'HTPWEB: profile inexistente o inactivo'; end if;
  if v_role_code='LOCAL_ADMIN' then return; end if;
  if v_role_code<>'CLIENT' then
    raise exception 'HTPWEB: solamente CLIENT puede convertirse a LOCAL_ADMIN en el modelo actual';
  end if;

  -- El CUSTOMER se conserva activo. Administrar un LOCAL no elimina la capacidad
  -- de comprar como cliente. p_convert_customer se mantiene por compatibilidad.
  select r.id into v_local_admin_role_id
  from public.roles r where r.code='LOCAL_ADMIN' and r.active=true;
  if v_local_admin_role_id is null then raise exception 'HTPWEB: rol LOCAL_ADMIN inexistente o inactivo'; end if;

  update public.profiles
  set role_id=v_local_admin_role_id,updated_at=now()
  where id=p_user_id;
end $$;

create or replace function public.claimable_locals(p_search text default null)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when auth.uid() is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'name',l.name,'address',l.address,'logo_url',l.logo_url,
      'canton',coalesce(lc.name,zc.name),'province',coalesce(lc.province,zc.province),
      'pending_claim',exists(
        select 1 from public.local_requests r
        where r.local_id=l.id and r.request_type='CLAIM_LOCAL'
          and r.status in ('PENDING','NEEDS_INFO','APPROVED') and r.applied_at is null
      )
    ) order by lower(l.name)
  ),'[]'::jsonb) end
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities zc on zc.id=z.city_id
  left join public.cities lc on lc.id=l.city_id
  where l.active=true
    and not exists(select 1 from public.user_locals ul where ul.local_id=l.id and ul.active=true)
    and (
      nullif(trim(coalesce(p_search,'')),'') is null
      or lower(l.name) like '%'||lower(trim(p_search))||'%'
      or lower(coalesce(l.address,'')) like '%'||lower(trim(p_search))||'%'
    )
  limit 100;
$$;

create or replace function public.my_local_claim_requests()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'local_id',r.local_id,'local_name',l.name,'status',r.status,
    'review_note',r.review_note,'created_at',r.created_at,'applied_at',r.applied_at
  ) order by r.created_at desc),'[]'::jsonb)
  from public.local_requests r
  join public.locals l on l.id=r.local_id
  where r.requested_by=auth.uid() and r.request_type='CLAIM_LOCAL';
$$;

-- Include routing metadata for managed-order handoff.
create or replace function public.public_local_delivery_choices(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_id',d.id,'name',d.name,'slug',d.slug,'public_share_path',d.public_share_path,
    'logo_url',d.logo_url,'whatsapp',d.whatsapp,
    'is_primary',coalesce(s.primary_delivery_id=d.id,false)
  ) order by coalesce(s.primary_delivery_id=d.id,false) desc,lower(d.name)),'[]'::jsonb)
  from public.local_deliveries ld
  join public.deliveries d on d.id=ld.delivery_id and d.active=true
  join public.locals l on l.id=ld.local_id and l.active=true
  left join public.local_commerce_settings s on s.local_id=l.id
  where ld.local_id=p_local_id and ld.active=true
    and coalesce(s.htpweb_delivery_enabled,true)
    and public.htp_delivery_covers_local(d.id,l.id);
$$;

revoke all on function public.claimable_locals(text) from public,anon;
revoke all on function public.my_local_claim_requests() from public,anon;
grant execute on function public.claimable_locals(text) to authenticated;
grant execute on function public.my_local_claim_requests() to authenticated;
revoke all on function public.public_local_delivery_choices(uuid) from public;
grant execute on function public.public_local_delivery_choices(uuid) to anon,authenticated;
