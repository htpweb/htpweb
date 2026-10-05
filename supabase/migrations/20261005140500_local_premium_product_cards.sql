-- HTPWEB premium product cards for LOCAL storefronts.
alter table public.products
  add column if not exists compare_price numeric,
  add column if not exists short_description text,
  add column if not exists badge_type text not null default 'NONE',
  add column if not exists badge_text text,
  add column if not exists featured boolean not null default false;

alter table public.products drop constraint if exists products_compare_price_check;
alter table public.products add constraint products_compare_price_check
  check(compare_price is null or compare_price>=0);

alter table public.products drop constraint if exists products_badge_type_check;
alter table public.products add constraint products_badge_type_check
  check(badge_type in ('NONE','OFFER','PROMO','NEW'));

alter table public.products drop constraint if exists products_short_description_check;
alter table public.products add constraint products_short_description_check
  check(short_description is null or length(short_description)<=320);

alter table public.products drop constraint if exists products_badge_text_check;
alter table public.products add constraint products_badge_text_check
  check(badge_text is null or length(badge_text)<=40);

create or replace function public.save_local_product_presentation(
  p_local_id uuid,
  p_product_id uuid,
  p_compare_price numeric,
  p_short_description text,
  p_badge_type text,
  p_badge_text text,
  p_featured boolean
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_price numeric;
  v_badge text:=upper(trim(coalesce(p_badge_type,'NONE')));
begin
  if not public.user_is_local_admin_for(p_local_id) then
    raise exception 'HTPWEB: no está autorizado para administrar productos de este LOCAL';
  end if;

  select p.price into v_price
  from public.products p
  where p.id=p_product_id and p.local_id=p_local_id;

  if v_price is null then
    raise exception 'HTPWEB: producto inexistente o pertenece a otro LOCAL';
  end if;

  if p_compare_price is not null and p_compare_price<0 then
    raise exception 'HTPWEB: precio anterior inválido';
  end if;

  if p_compare_price is not null and p_compare_price<=v_price then
    raise exception 'HTPWEB: el precio anterior debe ser mayor que el precio actual';
  end if;

  if v_badge not in ('NONE','OFFER','PROMO','NEW') then
    raise exception 'HTPWEB: tipo de etiqueta inválido';
  end if;

  update public.products p
  set compare_price=case when p_compare_price is null then null else round(p_compare_price,2) end,
      short_description=nullif(left(trim(coalesce(p_short_description,'')),320),''),
      badge_type=v_badge,
      badge_text=case when v_badge='NONE' then null else nullif(left(trim(coalesce(p_badge_text,'')),40),'') end,
      featured=coalesce(p_featured,false),
      updated_at=now()
  where p.id=p_product_id and p.local_id=p_local_id
  returning p.id into v_id;

  return v_id;
end $$;

revoke all on function public.save_local_product_presentation(uuid,uuid,numeric,text,text,text,boolean) from public,anon;
grant execute on function public.save_local_product_presentation(uuid,uuid,numeric,text,text,text,boolean) to authenticated;
