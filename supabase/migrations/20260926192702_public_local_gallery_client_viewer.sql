-- Public read-only gallery for CLIENT experience.
-- Exposes only active image URLs for active LOCAL records; never storage paths or management metadata.

create or replace function public.public_list_local_gallery(p_local_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.locals l
      where l.id = p_local_id
        and l.active = true
    ) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'image_url', g.image_url,
          'display_order', g.display_order
        )
        order by g.display_order, g.created_at, g.id
      )
      from public.local_gallery_images g
      where g.local_id = p_local_id
        and g.active = true
        and nullif(trim(coalesce(g.image_url, '')), '') is not null
    ), '[]'::jsonb)
  end;
$$;

revoke all on function public.public_list_local_gallery(uuid) from public;
grant execute on function public.public_list_local_gallery(uuid) to anon, authenticated, service_role;
