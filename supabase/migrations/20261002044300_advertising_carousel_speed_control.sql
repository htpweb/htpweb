alter table public.advertising_settings
  add column if not exists carousel_speed_px_s integer not null default 91
  check (carousel_speed_px_s between 20 and 300);

update public.advertising_settings
set carousel_speed_px_s=91
where singleton_id=1 and carousel_speed_px_s is null;

create or replace function public.save_advertising_carousel_speed(p_speed integer)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if p_speed is null or p_speed < 20 or p_speed > 300 then
    raise exception 'HTPWEB: velocidad de publicidad fuera de rango';
  end if;
  update public.advertising_settings
  set carousel_speed_px_s=p_speed, updated_at=now(), updated_by=auth.uid()
  where singleton_id=1;
end;
$$;

grant execute on function public.save_advertising_carousel_speed(integer) to authenticated;

create or replace function public.advertising_carousel_speed()
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (select s.carousel_speed_px_s from public.advertising_settings s where s.singleton_id=1),
    91
  );
$$;

grant execute on function public.advertising_carousel_speed() to anon, authenticated;
