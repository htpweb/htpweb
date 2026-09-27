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
        ),
        'categories', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', grouped.category_id,
                'name', grouped.category_name,
                'display_order', grouped.category_display_order,
                'first_product_order', grouped.first_product_order
              )
              order by grouped.first_product_order, grouped.category_name
            )
            from (
              select
                p.category_id,
                coalesce(c.name,'Otros') as category_name,
                coalesce(c.display_order,9999) as category_display_order,
                min(mpp.display_order) as first_product_order
              from public.local_menu_page_products mpp
              join public.products p on p.id=mpp.product_id
              left join public.categories c on c.id=p.category_id
              where mpp.page_id=mp.id
                and p.local_id=mp.local_id
                and p.active=true
                and p.catalog_visible=true
              group by p.category_id,c.name,c.display_order
            ) grouped
          ),
          '[]'::jsonb
        )
      )
      order by mp.display_order,mp.created_at
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
grant execute on function public.public_local_menu_pages(uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';
