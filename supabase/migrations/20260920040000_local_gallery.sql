-- HTPWEB Código 93 — galería del LOCAL.
-- Las imágenes siguen almacenándose en Supabase Storage; esta tabla conserva
-- únicamente la relación y el orden visible de la galería.

create table if not exists public.local_gallery_images (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_path)
);

create index if not exists local_gallery_images_local_idx
  on public.local_gallery_images(local_id, active, display_order, created_at);

alter table public.local_gallery_images enable row level security;

revoke all on table public.local_gallery_images from public, anon;

create or replace function public.can_manage_local_gallery(p_local_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_master()
    or exists (
      select 1
      from public.user_locals ul
      where ul.user_id = auth.uid()
        and ul.local_id = p_local_id
        and ul.active = true
    );
$$;

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
        'active',g.active
      ) order by g.display_order,g.created_at,g.id)
      from public.local_gallery_images g
      where g.local_id=p_local_id and g.active=true
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.save_local_gallery_image(
  p_local_id uuid,
  p_image_id uuid,
  p_image_url text,
  p_storage_path text,
  p_display_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_image_id,gen_random_uuid());
begin
  if not public.can_manage_local_gallery(p_local_id) then
    raise exception 'HTPWEB: no tiene permiso para gestionar la galería de este LOCAL';
  end if;
  if not exists(select 1 from public.locals l where l.id=p_local_id) then
    raise exception 'HTPWEB: LOCAL inexistente';
  end if;
  if nullif(trim(coalesce(p_image_url,'')),'') is null
     or nullif(trim(coalesce(p_storage_path,'')),'') is null then
    raise exception 'HTPWEB: imagen y ruta de Storage requeridas';
  end if;
  if coalesce(p_display_order,0)<0 then
    raise exception 'HTPWEB: orden de galería inválido';
  end if;

  insert into public.local_gallery_images(
    id,local_id,image_url,storage_path,display_order,active,created_by,created_at,updated_at
  )
  values(
    v_id,p_local_id,trim(p_image_url),trim(p_storage_path),coalesce(p_display_order,0),
    true,auth.uid(),now(),now()
  )
  on conflict(id) do update set
    image_url=excluded.image_url,
    storage_path=excluded.storage_path,
    display_order=excluded.display_order,
    active=true,
    updated_at=now()
  where public.local_gallery_images.local_id=p_local_id;

  return v_id;
end;
$$;

create or replace function public.delete_local_gallery_image(
  p_local_id uuid,
  p_image_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_path text;
begin
  if not public.can_manage_local_gallery(p_local_id) then
    raise exception 'HTPWEB: no tiene permiso para gestionar la galería de este LOCAL';
  end if;

  select g.storage_path into v_path
  from public.local_gallery_images g
  where g.id=p_image_id and g.local_id=p_local_id
  for update;

  if v_path is null then
    raise exception 'HTPWEB: imagen de galería inexistente';
  end if;

  delete from public.local_gallery_images
  where id=p_image_id and local_id=p_local_id;

  return v_path;
end;
$$;

revoke all on function public.can_manage_local_gallery(uuid) from public, anon;
revoke all on function public.list_local_gallery(uuid) from public, anon;
revoke all on function public.save_local_gallery_image(uuid,uuid,text,text,integer) from public, anon;
revoke all on function public.delete_local_gallery_image(uuid,uuid) from public, anon;

grant execute on function public.can_manage_local_gallery(uuid) to authenticated;
grant execute on function public.list_local_gallery(uuid) to authenticated;
grant execute on function public.save_local_gallery_image(uuid,uuid,text,text,integer) to authenticated;
grant execute on function public.delete_local_gallery_image(uuid,uuid) to authenticated;
