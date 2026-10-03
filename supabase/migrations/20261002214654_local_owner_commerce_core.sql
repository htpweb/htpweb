-- HTPWEB Local owner-managed commerce core.
-- Backward compatible: existing DELIVERY pages and unclaimed LOCAL remain unchanged.

create table if not exists public.local_storefront_presets (
  code text primary key,
  name text not null,
  business_fit text not null,
  description text,
  layout_family text not null check (layout_family in ('FOOD','RETAIL','FASHION','HEALTH','HARDWARE','SERVICES','GENERAL')),
  default_catalog_mode text not null check (default_catalog_mode in ('CARDS','VISUAL_MENU','HYBRID')),
  default_card_density text not null check (default_card_density in ('PHOTO','COMPACT')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  active boolean not null default true,
  display_order integer not null default 0
);

insert into public.local_storefront_presets(code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,display_order)
values
('FOOD_VISUAL','Sabor Visual','Restaurantes, cafeterías, pizzerías, comida rápida','Hero grande, promociones visibles y cambio entre menú visual y tarjetas.','FOOD','HYBRID','PHOTO',
 '{"hero":"immersive","category_nav":"chips","product_image_ratio":"4:3","promo_position":"top","show_schedule":true}'::jsonb,10),
('GROCERY_DENSE','Compra Rápida','Minimarkets, abarrotes, supermercados, bebidas','Alta densidad de productos, categorías rápidas y compra repetitiva.','RETAIL','CARDS','COMPACT',
 '{"hero":"compact","category_nav":"sticky","product_image_ratio":"1:1","quick_add":true,"show_stock_badge":true}'::jsonb,20),
('FASHION_EDITORIAL','Vitrina','Boutiques, calzado, accesorios, belleza','Presentación editorial con imágenes grandes, colecciones y variantes visibles.','FASHION','CARDS','PHOTO',
 '{"hero":"editorial","category_nav":"tiles","product_image_ratio":"3:4","show_variants":true,"promo_position":"editorial"}'::jsonb,30),
('HEALTH_CLEAN','Salud Clara','Farmacias, cuidado personal, bienestar','Diseño limpio, búsqueda prioritaria, categorías y fichas compactas.','HEALTH','CARDS','COMPACT',
 '{"hero":"clean","category_nav":"grid","product_image_ratio":"1:1","search_priority":true,"show_stock_badge":true}'::jsonb,40),
('HARDWARE_CATALOG','Catálogo Técnico','Ferreterías, repuestos, tecnología, materiales','Catálogo denso con SKU, variantes, filtros y búsqueda visibles.','HARDWARE','CARDS','COMPACT',
 '{"hero":"compact","category_nav":"sidebar","product_image_ratio":"1:1","show_sku":true,"search_priority":true}'::jsonb,50),
('SERVICES_SHOWCASE','Servicios','Talleres, salones, profesionales, servicios','Presentación por servicios, CTA destacado y enfoque en cotización/reserva.','SERVICES','CARDS','PHOTO',
 '{"hero":"service","category_nav":"tiles","product_image_ratio":"16:9","primary_cta":"WHATSAPP"}'::jsonb,60),
('GENERAL_MODERN','Moderno','Negocios generales y emprendimientos','Diseño flexible para negocios que no encajan en una categoría específica.','GENERAL','CARDS','PHOTO',
 '{"hero":"balanced","category_nav":"chips","product_image_ratio":"1:1"}'::jsonb,70)
on conflict(code) do update set
  name=excluded.name,business_fit=excluded.business_fit,description=excluded.description,
  layout_family=excluded.layout_family,default_catalog_mode=excluded.default_catalog_mode,
  default_card_density=excluded.default_card_density,config=excluded.config,
  active=excluded.active,display_order=excluded.display_order;

alter table public.local_storefront_presets enable row level security;
drop policy if exists local_storefront_presets_public_read on public.local_storefront_presets;
create policy local_storefront_presets_public_read on public.local_storefront_presets
for select to anon,authenticated using(active=true);
grant select on public.local_storefront_presets to anon,authenticated;

create table if not exists public.local_commerce_settings (
  local_id uuid primary key references public.locals(id) on delete cascade,
  storefront_enabled boolean not null default false,
  preset_code text not null default 'GENERAL_MODERN' references public.local_storefront_presets(code),
  catalog_mode text check (catalog_mode in ('CARDS','VISUAL_MENU','HYBRID')),
  card_density text not null default 'PHOTO' check (card_density in ('PHOTO','COMPACT')),
  order_mode text not null default 'WHATSAPP_ONLY' check (order_mode in ('WHATSAPP_ONLY','HTPWEB_MANAGED')),
  pickup_enabled boolean not null default true,
  own_delivery_enabled boolean not null default false,
  htpweb_delivery_enabled boolean not null default true,
  primary_delivery_id uuid references public.deliveries(id),
  accent_color text,
  surface_style text not null default 'SOFT' check (surface_style in ('SOFT','SQUARE','ROUNDED','EDITORIAL')),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
);
alter table public.local_commerce_settings enable row level security;
revoke all on public.local_commerce_settings from public,anon,authenticated;
grant all on public.local_commerce_settings to service_role;

create table if not exists public.local_inventory_items (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  track_stock boolean not null default false,
  available_qty integer,
  low_stock_threshold integer not null default 0 check(low_stock_threshold>=0),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_qty is null or available_qty>=0),
  unique nulls not distinct(local_id,product_id,variant_id)
);
alter table public.local_inventory_items enable row level security;
revoke all on public.local_inventory_items from public,anon,authenticated;
grant all on public.local_inventory_items to service_role;

create table if not exists public.local_social_content (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  platform text not null check(platform in ('INSTAGRAM','FACEBOOK','TIKTOK','WHATSAPP','OTHER')),
  external_url text,
  product_id uuid references public.products(id) on delete set null,
  promotion_id uuid references public.local_promotions(id) on delete set null,
  campaign_code text,
  title text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.local_social_content enable row level security;
revoke all on public.local_social_content from public,anon,authenticated;
grant all on public.local_social_content to service_role;

create table if not exists public.local_delivery_partnership_requests (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  requested_by uuid not null default auth.uid(),
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists local_delivery_partnership_open_uq
on public.local_delivery_partnership_requests(local_id,delivery_id)
where status='PENDING';
alter table public.local_delivery_partnership_requests enable row level security;
revoke all on public.local_delivery_partnership_requests from public,anon,authenticated;
grant all on public.local_delivery_partnership_requests to service_role;

create or replace function public.local_has_live_plan(p_local_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1
    from public.plan_assignments a
    join public.subscription_plans p on p.id=a.plan_id
    where a.local_id=p_local_id
      and p.target_type='LOCAL'
      and p.active=true
      and a.status in ('ACTIVE','TRIAL')
      and a.starts_at<=now()
      and (a.ends_at is null or a.ends_at>now())
      and (a.status<>'TRIAL' or a.trial_ends_at is null or a.trial_ends_at>now())
  );
$$;

create or replace function public.local_is_claimed(p_local_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.user_locals ul
    where ul.local_id=p_local_id and ul.active=true
  );
$$;

create or replace function public.local_is_owner_managed(p_local_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.local_is_claimed(p_local_id) and public.local_has_live_plan(p_local_id);
$$;

revoke all on function public.local_has_live_plan(uuid) from public;
revoke all on function public.local_is_claimed(uuid) from public;
revoke all on function public.local_is_owner_managed(uuid) from public;
grant execute on function public.local_has_live_plan(uuid) to authenticated;
grant execute on function public.local_is_claimed(uuid) to authenticated;
grant execute on function public.local_is_owner_managed(uuid) to authenticated;

-- MASTER remains platform administrator, but ordinary commercial editing is blocked
-- while a claimed LOCAL has a live LOCAL plan.
do $$
begin
  if to_regprocedure('public.master_save_local_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean)') is not null
     and to_regprocedure('public.master_save_local_v3_unclaimed_legacy(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean)') is null then
    alter function public.master_save_local_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean)
      rename to master_save_local_v3_unclaimed_legacy;
  end if;
  if to_regprocedure('public.master_set_local_active(uuid,boolean)') is not null
     and to_regprocedure('public.master_set_local_active_unclaimed_legacy(uuid,boolean)') is null then
    alter function public.master_set_local_active(uuid,boolean) rename to master_set_local_active_unclaimed_legacy;
  end if;
  if to_regprocedure('public.master_delete_local(uuid,text)') is not null
     and to_regprocedure('public.master_delete_local_unclaimed_legacy(uuid,text)') is null then
    alter function public.master_delete_local(uuid,text) rename to master_delete_local_unclaimed_legacy;
  end if;
  if to_regprocedure('public.master_set_local_business_categories(uuid,uuid[])') is not null
     and to_regprocedure('public.master_set_local_business_categories_unclaimed_legacy(uuid,uuid[])') is null then
    alter function public.master_set_local_business_categories(uuid,uuid[]) rename to master_set_local_business_categories_unclaimed_legacy;
  end if;
end $$;

create or replace function public.master_save_local_v3(
  p_local_id uuid,p_city_id uuid,p_zone_id uuid,p_business_category_id uuid,p_name text,p_slug text,
  p_description text,p_address text,p_latitude numeric,p_longitude numeric,p_phone text,p_whatsapp text,
  p_google_place_id text,p_google_maps_url text,p_location_source text,p_active boolean
) returns uuid
language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if p_local_id is not null and public.local_is_owner_managed(p_local_id) then
    raise exception 'HTPWEB: este LOCAL está administrado por su propietario mientras su plan esté vigente';
  end if;
  return public.master_save_local_v3_unclaimed_legacy(
    p_local_id,p_city_id,p_zone_id,p_business_category_id,p_name,p_slug,p_description,p_address,
    p_latitude,p_longitude,p_phone,p_whatsapp,p_google_place_id,p_google_maps_url,p_location_source,p_active
  );
end $$;

create or replace function public.master_set_local_active(p_local_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if public.local_is_owner_managed(p_local_id) then
    raise exception 'HTPWEB: este LOCAL está administrado por su propietario mientras su plan esté vigente';
  end if;
  perform public.master_set_local_active_unclaimed_legacy(p_local_id,p_active);
end $$;

create or replace function public.master_delete_local(p_local_id uuid,p_confirm_name text)
returns text language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if public.local_is_owner_managed(p_local_id) then
    raise exception 'HTPWEB: LOCAL reclamado con plan vigente; usa una acción extraordinaria de plataforma';
  end if;
  return public.master_delete_local_unclaimed_legacy(p_local_id,p_confirm_name);
end $$;

create or replace function public.master_set_local_business_categories(p_local_id uuid,p_category_ids uuid[])
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if public.local_is_owner_managed(p_local_id) then
    raise exception 'HTPWEB: este LOCAL está administrado por su propietario mientras su plan esté vigente';
  end if;
  return public.master_set_local_business_categories_unclaimed_legacy(p_local_id,p_category_ids);
end $$;

-- Owner-aware resource permissions. Unclaimed LOCAL continue to be editable by MASTER.
create or replace function public.user_can_manage_local_resource(
  p_local_id uuid,p_permission_code text,p_capability_code text
) returns boolean
language plpgsql stable security definer set search_path=''
as $$
begin
  if public.is_master() then
    return not public.local_is_owner_managed(p_local_id);
  end if;
  return exists(
      select 1 from public.user_locals ul
      where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active=true
    )
    and public.has_permission(p_permission_code)
    and public.local_has_effective_capability(p_local_id,p_capability_code);
end $$;

create or replace function public.can_manage_local_gallery(p_local_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select (public.is_master() and not public.local_is_owner_managed(p_local_id))
    or exists(
      select 1 from public.user_locals ul
      where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active=true
        and public.local_has_effective_capability(p_local_id,'local.media.manage')
    );
$$;

-- Prefer plan limits, then legacy configured limits.
create or replace function public.local_limit_value(p_local_id uuid,p_limit_code text)
returns integer
language plpgsql stable security definer set search_path=''
as $$
declare v integer;
begin
  v:=public.local_effective_limit_value(p_local_id,p_limit_code);
  if v is not null then return v; end if;
  select ll.max_value into v
  from public.local_limits ll join public.limit_definitions ld on ld.id=ll.limit_id
  where ll.local_id=p_local_id and ld.code=p_limit_code and ld.active=true
    and ld.scope in ('LOCAL','BOTH')
  limit 1;
  return v;
end $$;

-- Commerce configuration.
create or replace function public.local_commerce_snapshot(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when public.is_master()
        or exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active)
    then jsonb_build_object(
      'local_id',l.id,'name',l.name,'slug',l.slug,
      'claimed',public.local_is_claimed(l.id),
      'owner_managed',public.local_is_owner_managed(l.id),
      'plan',(
        select jsonb_build_object('code',p.code,'name',p.name,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'trial_ends_at',a.trial_ends_at)
        from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
        where a.local_id=l.id and p.target_type='LOCAL' and a.status in ('ACTIVE','TRIAL','PAST_DUE')
        order by a.starts_at desc limit 1
      ),
      'settings',jsonb_build_object(
        'storefront_enabled',coalesce(s.storefront_enabled,false),
        'preset_code',coalesce(s.preset_code,'GENERAL_MODERN'),
        'catalog_mode',coalesce(s.catalog_mode,
          case when exists(select 1 from public.local_menu_pages mp where mp.local_id=l.id and mp.active) then 'VISUAL_MENU' else 'CARDS' end),
        'card_density',coalesce(s.card_density,'PHOTO'),
        'order_mode',coalesce(s.order_mode,'WHATSAPP_ONLY'),
        'pickup_enabled',coalesce(s.pickup_enabled,true),
        'own_delivery_enabled',coalesce(s.own_delivery_enabled,false),
        'htpweb_delivery_enabled',coalesce(s.htpweb_delivery_enabled,true),
        'primary_delivery_id',s.primary_delivery_id,
        'accent_color',s.accent_color,
        'surface_style',coalesce(s.surface_style,'SOFT')
      )
    ) else null end
  from public.locals l
  left join public.local_commerce_settings s on s.local_id=l.id
  where l.id=p_local_id;
$$;

create or replace function public.save_my_local_commerce_settings(
  p_local_id uuid,p_storefront_enabled boolean,p_preset_code text,p_catalog_mode text,p_card_density text,
  p_order_mode text,p_pickup_enabled boolean,p_own_delivery_enabled boolean,p_htpweb_delivery_enabled boolean,
  p_primary_delivery_id uuid,p_accent_color text,p_surface_style text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_mode text:=upper(trim(coalesce(p_catalog_mode,'CARDS')));
begin
  if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
    raise exception 'HTPWEB: no administras este LOCAL';
  end if;
  if not public.local_has_live_plan(p_local_id) then
    raise exception 'HTPWEB: se requiere un plan LOCAL vigente';
  end if;
  if not exists(select 1 from public.local_storefront_presets p where p.code=p_preset_code and p.active) then
    raise exception 'HTPWEB: diseño de tienda inválido';
  end if;
  if v_mode not in ('CARDS','VISUAL_MENU','HYBRID') then raise exception 'HTPWEB: presentación de catálogo inválida'; end if;
  if upper(trim(coalesce(p_card_density,''))) not in ('PHOTO','COMPACT') then raise exception 'HTPWEB: densidad de tarjetas inválida'; end if;
  if upper(trim(coalesce(p_order_mode,''))) not in ('WHATSAPP_ONLY','HTPWEB_MANAGED') then raise exception 'HTPWEB: modo de pedido inválido'; end if;
  if upper(trim(coalesce(p_surface_style,''))) not in ('SOFT','SQUARE','ROUNDED','EDITORIAL') then raise exception 'HTPWEB: estilo inválido'; end if;
  if p_accent_color is not null and p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'HTPWEB: color inválido'; end if;
  if p_primary_delivery_id is not null and not exists(
    select 1 from public.local_deliveries ld where ld.local_id=p_local_id and ld.delivery_id=p_primary_delivery_id and ld.active
  ) then raise exception 'HTPWEB: el DELIVERY principal no está vinculado al LOCAL'; end if;

  insert into public.local_commerce_settings(
    local_id,storefront_enabled,preset_code,catalog_mode,card_density,order_mode,pickup_enabled,
    own_delivery_enabled,htpweb_delivery_enabled,primary_delivery_id,accent_color,surface_style,updated_by,created_at,updated_at)
  values(p_local_id,coalesce(p_storefront_enabled,false),p_preset_code,v_mode,upper(p_card_density),upper(p_order_mode),
    coalesce(p_pickup_enabled,true),coalesce(p_own_delivery_enabled,false),coalesce(p_htpweb_delivery_enabled,true),
    p_primary_delivery_id,p_accent_color,upper(p_surface_style),auth.uid(),now(),now())
  on conflict(local_id) do update set
    storefront_enabled=excluded.storefront_enabled,preset_code=excluded.preset_code,catalog_mode=excluded.catalog_mode,
    card_density=excluded.card_density,order_mode=excluded.order_mode,pickup_enabled=excluded.pickup_enabled,
    own_delivery_enabled=excluded.own_delivery_enabled,htpweb_delivery_enabled=excluded.htpweb_delivery_enabled,
    primary_delivery_id=excluded.primary_delivery_id,accent_color=excluded.accent_color,
    surface_style=excluded.surface_style,updated_by=auth.uid(),updated_at=now();

  return public.local_commerce_snapshot(p_local_id);
end $$;

create or replace function public.public_local_storefront(p_local_key text)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'local',jsonb_build_object(
      'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'banner_url',l.banner_url,'logo_url',l.logo_url,
      'address',l.address,'phone',l.phone,'whatsapp',l.whatsapp,'website_url',l.website_url,
      'instagram_url',l.instagram_url,'facebook_url',l.facebook_url,'tiktok_url',l.tiktok_url
    ),
    'settings',jsonb_build_object(
      'preset_code',coalesce(s.preset_code,'GENERAL_MODERN'),
      'catalog_mode',coalesce(s.catalog_mode,case when exists(select 1 from public.local_menu_pages mp where mp.local_id=l.id and mp.active) then 'VISUAL_MENU' else 'CARDS' end),
      'card_density',coalesce(s.card_density,'PHOTO'),'order_mode',coalesce(s.order_mode,'WHATSAPP_ONLY'),
      'pickup_enabled',coalesce(s.pickup_enabled,true),'own_delivery_enabled',coalesce(s.own_delivery_enabled,false),
      'htpweb_delivery_enabled',coalesce(s.htpweb_delivery_enabled,true),'primary_delivery_id',s.primary_delivery_id,
      'accent_color',s.accent_color,'surface_style',coalesce(s.surface_style,'SOFT')
    ),
    'preset',(select to_jsonb(p) from public.local_storefront_presets p where p.code=coalesce(s.preset_code,'GENERAL_MODERN'))
  )
  from public.locals l
  join public.local_commerce_settings s on s.local_id=l.id and s.storefront_enabled=true
  where l.active=true
    and (l.id::text=p_local_key or lower(l.slug)=lower(p_local_key))
    and public.local_is_owner_managed(l.id)
  limit 1;
$$;

create or replace function public.my_local_delivery_options(p_local_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when exists(
    select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
  ) then coalesce(jsonb_agg(jsonb_build_object(
      'delivery_id',d.id,'name',d.name,'logo_url',d.logo_url,'active',d.active,
      'covers_local',public.htp_delivery_covers_local(d.id,p_local_id),
      'linked',exists(select 1 from public.local_deliveries ld where ld.local_id=p_local_id and ld.delivery_id=d.id and ld.active),
      'request_status',(select r.status from public.local_delivery_partnership_requests r
        where r.local_id=p_local_id and r.delivery_id=d.id order by r.created_at desc limit 1)
    ) order by lower(d.name)) filter(where d.active and public.htp_delivery_covers_local(d.id,p_local_id)),'[]'::jsonb)
    else '[]'::jsonb end
  from public.deliveries d;
$$;

create or replace function public.request_local_delivery_partnership(p_local_id uuid,p_delivery_id uuid,p_note text default null)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
    raise exception 'HTPWEB: no administras este LOCAL';
  end if;
  if not public.local_has_live_plan(p_local_id) then raise exception 'HTPWEB: se requiere plan LOCAL vigente'; end if;
  if not public.htp_delivery_covers_local(p_delivery_id,p_local_id) then raise exception 'HTPWEB: este DELIVERY no cubre actualmente la ubicación del LOCAL'; end if;
  if exists(select 1 from public.local_deliveries ld where ld.local_id=p_local_id and ld.delivery_id=p_delivery_id and ld.active) then
    raise exception 'HTPWEB: el DELIVERY ya está vinculado';
  end if;
  insert into public.local_delivery_partnership_requests(local_id,delivery_id,requested_by,status,note)
  values(p_local_id,p_delivery_id,auth.uid(),'PENDING',nullif(trim(coalesce(p_note,'')),''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delivery_review_local_partnership(p_request_id uuid,p_accept boolean,p_note text default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare r public.local_delivery_partnership_requests%rowtype;
begin
  select * into r from public.local_delivery_partnership_requests where id=p_request_id for update;
  if not found then raise exception 'HTPWEB: solicitud inexistente'; end if;
  if r.status<>'PENDING' then raise exception 'HTPWEB: solicitud ya revisada'; end if;
  if not public.user_has_delivery(r.delivery_id) and not public.is_master() then
    raise exception 'HTPWEB: no administras este DELIVERY';
  end if;
  update public.local_delivery_partnership_requests
  set status=case when p_accept then 'ACCEPTED' else 'REJECTED' end,
      note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_request_id;
  if p_accept then
    if not public.htp_delivery_covers_local(r.delivery_id,r.local_id) then raise exception 'HTPWEB: el DELIVERY ya no cubre este LOCAL'; end if;
    insert into public.local_deliveries(local_id,delivery_id,active,created_at)
    values(r.local_id,r.delivery_id,true,now())
    on conflict(local_id,delivery_id) do update set active=true;
  end if;
  return jsonb_build_object('request_id',p_request_id,'status',case when p_accept then 'ACCEPTED' else 'REJECTED' end);
end $$;

-- Local plans: seeded without touching DELIVERY plans.
insert into public.subscription_plans(id,code,name,description,target_type,price,currency,billing_interval,duration_months,active,display_order,plan_version,created_at,updated_at)
values
(gen_random_uuid(),'LOC_PRESENCE','LOCAL Presencia','Página pública, identidad y QR.','LOCAL',0,'USD','MONTH',1,true,110,1,now(),now()),
(gen_random_uuid(),'LOC_STORE','LOCAL Tienda','Tienda, catálogo, carrito, WhatsApp, promociones y DELIVERY HTPWEB.','LOCAL',0,'USD','MONTH',1,true,120,1,now(),now()),
(gen_random_uuid(),'LOC_PRO','LOCAL Pro','Tienda completa, marketing, analytics, inventario y múltiples DELIVERY.','LOCAL',0,'USD','MONTH',1,true,130,1,now(),now())
on conflict(code) do nothing;

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'CAPABILITY',x.code,'true'::jsonb
from public.subscription_plans p
cross join lateral (values
 ('local.info.manage'),('local.media.manage'),('categories.manage'),('products.manage'),('schedules.manage')
) x(code)
where p.code in ('LOC_PRESENCE','LOC_STORE','LOC_PRO')
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value;

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'CAPABILITY',x.code,'true'::jsonb
from public.subscription_plans p
cross join lateral (values
 ('storefront.manage'),('promotions.manage'),('delivery.partnerships'),('whatsapp.orders')
) x(code)
where p.code in ('LOC_STORE','LOC_PRO')
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value;

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'CAPABILITY',x.code,'true'::jsonb
from public.subscription_plans p
cross join lateral (values
 ('marketing.manage'),('analytics.view'),('inventory.manage'),('delivery.multiple')
) x(code)
where p.code='LOC_PRO'
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value;

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,'LIMIT','max_products',to_jsonb(case p.code when 'LOC_PRESENCE' then 25 when 'LOC_STORE' then 250 else 2000 end)
from public.subscription_plans p where p.code in ('LOC_PRESENCE','LOC_STORE','LOC_PRO')
on conflict(plan_id,entitlement_type,code) do update set value=excluded.value;

-- Expand MASTER listing with ownership/plan state, while preserving existing fields.
create or replace function public.master_list_locals()
returns jsonb
language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'address',l.address,
    'latitude',l.latitude,'longitude',l.longitude,'phone',l.phone,'whatsapp',l.whatsapp,'active',l.active,
    'logo_url',l.logo_url,'banner_url',l.banner_url,'zone_id',l.zone_id,
    'business_category_id',l.business_category_id,'business_category_name',bc.name,
    'business_category_ids',coalesce((select jsonb_agg(a.category_id order by a.position) from public.local_business_category_assignments a where a.local_id=l.id),'[]'::jsonb),
    'business_category_names',coalesce((select jsonb_agg(c2.name order by a2.position) from public.local_business_category_assignments a2 join public.local_business_categories c2 on c2.id=a2.category_id where a2.local_id=l.id),'[]'::jsonb),
    'google_place_id',l.google_place_id,'google_maps_url',l.google_maps_url,'location_source',l.location_source,
    'zone_code',z.code,'zone_name',z.name,'city_id',coalesce(l.city_id,z.city_id),'canton',coalesce(lc.name,zc.name),'province',coalesce(lc.province,zc.province),
    'claimed',public.local_is_claimed(l.id),'owner_managed',public.local_is_owner_managed(l.id),
    'local_plan',(select jsonb_build_object('code',p.code,'name',p.name,'status',a.status,'ends_at',a.ends_at)
      from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
      where a.local_id=l.id and p.target_type='LOCAL' and a.status in ('ACTIVE','TRIAL','PAST_DUE')
      order by a.starts_at desc limit 1)
  ) order by coalesce(lc.province,zc.province),coalesce(lc.name,zc.name),lower(l.name)),'[]'::jsonb)
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities zc on zc.id=z.city_id
  left join public.cities lc on lc.id=l.city_id
  left join public.local_business_categories bc on bc.id=l.business_category_id
  where public.is_master();
$$;

revoke all on function public.local_commerce_snapshot(uuid) from public,anon;
revoke all on function public.save_my_local_commerce_settings(uuid,boolean,text,text,text,text,boolean,boolean,boolean,uuid,text,text) from public,anon;
revoke all on function public.public_local_storefront(text) from public;
revoke all on function public.my_local_delivery_options(uuid) from public,anon;
revoke all on function public.request_local_delivery_partnership(uuid,uuid,text) from public,anon;
revoke all on function public.delivery_review_local_partnership(uuid,boolean,text) from public,anon;
grant execute on function public.local_commerce_snapshot(uuid) to authenticated;
grant execute on function public.save_my_local_commerce_settings(uuid,boolean,text,text,text,text,boolean,boolean,boolean,uuid,text,text) to authenticated;
grant execute on function public.public_local_storefront(text) to anon,authenticated;
grant execute on function public.my_local_delivery_options(uuid) to authenticated;
grant execute on function public.request_local_delivery_partnership(uuid,uuid,text) to authenticated;
grant execute on function public.delivery_review_local_partnership(uuid,boolean,text) to authenticated;

