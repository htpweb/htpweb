create table if not exists public.local_menu_pages (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  title text,
  image_url text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(local_id, display_order)
);

create table if not exists public.local_menu_page_products (
  page_id uuid not null references public.local_menu_pages(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key(page_id, product_id)
);

create index if not exists local_menu_pages_local_active_idx
  on public.local_menu_pages(local_id, active, display_order);

create index if not exists local_menu_page_products_product_idx
  on public.local_menu_page_products(product_id);

alter table public.local_menu_pages enable row level security;
alter table public.local_menu_page_products enable row level security;

revoke all on public.local_menu_pages from public, anon, authenticated;
revoke all on public.local_menu_page_products from public, anon, authenticated;

create or replace function public.public_local_menu_pages(p_local_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mp.id,
        'title', mp.title,
        'image_url', mp.image_url,
        'display_order', mp.display_order,
        'product_ids', coalesce(
          (
            select jsonb_agg(mpp.product_id order by mpp.display_order, p.display_order, p.name)
            from public.local_menu_page_products mpp
            join public.products p on p.id=mpp.product_id
            where mpp.page_id=mp.id
              and p.local_id=mp.local_id
              and p.active=true
              and p.catalog_visible=true
          ),
          '[]'::jsonb
        )
      )
      order by mp.display_order, mp.created_at
    ),
    '[]'::jsonb
  )
  from public.local_menu_pages mp
  join public.locals l on l.id=mp.local_id
  where mp.local_id=p_local_id
    and mp.active=true
    and l.active=true;
$$;

revoke all on function public.public_local_menu_pages(uuid) from public;
grant execute on function public.public_local_menu_pages(uuid) to anon, authenticated, service_role;

insert into public.local_menu_pages(local_id,title,image_url,display_order,active)
select
  l.id,
  'Menú completo',
  'https://hwfloywzqlgqieonuswl.supabase.co/storage/v1/object/public/htpweb-media/menu-source/34-cedenazo/menu.jpg',
  0,
  true
from public.locals l
where l.name='Parrilladas Cedeño'
on conflict(local_id,display_order) do update
set
  title=excluded.title,
  image_url=excluded.image_url,
  active=true,
  updated_at=now();

insert into public.local_menu_page_products(page_id,product_id,display_order)
select
  mp.id,
  p.id,
  row_number() over(order by c.display_order,p.display_order,p.name)::integer
from public.local_menu_pages mp
join public.locals l on l.id=mp.local_id
join public.products p on p.local_id=l.id
left join public.categories c on c.id=p.category_id
where l.name='Parrilladas Cedeño'
  and mp.display_order=0
  and p.active=true
  and p.catalog_visible=true
on conflict(page_id,product_id) do update
set display_order=excluded.display_order;

notify pgrst, 'reload schema';
