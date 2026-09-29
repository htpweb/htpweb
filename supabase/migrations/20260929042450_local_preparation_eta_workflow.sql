alter table public.order_locals
  add column if not exists prep_requested_at timestamptz,
  add column if not exists prep_response_at timestamptz,
  add column if not exists prep_estimate_minutes integer,
  add column if not exists estimated_ready_at timestamptz;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.order_locals'::regclass
      and conname='order_locals_prep_estimate_minutes_check'
  ) then
    alter table public.order_locals
      add constraint order_locals_prep_estimate_minutes_check
      check (prep_estimate_minutes is null or prep_estimate_minutes between 5 and 180);
  end if;
end
$block$;

create table if not exists private.order_local_response_tokens(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'SENT'
    check (status in ('SENT','CONFIRMED','CANCELLED','EXPIRED')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  preparation_minutes integer
    check (preparation_minutes is null or preparation_minutes between 5 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_local_response_tokens_lookup
  on private.order_local_response_tokens(order_id,local_id,requested_at desc);

create unique index if not exists ux_order_local_response_tokens_sent
  on private.order_local_response_tokens(order_id,local_id)
  where status='SENT';

alter table private.order_local_response_tokens enable row level security;
revoke all on table private.order_local_response_tokens from public,anon,authenticated;

drop policy if exists order_local_response_tokens_deny_all
  on private.order_local_response_tokens;
create policy order_local_response_tokens_deny_all
  on private.order_local_response_tokens
  for all to public
  using (false)
  with check (false);

create or replace function private.hash_local_response_token(p_token text)
returns text
language sql
immutable
security definer
set search_path=''
as $function$
  select encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
$function$;

revoke all on function private.hash_local_response_token(text)
from public,anon,authenticated;

create or replace function public.delivery_prepare_local_order_request(
  p_delivery_id uuid,
  p_order_id uuid,
  p_local_id uuid,
  p_ttl_minutes integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order_status text;
  v_local_status text;
  v_token text;
  v_token_hash text;
  v_request_id uuid;
  v_expires_at timestamptz;
begin
  if p_delivery_id is null or p_order_id is null or p_local_id is null then
    raise exception 'HTPWEB: delivery, pedido y LOCAL son obligatorios';
  end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para solicitar preparación al LOCAL';
  end if;

  if coalesce(p_ttl_minutes,0) < 15 or p_ttl_minutes > 1440 then
    raise exception 'HTPWEB: vigencia de enlace inválida';
  end if;

  select o.status,ol.status
  into v_order_status,v_local_status
  from public.orders o
  join public.order_locals ol
    on ol.order_id=o.id and ol.local_id=p_local_id
  where o.id=p_order_id
    and o.delivery_id=p_delivery_id
  for update of ol;

  if not found then
    raise exception 'HTPWEB: el LOCAL no pertenece a este pedido';
  end if;

  if v_order_status not in ('CONFIRMED','PREPARING') then
    raise exception 'HTPWEB: primero confirma el pedido antes de solicitar al LOCAL';
  end if;

  if v_local_status in ('READY','CANCELLED') then
    raise exception 'HTPWEB: este LOCAL ya no requiere una solicitud de preparación';
  end if;

  update private.order_local_response_tokens
  set status='CANCELLED',updated_at=now()
  where order_id=p_order_id
    and local_id=p_local_id
    and status='SENT';

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash:=private.hash_local_response_token(v_token);
  v_expires_at:=now()+make_interval(mins=>p_ttl_minutes);

  insert into private.order_local_response_tokens(
    delivery_id,order_id,local_id,token_hash,status,
    requested_by,requested_at,expires_at,created_at,updated_at
  )
  values(
    p_delivery_id,p_order_id,p_local_id,v_token_hash,'SENT',
    auth.uid(),now(),v_expires_at,now(),now()
  )
  returning id into v_request_id;

  update public.order_locals
  set prep_requested_at=now(),
      prep_response_at=null,
      prep_estimate_minutes=null,
      estimated_ready_at=null,
      updated_at=now()
  where order_id=p_order_id and local_id=p_local_id;

  return jsonb_build_object(
    'request_id',v_request_id,
    'order_id',p_order_id,
    'local_id',p_local_id,
    'token',v_token,
    'expires_at',v_expires_at
  );
end;
$function$;

revoke all on function public.delivery_prepare_local_order_request(uuid,uuid,uuid,integer)
from public,anon;
grant execute on function public.delivery_prepare_local_order_request(uuid,uuid,uuid,integer)
to authenticated,service_role;

create or replace function public.local_order_response_context(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_req record;
  v_items jsonb;
begin
  if length(coalesce(p_token,'')) < 40 then
    return jsonb_build_object('valid',false);
  end if;

  select
    r.id,r.delivery_id,r.order_id,r.local_id,r.status,
    r.requested_at,r.expires_at,r.responded_at,r.preparation_minutes,
    d.name as delivery_name,l.name as local_name,
    o.notes,ol.estimated_ready_at
  into v_req
  from private.order_local_response_tokens r
  join public.orders o on o.id=r.order_id and o.delivery_id=r.delivery_id
  join public.order_locals ol on ol.order_id=r.order_id and ol.local_id=r.local_id
  join public.deliveries d on d.id=r.delivery_id
  join public.locals l on l.id=r.local_id
  where r.token_hash=private.hash_local_response_token(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('valid',false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name',oi.product_name,
    'variant_name',oi.variant_name,
    'quantity',oi.quantity,
    'promotion_title',oi.promotion_title
  ) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_items
  from public.order_items oi
  where oi.order_id=v_req.order_id
    and oi.local_id=v_req.local_id;

  return jsonb_build_object(
    'valid',true,
    'expired',v_req.expires_at<=now() and v_req.status='SENT',
    'status',case
      when v_req.expires_at<=now() and v_req.status='SENT' then 'EXPIRED'
      else v_req.status
    end,
    'order_ref',upper(substr(replace(v_req.order_id::text,'-',''),1,8)),
    'delivery_name',v_req.delivery_name,
    'local_name',v_req.local_name,
    'requested_at',v_req.requested_at,
    'expires_at',v_req.expires_at,
    'responded_at',v_req.responded_at,
    'preparation_minutes',v_req.preparation_minutes,
    'estimated_ready_at',v_req.estimated_ready_at,
    'notes',v_req.notes,
    'items',v_items
  );
end;
$function$;

revoke all on function public.local_order_response_context(text) from public;
grant execute on function public.local_order_response_context(text)
to anon,authenticated,service_role;

create or replace function public.local_order_response_confirm(
  p_token text,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_req private.order_local_response_tokens%rowtype;
  v_old_local_status text;
  v_old_order_status text;
  v_estimated_ready_at timestamptz;
begin
  if p_minutes is null or p_minutes < 5 or p_minutes > 180 then
    raise exception 'HTPWEB: el tiempo de preparación debe estar entre 5 y 180 minutos';
  end if;

  select *
  into v_req
  from private.order_local_response_tokens r
  where r.token_hash=private.hash_local_response_token(p_token)
  limit 1
  for update;

  if not found then
    raise exception 'HTPWEB: enlace inválido';
  end if;

  if v_req.status='CONFIRMED' then
    select ol.estimated_ready_at into v_estimated_ready_at
    from public.order_locals ol
    where ol.order_id=v_req.order_id and ol.local_id=v_req.local_id;

    return jsonb_build_object(
      'ok',true,
      'already_confirmed',true,
      'preparation_minutes',v_req.preparation_minutes,
      'estimated_ready_at',v_estimated_ready_at
    );
  end if;

  if v_req.status<>'SENT' or v_req.expires_at<=now() then
    if v_req.status='SENT' and v_req.expires_at<=now() then
      update private.order_local_response_tokens
      set status='EXPIRED',updated_at=now()
      where id=v_req.id;
    end if;
    raise exception 'HTPWEB: este enlace ya no está disponible';
  end if;

  select o.status,ol.status
  into v_old_order_status,v_old_local_status
  from public.orders o
  join public.order_locals ol
    on ol.order_id=o.id and ol.local_id=v_req.local_id
  where o.id=v_req.order_id
    and o.delivery_id=v_req.delivery_id
  for update of o,ol;

  if not found or v_old_order_status in ('DELIVERED','CANCELLED')
     or v_old_local_status in ('READY','CANCELLED')
  then
    raise exception 'HTPWEB: el pedido ya no admite confirmación del LOCAL';
  end if;

  v_estimated_ready_at:=now()+make_interval(mins=>p_minutes);

  update private.order_local_response_tokens
  set status='CONFIRMED',
      responded_at=now(),
      preparation_minutes=p_minutes,
      updated_at=now()
  where id=v_req.id;

  update public.order_locals
  set status=case
        when status in ('PENDING','CONFIRMED') then 'PREPARING'
        else status
      end,
      confirmed_at=coalesce(confirmed_at,now()),
      preparing_at=coalesce(preparing_at,now()),
      prep_response_at=now(),
      prep_estimate_minutes=p_minutes,
      estimated_ready_at=v_estimated_ready_at,
      updated_at=now()
  where order_id=v_req.order_id
    and local_id=v_req.local_id;

  if v_old_local_status is distinct from 'PREPARING'
     and v_old_local_status in ('PENDING','CONFIRMED')
  then
    insert into public.order_status_history(
      order_id,local_id,old_status,new_status,
      actor_user_id,actor_role,note,created_at
    )
    values(
      v_req.order_id,v_req.local_id,v_old_local_status,'PREPARING',
      null,'LOCAL_WHATSAPP_LINK',
      'LOCAL confirmó preparación: '||p_minutes::text||' min',
      now()
    );
  end if;

  if v_old_order_status='CONFIRMED'
     and not exists(
       select 1
       from public.order_locals ol
       where ol.order_id=v_req.order_id
         and ol.status not in ('PREPARING','READY','CANCELLED')
     )
  then
    update public.orders
    set status='PREPARING',
        preparing_at=coalesce(preparing_at,now()),
        updated_at=now()
    where id=v_req.order_id and status='CONFIRMED';

    if found then
      insert into public.order_status_history(
        order_id,local_id,old_status,new_status,
        actor_user_id,actor_role,note,created_at
      )
      values(
        v_req.order_id,null,'CONFIRMED','PREPARING',
        null,'SYSTEM',
        'Todos los LOCAL confirmaron preparación',
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'already_confirmed',false,
    'preparation_minutes',p_minutes,
    'estimated_ready_at',v_estimated_ready_at
  );
end;
$function$;

revoke all on function public.local_order_response_confirm(text,integer) from public;
grant execute on function public.local_order_response_confirm(text,integer)
to anon,authenticated,service_role;

create or replace function public.delivery_local_preparation_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_rows jsonb;
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar preparación de LOCAL';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',ol.order_id,
    'local_id',ol.local_id,
    'prep_requested_at',ol.prep_requested_at,
    'prep_response_at',ol.prep_response_at,
    'prep_estimate_minutes',ol.prep_estimate_minutes,
    'estimated_ready_at',ol.estimated_ready_at,
    'request_status',case
      when r.status='SENT' and r.expires_at<=now() then 'EXPIRED'
      else r.status
    end,
    'request_expires_at',r.expires_at
  ) order by o.created_at desc,l.name),'[]'::jsonb)
  into v_rows
  from public.order_locals ol
  join public.orders o on o.id=ol.order_id
  join public.locals l on l.id=ol.local_id
  left join lateral (
    select rr.status,rr.expires_at
    from private.order_local_response_tokens rr
    where rr.order_id=ol.order_id and rr.local_id=ol.local_id
    order by rr.requested_at desc
    limit 1
  ) r on true
  where o.delivery_id=p_delivery_id
    and o.status in ('PENDING','CONFIRMED','PREPARING','READY','EN_ROUTE');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'generated_at',now(),
    'locals',v_rows
  );
end;
$function$;

revoke all on function public.delivery_local_preparation_snapshot(uuid)
from public,anon;
grant execute on function public.delivery_local_preparation_snapshot(uuid)
to authenticated,service_role;

comment on column public.order_locals.estimated_ready_at is
  'Hora estimada informada por el LOCAL; no equivale a ready_at real.';
comment on table private.order_local_response_tokens is
  'Enlaces bearer temporales para que un LOCAL confirme tiempo de preparación sin cuenta HTPWEB.';
