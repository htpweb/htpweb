create or replace function public.public_htpweb_directory(
  p_sector_id uuid default null::uuid,
  p_category_id uuid default null::uuid,
  p_search text default null::text,
  p_limit integer default 48,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,48),1),96);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_q text:=lower(trim(coalesce(p_search,'')));
begin
 return jsonb_build_object(
  'items',coalesce((
   select jsonb_agg(row_data order by sort_name)
   from (
    select lower(l.name) sort_name,jsonb_build_object(
      'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,
      'banner_url',l.banner_url,'logo_url',l.logo_url,'address',l.address,
      'city',coalesce(ci.name,z.city),
      'province',coalesce(ci.province,z.province),
      'country',coalesce(ci.country,z.country),
      'category_name',bc.name,
      'claimed',public.local_is_owner_managed(l.id),
      'delivery_count',(select count(*) from public.local_deliveries ld join public.deliveries d on d.id=ld.delivery_id and d.active where ld.local_id=l.id and ld.active),
      'category_ids',coalesce((select jsonb_agg(a.category_id order by a.position)
        from public.local_business_category_assignments a where a.local_id=l.id),'[]'::jsonb),
      'sector_ids',coalesce((select jsonb_agg(distinct c.sector_id)
        from public.local_business_category_assignments a
        join public.local_business_categories c on c.id=a.category_id
        where a.local_id=l.id and c.sector_id is not null),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(to_jsonb(pv) order by pv.display_order,pv.name)
        from (select p.id,p.name,p.description,p.price,p.image_url,p.display_order
              from public.products p where p.local_id=l.id and p.active=true and p.catalog_visible=true
              order by p.display_order,p.name limit 3) pv),'[]'::jsonb)
    ) row_data
    from public.locals l
    left join public.cities ci on ci.id=l.city_id
    left join public.zones z on z.id=l.zone_id
    left join public.local_business_categories bc on bc.id=l.business_category_id
    where l.active=true
      and (p_category_id is null or exists(select 1 from public.local_business_category_assignments a where a.local_id=l.id and a.category_id=p_category_id))
      and (p_sector_id is null or exists(select 1 from public.local_business_category_assignments a
          join public.local_business_categories c on c.id=a.category_id
          where a.local_id=l.id and c.sector_id=p_sector_id))
      and (v_q='' or lower(concat_ws(' ',l.name,l.description,l.address,coalesce(ci.name,z.city),coalesce(ci.province,z.province),bc.name)) like '%'||v_q||'%'
        or exists(select 1 from public.products p where p.local_id=l.id and p.active=true and p.catalog_visible=true
          and lower(concat_ws(' ',p.name,p.description)) like '%'||v_q||'%'))
    order by lower(l.name)
    limit v_limit offset v_offset
   ) q
  ),'[]'::jsonb),
  'limit',v_limit,'offset',v_offset
 );
end;
$function$;
