-- HTPWEB · servicios editables dentro del editor visual del LOCAL.
create or replace function public.sanitize_local_services(p_services jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select case
    when jsonb_typeof(coalesce(p_services,'[]'::jsonb)) <> 'array' then '[]'::jsonb
    else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', left(coalesce(nullif(trim(x.item->>'id'),''), x.ord::text),80),
          'title', left(coalesce(x.item->>'title',''),120),
          'description', left(coalesce(x.item->>'description',''),700),
          'image_url', left(coalesce(x.item->>'image_url',''),1400),
          'storage_path', left(coalesce(x.item->>'storage_path',''),700),
          'display_order', greatest(0,least(99,coalesce(nullif(x.item->>'display_order','')::integer,(x.ord-1)::integer)))
        )
        order by greatest(0,least(99,coalesce(nullif(x.item->>'display_order','')::integer,(x.ord-1)::integer))), x.ord
      )
      from jsonb_array_elements(p_services) with ordinality as x(item,ord)
      where x.ord <= 24 and jsonb_typeof(x.item)='object'
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.save_my_local_services(p_local_id uuid,p_services jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_services jsonb;
begin
  if not exists(
    select 1 from public.user_locals ul
    where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
  ) then
    raise exception 'HTPWEB: no administras este LOCAL';
  end if;
  if not public.local_has_live_plan(p_local_id) then
    raise exception 'HTPWEB: se requiere un plan LOCAL vigente';
  end if;

  v_services=public.sanitize_local_services(p_services);

  insert into public.local_commerce_settings(local_id,content_config,updated_by,created_at,updated_at)
  values(p_local_id,jsonb_build_object('services',v_services),auth.uid(),now(),now())
  on conflict(local_id) do update set
    content_config=jsonb_set(coalesce(public.local_commerce_settings.content_config,'{}'::jsonb),'{services}',v_services,true),
    updated_by=auth.uid(),
    updated_at=now();

  return v_services;
end;
$$;

create or replace function public.save_my_local_storefront_content(
 p_local_id uuid,p_theme_code text,p_content_config jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cfg jsonb;
declare v_import jsonb;
declare v_services jsonb;
declare v_existing_services jsonb;
begin
 if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
   raise exception 'HTPWEB: no administras este LOCAL';
 end if;
 if not public.local_has_live_plan(p_local_id) then raise exception 'HTPWEB: se requiere un plan LOCAL vigente'; end if;
 if not exists(select 1 from public.local_storefront_themes t where t.code=p_theme_code and t.active) then
   raise exception 'HTPWEB: paleta inválida';
 end if;
 if p_content_config is null or jsonb_typeof(p_content_config)<>'object' then raise exception 'HTPWEB: contenido inválido'; end if;

 select s.content_config->'services' into v_existing_services
 from public.local_commerce_settings s where s.local_id=p_local_id;

 v_import=case
   when jsonb_typeof(p_content_config->'imported_design')='object'
    and pg_column_size(p_content_config->'imported_design')<=20000
   then p_content_config->'imported_design'
   else null
 end;

 v_services=case
   when p_content_config ? 'services' then public.sanitize_local_services(p_content_config->'services')
   when jsonb_typeof(v_existing_services)='array' then v_existing_services
   else '[]'::jsonb
 end;

 v_cfg=jsonb_build_object(
   'hero_title',left(coalesce(p_content_config->>'hero_title',''),120),
   'hero_subtitle',left(coalesce(p_content_config->>'hero_subtitle',''),260),
   'about_title',left(coalesce(p_content_config->>'about_title','Quiénes somos'),80),
   'about_text',left(coalesce(p_content_config->>'about_text',''),1600),
   'catalog_title',left(coalesce(p_content_config->>'catalog_title',''),80),
   'projects_title',left(coalesce(p_content_config->>'projects_title','Proyectos'),80),
   'projects_text',left(coalesce(p_content_config->>'projects_text',''),600),
   'blog_title',left(coalesce(p_content_config->>'blog_title','Blog'),80),
   'contact_title',left(coalesce(p_content_config->>'contact_title','Contacto'),80),
   'show_about',coalesce((p_content_config->>'show_about')::boolean,true),
   'show_catalog',coalesce((p_content_config->>'show_catalog')::boolean,true),
   'show_projects',coalesce((p_content_config->>'show_projects')::boolean,true),
   'show_blog',coalesce((p_content_config->>'show_blog')::boolean,true),
   'show_contact',coalesce((p_content_config->>'show_contact')::boolean,true),
   'show_promotions',coalesce((p_content_config->>'show_promotions')::boolean,true),
   'services',v_services,
   'imported_design',v_import
 );

 insert into public.local_commerce_settings(local_id,theme_code,content_config,updated_by,created_at,updated_at)
 values(p_local_id,p_theme_code,v_cfg,auth.uid(),now(),now())
 on conflict(local_id) do update set
   theme_code=excluded.theme_code,
   content_config=excluded.content_config,
   updated_by=auth.uid(),
   updated_at=now();

 return public.local_commerce_snapshot(p_local_id);
end;
$$;

revoke all on function public.sanitize_local_services(jsonb) from public,anon;
grant execute on function public.sanitize_local_services(jsonb) to authenticated,service_role;
revoke all on function public.save_my_local_services(uuid,jsonb) from public,anon;
grant execute on function public.save_my_local_services(uuid,jsonb) to authenticated;
