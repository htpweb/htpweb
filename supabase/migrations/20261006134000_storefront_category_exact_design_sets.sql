insert into public.local_storefront_presets(code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config,active,display_order)
values('FASHION_SIGNATURE','Vitrina · Signature','Boutiques, calzado, accesorios, moda y lifestyle','Diseño insignia de moda con composición visual premium, navegación superior y catálogo editorial.','FASHION','CARDS','PHOTO',
jsonb_build_object('design_system','SIGNATURE','design_rank',1,'category_label','Moda & Boutique','navigation_style','TOP','button_style','SOFT_RECT','header_style','FLOATING','hero_style','SIGNATURE','card_style','ELEVATED','content_width','WIDE','catalog_label','Colección','product_image_ratio','3:4'),true,3001)
on conflict(code) do update set config=excluded.config,active=true,display_order=excluded.display_order;

create or replace function public.my_local_storefront_design_options(p_local_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_is_master boolean:=public.is_master(); v_is_owner boolean; v_families text[]; v_recommended text[]; v_categories jsonb; v_presets jsonb;
begin
 select exists(select 1 from public.user_locals ul where ul.user_id=auth.uid() and ul.local_id=p_local_id) into v_is_owner;
 if not v_is_master and not v_is_owner then raise exception 'HTPWEB: no administras este LOCAL'; end if;
 with cats as (
  select distinct c.id,c.name,c.recommended_preset_code,p.layout_family from public.local_business_category_assignments a join public.local_business_categories c on c.id=a.category_id and c.active=true left join public.local_storefront_presets p on p.code=c.recommended_preset_code where a.local_id=p_local_id
  union
  select distinct c.id,c.name,c.recommended_preset_code,p.layout_family from public.locals l join public.local_business_categories c on c.id=l.business_category_id and c.active=true left join public.local_storefront_presets p on p.code=c.recommended_preset_code where l.id=p_local_id and l.business_category_id is not null
 )
 select coalesce(array_agg(distinct layout_family) filter(where layout_family is not null),'{}'::text[]),
 coalesce(array_agg(distinct recommended_preset_code) filter(where recommended_preset_code is not null),'{}'::text[]),
 coalesce(jsonb_agg(distinct jsonb_build_object('id',id,'name',name,'recommended_preset_code',recommended_preset_code,'layout_family',layout_family)),'[]'::jsonb)
 into v_families,v_recommended,v_categories from cats;
 if v_is_master then
  select coalesce(jsonb_agg(to_jsonb(p) order by p.display_order,p.name),'[]') into v_presets from public.local_storefront_presets p where p.active;
 elsif cardinality(v_families)>0 then
  select coalesce(jsonb_agg(to_jsonb(p) order by p.display_order,p.name),'[]') into v_presets from public.local_storefront_presets p
  where p.active and p.layout_family=any(v_families) and (coalesce((p.config->>'design_rank')::int,1)>1 or p.code=any(v_recommended) or (p.layout_family='FASHION' and p.code='FASHION_SIGNATURE'));
 else
  select coalesce(jsonb_agg(to_jsonb(p) order by p.display_order,p.name),'[]') into v_presets from public.local_storefront_presets p where p.active and p.layout_family='GENERAL';
 end if;
 return jsonb_build_object('master',v_is_master,'categories',v_categories,'families',to_jsonb(v_families),'presets',v_presets);
end $$;
grant execute on function public.my_local_storefront_design_options(uuid) to authenticated;
