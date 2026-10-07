-- HTPWEB · editor visual de proyectos por página
alter table public.local_gallery_images
  add column if not exists title text,
  add column if not exists description text;

create or replace function public.list_local_gallery(p_local_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case
    when not public.can_manage_local_gallery(p_local_id) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,
        'local_id',g.local_id,
        'image_url',g.image_url,
        'storage_path',g.storage_path,
        'display_order',g.display_order,
        'title',g.title,
        'description',g.description,
        'active',g.active
      ) order by g.display_order,g.created_at,g.id)
      from public.local_gallery_images g
      where g.local_id=p_local_id and g.active=true
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.public_list_local_gallery(p_local_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case
    when not exists (
      select 1 from public.locals l
      where l.id=p_local_id and l.active=true
    ) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,
        'image_url',g.image_url,
        'display_order',g.display_order,
        'title',g.title,
        'description',g.description
      ) order by g.display_order,g.created_at,g.id)
      from public.local_gallery_images g
      where g.local_id=p_local_id
        and g.active=true
        and nullif(trim(coalesce(g.image_url,'')),'') is not null
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.update_local_gallery_project(
  p_local_id uuid,
  p_image_id uuid,
  p_title text default null,
  p_description text default null,
  p_display_order integer default 0
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.can_manage_local_gallery(p_local_id) then
    raise exception 'HTPWEB: no tiene permiso para gestionar los proyectos de este LOCAL';
  end if;
  if coalesce(p_display_order,0)<0 then
    raise exception 'HTPWEB: orden de proyecto inválido';
  end if;

  update public.local_gallery_images
  set title=nullif(trim(coalesce(p_title,'')),''),
      description=nullif(trim(coalesce(p_description,'')),''),
      display_order=coalesce(p_display_order,0),
      updated_at=now()
  where id=p_image_id and local_id=p_local_id;

  if not found then
    raise exception 'HTPWEB: proyecto inexistente';
  end if;
end;
$$;

revoke all on function public.update_local_gallery_project(uuid,uuid,text,text,integer) from public, anon;
grant execute on function public.update_local_gallery_project(uuid,uuid,text,text,integer) to authenticated;
