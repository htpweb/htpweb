-- HTPWEB — guardia de duplicados para aplicar fichas desde paquete.
-- Antes de crear un LOCAL, reutiliza una coincidencia fuerte única.

create or replace function public.master_apply_local_package_profile_v2(
  p_local_id uuid,
  p_city_id uuid,
  p_business_category_id uuid,
  p_name text,
  p_description text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text,
  p_whatsapp text,
  p_location_url text,
  p_activate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_local_id uuid:=p_local_id;
  v_match record;
  v_second record;
  v_result jsonb;
  v_reused boolean:=false;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if v_local_id is null then
    select *
    into v_match
    from public.master_find_local_duplicates_v1(
      p_name,p_address,p_phone,p_whatsapp,p_latitude,p_longitude,p_city_id
    )
    where strong_match=true
    order by score desc,distance_m nulls last
    limit 1;

    if found then
      select *
      into v_second
      from public.master_find_local_duplicates_v1(
        p_name,p_address,p_phone,p_whatsapp,p_latitude,p_longitude,p_city_id
      )
      where strong_match=true
        and id<>v_match.id
      order by score desc,distance_m nulls last
      limit 1;

      if found and v_second.score >= v_match.score-15 then
        raise exception
          'HTPWEB: coincidencia duplicada ambigua para %. Revise los LOCAL existentes % y %',
          p_name,v_match.name,v_second.name;
      end if;

      v_local_id:=v_match.id;
      v_reused:=true;
    end if;
  end if;

  v_result:=public.master_apply_local_package_profile_v1(
    v_local_id,
    p_city_id,
    p_business_category_id,
    p_name,
    p_description,
    p_address,
    p_latitude,
    p_longitude,
    p_phone,
    p_whatsapp,
    p_location_url,
    p_activate
  );

  return v_result || jsonb_build_object(
    'duplicate_reused',v_reused,
    'duplicate_source_id',case when v_reused then v_local_id else null end
  );
end;
$$;

revoke all on function public.master_apply_local_package_profile_v2(
  uuid,uuid,uuid,text,text,text,numeric,numeric,text,text,text,boolean
) from public,anon;

grant execute on function public.master_apply_local_package_profile_v2(
  uuid,uuid,uuid,text,text,text,numeric,numeric,text,text,text,boolean
) to authenticated;
