
alter table public.local_deliveries
  add column if not exists share_code text;

create or replace function public.generate_local_delivery_share_code()
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_code text;
begin
  loop
    v_code:=upper(substr(md5(random()::text||clock_timestamp()::text||gen_random_uuid()::text),1,6));
    exit when not exists(
      select 1 from public.local_deliveries ld where ld.share_code=v_code
    );
  end loop;
  return v_code;
end;
$$;

do $$
declare r record;
begin
  for r in
    select local_id,delivery_id
    from public.local_deliveries
    where share_code is null or btrim(share_code)=''
  loop
    update public.local_deliveries
    set share_code=public.generate_local_delivery_share_code()
    where local_id=r.local_id and delivery_id=r.delivery_id;
  end loop;
end $$;

alter table public.local_deliveries
  alter column share_code set not null;

create unique index if not exists local_deliveries_share_code_key
  on public.local_deliveries(share_code);

create or replace function public.local_delivery_share_code_fill()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.share_code is null or btrim(new.share_code)='' then
    new.share_code:=public.generate_local_delivery_share_code();
  else
    new.share_code:=upper(btrim(new.share_code));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_local_delivery_share_code_fill on public.local_deliveries;
create trigger trg_local_delivery_share_code_fill
before insert or update of share_code on public.local_deliveries
for each row execute function public.local_delivery_share_code_fill();

create or replace function public.delivery_share_locals(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not public.is_master() then
    if public.current_role_code() <> 'DELIVERY_ADMIN' then
      raise exception 'HTPWEB: solo DELIVERY_ADMIN puede usar Compartir';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',l.id,
        'name',l.name,
        'description',l.description,
        'banner_url',l.banner_url,
        'logo_url',l.logo_url,
        'business_category_id',l.business_category_id,
        'business_category_name',bc.name,
        'zone_id',l.zone_id,
        'share_code',ld.share_code,
        'gallery_count',coalesce(g.gallery_count,0),
        'first_gallery_image_url',g.first_image_url
      )
      order by lower(l.name),l.id
    )
    from public.local_deliveries ld
    join public.locals l on l.id=ld.local_id and l.active=true
    left join public.local_business_categories bc on bc.id=l.business_category_id and bc.active=true
    left join lateral (
      select
        count(*)::integer as gallery_count,
        (array_agg(gi.image_url order by gi.display_order,gi.created_at,gi.id))[1] as first_image_url
      from public.local_gallery_images gi
      where gi.local_id=l.id and gi.active=true
    ) g on true
    where ld.delivery_id=p_delivery_id
      and ld.active=true
  ),'[]'::jsonb);
end;
$$;

revoke execute on function public.generate_local_delivery_share_code() from public;
grant execute on function public.generate_local_delivery_share_code() to service_role;
