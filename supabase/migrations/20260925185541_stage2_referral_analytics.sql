create table if not exists private.delivery_referral_attributions(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  referral_code_id uuid not null references public.delivery_referral_codes(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  relationship_source text not null
    check(relationship_source in ('REFERRAL_CODE','REFERRAL_LINK')),
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(delivery_id,customer_id)
);

create index if not exists delivery_referral_attributions_code_idx
  on private.delivery_referral_attributions(delivery_id,referral_code_id,attributed_at);

create index if not exists delivery_referral_attributions_customer_idx
  on private.delivery_referral_attributions(customer_id,delivery_id);

create index if not exists idx_orders_delivery_customer_created
  on public.orders(delivery_id,customer_id,created_at);

alter table private.delivery_referral_attributions enable row level security;
revoke all on table private.delivery_referral_attributions from public,anon,authenticated;

drop policy if exists delivery_referral_attributions_deny_all
  on private.delivery_referral_attributions;
create policy delivery_referral_attributions_deny_all
on private.delivery_referral_attributions
for all
to public
using(false)
with check(false);

insert into private.delivery_referral_attributions(
  delivery_id,
  referral_code_id,
  customer_id,
  relationship_source,
  attributed_at,
  created_at
)
select
  cd.delivery_id,
  cd.referral_code_id,
  cd.customer_id,
  case
    when cd.relationship_source='REFERRAL_LINK' then 'REFERRAL_LINK'
    else 'REFERRAL_CODE'
  end,
  cd.created_at,
  now()
from public.customer_deliveries cd
join public.delivery_referral_codes r
  on r.id=cd.referral_code_id
 and r.delivery_id=cd.delivery_id
where cd.referral_code_id is not null
on conflict(delivery_id,customer_id) do nothing;

create or replace function private.record_delivery_referral_attribution(
  p_delivery_id uuid,
  p_referral_code_id uuid,
  p_customer_id uuid,
  p_source text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=upper(trim(coalesce(p_source,'')));
begin
  if v_source not in ('REFERRAL_CODE','REFERRAL_LINK') then
    raise exception 'HTPWEB: origen de referido inválido';
  end if;

  if not exists(
    select 1
    from public.delivery_referral_codes r
    where r.id=p_referral_code_id
      and r.delivery_id=p_delivery_id
  ) then
    raise exception 'HTPWEB: referido fuera del DELIVERY';
  end if;

  if not exists(
    select 1
    from public.customer_deliveries cd
    where cd.customer_id=p_customer_id
      and cd.delivery_id=p_delivery_id
  ) then
    raise exception 'HTPWEB: cliente no vinculado al DELIVERY';
  end if;

  insert into private.delivery_referral_attributions(
    delivery_id,
    referral_code_id,
    customer_id,
    relationship_source,
    attributed_at,
    created_at
  )
  values(
    p_delivery_id,
    p_referral_code_id,
    p_customer_id,
    v_source,
    now(),
    now()
  )
  on conflict(delivery_id,customer_id) do nothing;
end;
$$;

revoke execute on function private.record_delivery_referral_attribution(uuid,uuid,uuid,text)
from public,anon,authenticated;

create or replace function public.claim_delivery_referral(
  p_code text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ref record;
  v_customer uuid;
  v_existing record;
  v_source text:=upper(trim(coalesce(p_source,'REFERRAL_CODE')));
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if v_source not in ('REFERRAL_CODE','REFERRAL_LINK') then
    raise exception 'HTPWEB: origen de referido inválido';
  end if;

  v_customer:=public.current_customer_id();
  if v_customer is null then
    raise exception 'HTPWEB: primero crea tu perfil de cliente';
  end if;

  select r.*
  into v_ref
  from public.delivery_referral_codes r
  where r.code=upper(trim(p_code))
    and r.active=true
    and (r.expires_at is null or r.expires_at>now())
  limit 1;

  if v_ref.id is null then
    raise exception 'HTPWEB: código de referido inválido o vencido';
  end if;

  if v_source='REFERRAL_LINK'
     and not public.delivery_has_capability(v_ref.delivery_id,'referrals.links')
  then
    raise exception 'HTPWEB: el plan no incluye enlaces de referido';
  end if;

  if v_source='REFERRAL_CODE'
     and not public.delivery_has_capability(v_ref.delivery_id,'referrals.codes')
  then
    raise exception 'HTPWEB: el plan no incluye códigos de referido';
  end if;

  select cd.active,cd.allow_orders,cd.relationship_source
  into v_existing
  from public.customer_deliveries cd
  where cd.customer_id=v_customer
    and cd.delivery_id=v_ref.delivery_id
  for update;

  if found and (
    v_existing.active is distinct from true
    or v_existing.allow_orders is distinct from true
  ) then
    raise exception 'HTPWEB: este DELIVERY bloqueó tu acceso; un referido no puede reactivarlo';
  end if;

  insert into public.customer_deliveries(
    customer_id,
    delivery_id,
    active,
    allow_orders,
    relationship_source,
    referral_code_id,
    created_at,
    updated_at
  )
  values(
    v_customer,
    v_ref.delivery_id,
    true,
    true,
    v_source,
    v_ref.id,
    now(),
    now()
  )
  on conflict(customer_id,delivery_id)
  do update set
    relationship_source=v_source,
    referral_code_id=excluded.referral_code_id,
    updated_at=now();

  perform private.record_delivery_referral_attribution(
    v_ref.delivery_id,
    v_ref.id,
    v_customer,
    v_source
  );

  return jsonb_build_object(
    'delivery_id',v_ref.delivery_id,
    'customer_id',v_customer,
    'relationship_source',v_source,
    'status','AUTHORIZED'
  );
end;
$$;

revoke execute on function public.claim_delivery_referral(text,text) from public,anon;
grant execute on function public.claim_delivery_referral(text,text) to authenticated;

create or replace function public.delivery_referral_analytics_snapshot(
  p_delivery_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_available boolean;
  v_summary jsonb;
  v_codes jsonb;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
      and public.has_permission('analytics.view')
    )
  ) then
    raise exception 'HTPWEB: no autorizado para analítica de referidos';
  end if;

  if v_from>=v_to then
    raise exception 'HTPWEB: rango de fechas inválido';
  end if;

  if v_to-v_from>interval '366 days' then
    raise exception 'HTPWEB: el rango máximo de analítica es 366 días';
  end if;

  v_available:=public.delivery_has_capability(
    p_delivery_id,
    'referrals.analytics'
  );

  if not v_available then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,
      'available',false,
      'from',v_from,
      'to',v_to,
      'summary',jsonb_build_object(
        'codes_total',0,
        'codes_active',0,
        'attributed_customers_total',0,
        'new_referred_customers',0,
        'buyers_in_period',0,
        'orders_in_period',0,
        'delivered_orders_in_period',0,
        'cancelled_orders_in_period',0,
        'delivered_revenue',0
      ),
      'codes','[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'codes_total',(
      select count(*)
      from public.delivery_referral_codes r
      where r.delivery_id=p_delivery_id
    ),
    'codes_active',(
      select count(*)
      from public.delivery_referral_codes r
      where r.delivery_id=p_delivery_id
        and r.active=true
        and (r.expires_at is null or r.expires_at>now())
    ),
    'attributed_customers_total',(
      select count(*)
      from private.delivery_referral_attributions a
      where a.delivery_id=p_delivery_id
    ),
    'new_referred_customers',(
      select count(*)
      from private.delivery_referral_attributions a
      where a.delivery_id=p_delivery_id
        and a.attributed_at>=v_from
        and a.attributed_at<v_to
    ),
    'buyers_in_period',(
      select count(distinct a.customer_id)
      from private.delivery_referral_attributions a
      join public.orders o
        on o.delivery_id=a.delivery_id
       and o.customer_id=a.customer_id
       and o.created_at>=a.attributed_at
      where a.delivery_id=p_delivery_id
        and o.created_at>=v_from
        and o.created_at<v_to
        and o.status='DELIVERED'
    ),
    'orders_in_period',(
      select count(*)
      from private.delivery_referral_attributions a
      join public.orders o
        on o.delivery_id=a.delivery_id
       and o.customer_id=a.customer_id
       and o.created_at>=a.attributed_at
      where a.delivery_id=p_delivery_id
        and o.created_at>=v_from
        and o.created_at<v_to
    ),
    'delivered_orders_in_period',(
      select count(*)
      from private.delivery_referral_attributions a
      join public.orders o
        on o.delivery_id=a.delivery_id
       and o.customer_id=a.customer_id
       and o.created_at>=a.attributed_at
      where a.delivery_id=p_delivery_id
        and o.created_at>=v_from
        and o.created_at<v_to
        and o.status='DELIVERED'
    ),
    'cancelled_orders_in_period',(
      select count(*)
      from private.delivery_referral_attributions a
      join public.orders o
        on o.delivery_id=a.delivery_id
       and o.customer_id=a.customer_id
       and o.created_at>=a.attributed_at
      where a.delivery_id=p_delivery_id
        and o.created_at>=v_from
        and o.created_at<v_to
        and o.status='CANCELLED'
    ),
    'delivered_revenue',(
      select coalesce(sum(o.total),0)
      from private.delivery_referral_attributions a
      join public.orders o
        on o.delivery_id=a.delivery_id
       and o.customer_id=a.customer_id
       and o.created_at>=a.attributed_at
      where a.delivery_id=p_delivery_id
        and o.created_at>=v_from
        and o.created_at<v_to
        and o.status='DELIVERED'
    )
  )
  into v_summary;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'code',r.code,
    'label',r.label,
    'active',r.active,
    'expires_at',r.expires_at,
    'created_at',r.created_at,
    'attributed_customers_total',coalesce(a_stats.attributed_customers_total,0),
    'code_customers_total',coalesce(a_stats.code_customers_total,0),
    'link_customers_total',coalesce(a_stats.link_customers_total,0),
    'new_referred_customers',coalesce(a_stats.new_referred_customers,0),
    'last_attributed_at',a_stats.last_attributed_at,
    'buyers_in_period',coalesce(o_stats.buyers_in_period,0),
    'orders_in_period',coalesce(o_stats.orders_in_period,0),
    'delivered_orders_in_period',coalesce(o_stats.delivered_orders_in_period,0),
    'cancelled_orders_in_period',coalesce(o_stats.cancelled_orders_in_period,0),
    'delivered_revenue',coalesce(o_stats.delivered_revenue,0),
    'average_delivered_ticket',
      case
        when coalesce(o_stats.delivered_orders_in_period,0)>0
        then round(
          coalesce(o_stats.delivered_revenue,0)
          /o_stats.delivered_orders_in_period,
          2
        )
        else 0
      end
  ) order by
    coalesce(o_stats.delivered_revenue,0) desc,
    coalesce(a_stats.attributed_customers_total,0) desc,
    r.created_at desc),'[]'::jsonb)
  into v_codes
  from public.delivery_referral_codes r
  left join lateral (
    select
      count(*)::integer attributed_customers_total,
      count(*) filter(
        where a.relationship_source='REFERRAL_CODE'
      )::integer code_customers_total,
      count(*) filter(
        where a.relationship_source='REFERRAL_LINK'
      )::integer link_customers_total,
      count(*) filter(
        where a.attributed_at>=v_from
          and a.attributed_at<v_to
      )::integer new_referred_customers,
      max(a.attributed_at) last_attributed_at
    from private.delivery_referral_attributions a
    where a.delivery_id=p_delivery_id
      and a.referral_code_id=r.id
  ) a_stats on true
  left join lateral (
    select
      count(distinct o.customer_id) filter(
        where o.status='DELIVERED'
      )::integer buyers_in_period,
      count(*)::integer orders_in_period,
      count(*) filter(
        where o.status='DELIVERED'
      )::integer delivered_orders_in_period,
      count(*) filter(
        where o.status='CANCELLED'
      )::integer cancelled_orders_in_period,
      coalesce(sum(o.total) filter(
        where o.status='DELIVERED'
      ),0) delivered_revenue
    from private.delivery_referral_attributions a
    join public.orders o
      on o.delivery_id=a.delivery_id
     and o.customer_id=a.customer_id
     and o.created_at>=a.attributed_at
    where a.delivery_id=p_delivery_id
      and a.referral_code_id=r.id
      and o.created_at>=v_from
      and o.created_at<v_to
  ) o_stats on true
  where r.delivery_id=p_delivery_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'available',true,
    'from',v_from,
    'to',v_to,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'codes',coalesce(v_codes,'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.delivery_referral_analytics_snapshot(uuid,timestamptz,timestamptz)
from public,anon;
grant execute on function public.delivery_referral_analytics_snapshot(uuid,timestamptz,timestamptz)
to authenticated;
