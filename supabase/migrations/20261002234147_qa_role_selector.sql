-- QA role selector for one authorized test account. Never includes MASTER.

create table if not exists private.qa_role_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed_roles text[] not null,
  home_delivery_id uuid references public.deliveries(id),
  test_local_id uuid references public.locals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not ('MASTER'=any(allowed_roles)))
);

revoke all on private.qa_role_testers from public,anon,authenticated;
grant all on private.qa_role_testers to service_role;

-- Dedicated LOCAL for QA so real businesses are never claimed or edited during role tests.
insert into public.locals(
  id,zone_id,name,slug,description,address,latitude,longitude,phone,whatsapp,
  active,location_source,city_id,business_category_id,created_at,updated_at
)
select
  'f0000000-0000-4000-8000-000000000001'::uuid,
  l.zone_id,
  'HTPWEB LOCAL PRUEBAS',
  'htpweb-local-pruebas',
  'LOCAL exclusivo para pruebas internas de HTPWEB. No corresponde a un negocio real.',
  'Entorno de pruebas HTPWEB · Esmeraldas',
  l.latitude,
  l.longitude,
  '+593 98 039 0363',
  '+593 98 039 0363',
  true,
  'MANUAL',
  l.city_id,
  l.business_category_id,
  now(),now()
from public.locals l
where l.id='5a721605-1e5c-48ac-9fa4-8fed1f7bdebb'::uuid
on conflict(id) do update set
  name=excluded.name,slug=excluded.slug,description=excluded.description,address=excluded.address,
  phone=excluded.phone,whatsapp=excluded.whatsapp,active=true,updated_at=now();

insert into public.local_deliveries(local_id,delivery_id,active,created_at)
values(
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'c0ad0746-5090-4350-9ec2-c1b8019a0a17'::uuid,
  true,now()
)
on conflict(local_id,delivery_id) do update set active=true;

-- Give the QA LOCAL a live LOCAL Pro plan so the owner-managed UI can be tested.
insert into public.plan_assignments(
  plan_id,local_id,status,starts_at,ends_at,assigned_by,metadata,
  plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,plan_version_snapshot,change_type
)
select
  p.id,
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'ACTIVE',
  now(),
  now()+interval '12 months',
  'eb48520e-2634-40a8-9e7e-7babeba02e4f'::uuid,
  jsonb_build_object('source','QA_ROLE_SELECTOR'),
  p.name,p.price,p.currency,p.duration_months,p.plan_version,'NEW'
from public.subscription_plans p
where p.code='LOC_PRO'
  and not exists(
    select 1 from public.plan_assignments a
    where a.local_id='f0000000-0000-4000-8000-000000000001'::uuid
      and a.status in ('ACTIVE','TRIAL')
      and (a.ends_at is null or a.ends_at>now())
  )
limit 1;

-- Seed this exact QA user and update their requested contact number.
update public.profiles
set phone='+593 98 039 0363',updated_at=now()
where id='eb48520e-2634-40a8-9e7e-7babeba02e4f'::uuid;

update public.customers
set phone='+593 98 039 0363',updated_at=now()
where profile_id='eb48520e-2634-40a8-9e7e-7babeba02e4f'::uuid;

insert into public.user_deliveries(user_id,delivery_id,active,created_at,driver_mode)
values(
  'eb48520e-2634-40a8-9e7e-7babeba02e4f'::uuid,
  'c0ad0746-5090-4350-9ec2-c1b8019a0a17'::uuid,
  true,now(),'REGULAR'
)
on conflict(user_id,delivery_id) do update set active=true,driver_mode='REGULAR';

insert into private.qa_role_testers(user_id,allowed_roles,home_delivery_id,test_local_id)
values(
  'eb48520e-2634-40a8-9e7e-7babeba02e4f'::uuid,
  array['CLIENT','DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER','LOCAL_ADMIN']::text[],
  'c0ad0746-5090-4350-9ec2-c1b8019a0a17'::uuid,
  'f0000000-0000-4000-8000-000000000001'::uuid
)
on conflict(user_id) do update set
  allowed_roles=excluded.allowed_roles,
  home_delivery_id=excluded.home_delivery_id,
  test_local_id=excluded.test_local_id,
  updated_at=now();

create or replace function public.qa_profile_selector_snapshot()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when q.user_id=auth.uid() then jsonb_build_object(
    'enabled',true,
    'current_role',public.current_role_code(),
    'allowed_roles',to_jsonb(q.allowed_roles),
    'email',u.email,
    'phone',p.phone,
    'delivery_id',q.home_delivery_id,
    'delivery_slug',d.slug,
    'delivery_name',d.name,
    'local_id',q.test_local_id,
    'local_name',l.name,
    'local_slug',l.slug
  ) else jsonb_build_object('enabled',false) end
  from private.qa_role_testers q
  join auth.users u on u.id=q.user_id
  join public.profiles p on p.id=q.user_id
  left join public.deliveries d on d.id=q.home_delivery_id
  left join public.locals l on l.id=q.test_local_id
  where q.user_id=auth.uid();
$$;

create or replace function public.qa_set_profile_role(p_role_code text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  q private.qa_role_testers%rowtype;
  v_role text:=upper(trim(coalesce(p_role_code,'')));
  v_role_id uuid;
begin
  if auth.uid() is null then raise exception 'HTPWEB: se requiere autenticación'; end if;
  select * into q from private.qa_role_testers where user_id=auth.uid() for update;
  if not found then raise exception 'HTPWEB: selector de perfiles no habilitado para esta cuenta'; end if;
  if v_role='MASTER' or not (v_role=any(q.allowed_roles)) then
    raise exception 'HTPWEB: perfil de prueba no permitido';
  end if;
  select id into v_role_id from public.roles where code=v_role and active=true;
  if v_role_id is null then raise exception 'HTPWEB: rol inexistente o inactivo'; end if;

  update public.profiles set role_id=v_role_id,active=true,updated_at=now() where id=auth.uid();

  if v_role in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER') and q.home_delivery_id is not null then
    insert into public.user_deliveries(user_id,delivery_id,active,created_at,driver_mode)
    values(auth.uid(),q.home_delivery_id,true,now(),'REGULAR')
    on conflict(user_id,delivery_id) do update set active=true,driver_mode='REGULAR';
  end if;

  if v_role='LOCAL_ADMIN' and q.test_local_id is not null then
    insert into public.user_locals(user_id,local_id,active,created_at)
    values(auth.uid(),q.test_local_id,true,now())
    on conflict(user_id,local_id) do update set active=true;
  end if;

  if v_role='CLIENT' then
    update public.customers set active=true,updated_at=now() where profile_id=auth.uid();
  end if;

  return public.qa_profile_selector_snapshot();
end $$;

revoke all on function public.qa_profile_selector_snapshot() from public,anon;
revoke all on function public.qa_set_profile_role(text) from public,anon;
grant execute on function public.qa_profile_selector_snapshot() to authenticated;
grant execute on function public.qa_set_profile_role(text) to authenticated;
