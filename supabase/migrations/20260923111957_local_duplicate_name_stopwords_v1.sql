create or replace function public.htp_normalize_identity_name(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select coalesce(string_agg(w.word,' ' order by w.ord),'')
  from unnest(string_to_array(public.htp_normalize_identity_text(p_value),' ')) with ordinality as w(word,ord)
  where w.word <> ''
    and w.word not in ('de','del','la','el','los','las','un','una','restaurante','restaurant');
$$;

create or replace function public.master_find_local_duplicates_v1(
  p_name text,
  p_address text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_city_id uuid default null
)
returns table(
  id uuid,
  name text,
  address text,
  phone text,
  whatsapp text,
  latitude numeric,
  longitude numeric,
  active boolean,
  city_id uuid,
  score integer,
  distance_m integer,
  strong_match boolean,
  reasons text[]
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_name text:=public.htp_normalize_identity_name(p_name);
  v_address text:=public.htp_normalize_identity_text(p_address);
  v_phone text:=public.htp_normalize_phone(p_phone);
  v_whatsapp text:=public.htp_normalize_phone(p_whatsapp);
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if v_name='' and v_address='' and v_phone='' and v_whatsapp=''
     and (p_latitude is null or p_longitude is null) then
    return;
  end if;

  return query
  with base as (
    select
      l.*,
      public.htp_normalize_identity_name(l.name) as n_name,
      public.htp_normalize_identity_text(l.address) as n_address,
      public.htp_normalize_phone(l.phone) as n_phone,
      public.htp_normalize_phone(l.whatsapp) as n_whatsapp,
      case
        when p_latitude is null or p_longitude is null
          or l.latitude is null or l.longitude is null then null
        else round(
          111320.0 * sqrt(
            power((l.latitude-p_latitude)::double precision,2) +
            power(
              ((l.longitude-p_longitude)::double precision) *
              cos(radians(((l.latitude+p_latitude)/2)::double precision)),
              2
            )
          )
        )::integer
      end as d_m
    from public.locals l
  ),
  signals as (
    select
      b.*,
      (v_name<>'' and b.n_name=v_name) as name_exact,
      (v_name<>'' and length(v_name)>=4 and (
        b.n_name like '%'||v_name||'%' or v_name like '%'||b.n_name||'%'
      )) as name_partial,
      (v_address<>'' and b.n_address=v_address) as address_exact,
      (v_address<>'' and length(v_address)>=6 and (
        b.n_address like '%'||v_address||'%' or v_address like '%'||b.n_address||'%'
      )) as address_partial,
      (v_phone<>'' and (b.n_phone=v_phone or b.n_whatsapp=v_phone)) as phone_match,
      (v_whatsapp<>'' and (b.n_whatsapp=v_whatsapp or b.n_phone=v_whatsapp)) as whatsapp_match,
      (p_city_id is not null and b.city_id=p_city_id) as city_match
    from base b
  ),
  ranked as (
    select
      s.*,
      (
        case when s.name_exact then 50 when s.name_partial then 25 else 0 end +
        case when s.phone_match then 80 else 0 end +
        case when s.whatsapp_match then 70 else 0 end +
        case when s.address_exact then 35 when s.address_partial then 20 else 0 end +
        case
          when s.d_m is null then 0
          when s.d_m<=40 then 70
          when s.d_m<=120 then 45
          when s.d_m<=300 then 25
          when s.d_m<=800 then 10
          else 0
        end +
        case when s.city_match then 5 else 0 end
      )::integer as match_score
    from signals s
  )
  select
    r.id,r.name,r.address,r.phone,r.whatsapp,r.latitude,r.longitude,r.active,r.city_id,
    r.match_score,
    r.d_m,
    (
      r.phone_match
      or r.whatsapp_match
      or (
        r.name_exact and (
          r.address_exact
          or r.address_partial
          or (r.d_m is not null and r.d_m<=800)
        )
      )
      or (
        r.name_partial and (
          (r.address_exact and r.d_m is not null and r.d_m<=800)
          or (r.address_partial and r.d_m is not null and r.d_m<=300)
          or (r.d_m is not null and r.d_m<=120)
        )
      )
    ) as strong_match,
    array_remove(array[
      case when r.name_exact then 'NAME_EXACT' when r.name_partial then 'NAME_PARTIAL' end,
      case when r.phone_match then 'PHONE' end,
      case when r.whatsapp_match then 'WHATSAPP' end,
      case when r.address_exact then 'ADDRESS_EXACT' when r.address_partial then 'ADDRESS_PARTIAL' end,
      case
        when r.d_m is not null and r.d_m<=40 then 'COORDINATES_40M'
        when r.d_m is not null and r.d_m<=120 then 'COORDINATES_120M'
        when r.d_m is not null and r.d_m<=300 then 'COORDINATES_300M'
        when r.d_m is not null and r.d_m<=800 then 'COORDINATES_800M'
      end,
      case when r.city_match then 'CITY' end
    ],null)::text[] as reasons
  from ranked r
  where r.match_score>0
  order by strong_match desc, r.match_score desc, r.d_m nulls last, r.name
  limit 10;
end;
$$;
