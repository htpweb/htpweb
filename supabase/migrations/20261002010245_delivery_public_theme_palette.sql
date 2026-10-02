alter table public.deliveries
  add column if not exists theme_key text not null default 'HTPWEB';

alter table public.deliveries
  drop constraint if exists deliveries_theme_key_check;

alter table public.deliveries
  add constraint deliveries_theme_key_check
  check (theme_key in ('HTPWEB','OCEAN','SKY','FOREST','SUNSET','PURPLE','TURQUOISE','GRAPHITE'));

create or replace function public.update_my_delivery_theme(
  p_delivery_id uuid,
  p_theme_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_theme text := upper(trim(coalesce(p_theme_key,'')));
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if v_theme not in ('HTPWEB','OCEAN','SKY','FOREST','SUNSET','PURPLE','TURQUOISE','GRAPHITE') then
    raise exception 'HTPWEB: tema no válido';
  end if;

  if not exists (select 1 from public.deliveries d where d.id = p_delivery_id) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  if not public.is_master()
     and not (
       public.current_role_code() = 'DELIVERY_ADMIN'
       and public.user_has_delivery(p_delivery_id)
       and public.has_permission('deliveries.manage')
       and public.delivery_has_capability(p_delivery_id,'delivery.info.manage')
     )
  then
    raise exception 'HTPWEB: no autorizado para administrar este DELIVERY';
  end if;

  update public.deliveries
     set theme_key = v_theme,
         updated_at = now()
   where id = p_delivery_id;

  return p_delivery_id;
end;
$function$;

revoke all on function public.update_my_delivery_theme(uuid,text) from public;
grant execute on function public.update_my_delivery_theme(uuid,text) to authenticated;
