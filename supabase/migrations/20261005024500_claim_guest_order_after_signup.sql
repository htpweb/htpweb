-- Allow a guest checkout order to be linked to the account the customer opens
-- immediately after checkout. The browser must present both the unguessable
-- order UUID and the phone used on that guest order.
create or replace function public.claim_my_guest_order(
  p_order_id uuid,
  p_phone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_phone text;
  v_guest_customer uuid;
  v_account_customer uuid;
begin
  if v_user is null then
    raise exception 'HTPWEB: se requiere autenticación';
  end if;

  v_phone := regexp_replace(coalesce(p_phone,''),'\D','','g');
  if left(v_phone,2)='00' then
    v_phone := substring(v_phone from 3);
  end if;
  if v_phone ~ '^0[0-9]{9}$' then
    v_phone := '593' || substring(v_phone from 2);
  elsif v_phone ~ '^9[0-9]{8}$' then
    v_phone := '593' || v_phone;
  end if;

  if v_phone !~ '^[0-9]{8,15}$' then
    raise exception 'HTPWEB: teléfono inválido';
  end if;

  select o.customer_id
    into v_guest_customer
  from public.orders o
  join public.customers c on c.id=o.customer_id
  where o.id=p_order_id
    and c.profile_id is null
    and c.active=true
    and (
      case
        when left(regexp_replace(coalesce(c.phone,''),'\D','','g'),2)='00'
          then substring(regexp_replace(coalesce(c.phone,''),'\D','','g') from 3)
        when regexp_replace(coalesce(c.phone,''),'\D','','g') ~ '^0[0-9]{9}$'
          then '593' || substring(regexp_replace(coalesce(c.phone,''),'\D','','g') from 2)
        when regexp_replace(coalesce(c.phone,''),'\D','','g') ~ '^9[0-9]{8}$'
          then '593' || regexp_replace(coalesce(c.phone,''),'\D','','g')
        else regexp_replace(coalesce(c.phone,''),'\D','','g')
      end
    )=v_phone
  for update of o,c;

  if v_guest_customer is null then
    -- It may already have been claimed by this same account.
    if exists(
      select 1
      from public.orders o
      join public.customers c on c.id=o.customer_id
      where o.id=p_order_id and c.profile_id=v_user
    ) then
      return true;
    end if;
    raise exception 'HTPWEB: no se pudo vincular este pedido invitado';
  end if;

  select c.id
    into v_account_customer
  from public.customers c
  where c.profile_id=v_user
  order by c.active desc,c.updated_at desc
  limit 1
  for update;

  if v_account_customer is null then
    update public.customers c
       set profile_id=v_user,
           email=coalesce(c.email,(select u.email from auth.users u where u.id=v_user)),
           active=true,
           updated_at=now()
     where c.id=v_guest_customer;
  else
    update public.customers c
       set active=true,
           updated_at=now()
     where c.id=v_account_customer;

    update public.orders o
       set customer_id=v_account_customer,
           updated_at=now()
     where o.id=p_order_id
       and o.customer_id=v_guest_customer;
  end if;

  return true;
end;
$function$;

revoke all on function public.claim_my_guest_order(uuid,text) from public;
grant execute on function public.claim_my_guest_order(uuid,text) to authenticated;
