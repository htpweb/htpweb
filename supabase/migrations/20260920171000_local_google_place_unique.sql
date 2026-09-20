-- HTPWEB Código 97 — protección de duplicados Google en LOCAL.
-- Refuerza en PostgreSQL la validación ya existente en master_save_local_v3.

do $$
begin
  if exists(
    select 1
    from public.locals
    where google_place_id is not null
      and btrim(google_place_id)<>''
    group by google_place_id
    having count(*)>1
  ) then
    raise exception 'HTPWEB: existen LOCAL duplicados por Google Place ID; corríjalos antes de aplicar Código 97';
  end if;
end;
$$;

create unique index if not exists locals_google_place_id_uidx
  on public.locals((btrim(google_place_id)))
  where google_place_id is not null and btrim(google_place_id)<>'';
