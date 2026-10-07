-- HTPWEB · editor visual libre protegido: textos, estilos e imágenes por elemento.
create or replace function public.save_my_local_editor_overrides(
  p_local_id uuid,
  p_editor_overrides jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_value jsonb;
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
  if p_editor_overrides is null or jsonb_typeof(p_editor_overrides)<>'object' then
    raise exception 'HTPWEB: configuración visual inválida';
  end if;
  if pg_column_size(p_editor_overrides)>120000 then
    raise exception 'HTPWEB: la configuración visual supera el límite permitido';
  end if;
  v_value=p_editor_overrides;
  insert into public.local_commerce_settings(local_id,content_config,updated_by,created_at,updated_at)
  values(p_local_id,jsonb_build_object('editor_overrides',v_value),auth.uid(),now(),now())
  on conflict(local_id) do update set
    content_config=jsonb_set(coalesce(public.local_commerce_settings.content_config,'{}'::jsonb),'{editor_overrides}',v_value,true),
    updated_by=auth.uid(),updated_at=now();
  return v_value;
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
declare v_editor_overrides jsonb;
declare v_existing_overrides jsonb;
begin
 if not exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active) then
   raise exception 'HTPWEB: no administras este LOCAL';
 end if;
 if not public.local_has_live_plan(p_local_id) then raise exception 'HTPWEB: se requiere un plan LOCAL vigente'; end if;
 if not exists(select 1 from public.local_storefront_themes t where t.code=p_theme_code and t.active) then
   raise exception 'HTPWEB: paleta inválida';
 end if;
 if p_content_config is null or jsonb_typeof(p_content_config)<>'object' then raise exception 'HTPWEB: contenido inválido'; end if;

 select s.content_config->'services',s.content_config->'editor_overrides'
 into v_existing_services,v_existing_overrides
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

 v_editor_overrides=case
   when jsonb_typeof(p_content_config->'editor_overrides')='object'
    and pg_column_size(p_content_config->'editor_overrides')<=120000
   then p_content_config->'editor_overrides'
   when jsonb_typeof(v_existing_overrides)='object' then v_existing_overrides
   else '{}'::jsonb
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
   'editor_overrides',v_editor_overrides,
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

revoke all on function public.save_my_local_editor_overrides(uuid,jsonb) from public,anon;
grant execute on function public.save_my_local_editor_overrides(uuid,jsonb) to authenticated;
