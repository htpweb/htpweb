-- HTPWEB · Planes y suscripciones LOCAL + checkout de pagos
-- Básico/Premium, pagos por transferencia y preparación de tarjeta PayPhone.

update public.subscription_plans
set name='BÁSICO',
    description='Presencia profesional, catálogo y pedidos directos por WhatsApp.',
    price=5.00,currency='USD',billing_interval='MONTH',duration_months=1,
    active=true,display_order=100,updated_at=now()
where code='LOC_BASIC' and target_type='LOCAL';

update public.subscription_plans
set name='PREMIUM',
    description='Sitio web completo, editor visual avanzado, marketing, analítica, inventario y crecimiento.',
    price=10.00,currency='USD',billing_interval='MONTH',duration_months=1,
    active=true,display_order=110,updated_at=now()
where code='LOC_PRO' and target_type='LOCAL';

update public.subscription_plans
set active=false,updated_at=now()
where code='LOC_STORE' and target_type='LOCAL';

delete from public.plan_entitlements
where plan_id=(select id from public.subscription_plans where code='LOC_BASIC' and target_type='LOCAL');

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,x.t,x.c,x.v
from public.subscription_plans p
cross join (values
 ('CAPABILITY','local.info.manage','true'::jsonb),
 ('CAPABILITY','local.media.manage','true'::jsonb),
 ('CAPABILITY','categories.manage','true'::jsonb),
 ('CAPABILITY','products.manage','true'::jsonb),
 ('CAPABILITY','schedules.manage','true'::jsonb),
 ('CAPABILITY','storefront.manage','true'::jsonb),
 ('CAPABILITY','whatsapp.orders','true'::jsonb),
 ('LIMIT','max_products','50'::jsonb)
) as x(t,c,v)
where p.code='LOC_BASIC' and p.target_type='LOCAL';

delete from public.plan_entitlements
where plan_id=(select id from public.subscription_plans where code='LOC_PRO' and target_type='LOCAL');

insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select p.id,x.t,x.c,x.v
from public.subscription_plans p
cross join (values
 ('CAPABILITY','local.info.manage','true'::jsonb),
 ('CAPABILITY','local.media.manage','true'::jsonb),
 ('CAPABILITY','categories.manage','true'::jsonb),
 ('CAPABILITY','products.manage','true'::jsonb),
 ('CAPABILITY','schedules.manage','true'::jsonb),
 ('CAPABILITY','storefront.manage','true'::jsonb),
 ('CAPABILITY','whatsapp.orders','true'::jsonb),
 ('CAPABILITY','promotions.manage','true'::jsonb),
 ('CAPABILITY','delivery.partnerships','true'::jsonb),
 ('CAPABILITY','delivery.multiple','true'::jsonb),
 ('CAPABILITY','inventory.manage','true'::jsonb),
 ('CAPABILITY','analytics.view','true'::jsonb),
 ('CAPABILITY','marketing.manage','true'::jsonb),
 ('CAPABILITY','domain.custom.included','true'::jsonb),
 ('CAPABILITY','storefront.visual_editor','true'::jsonb),
 ('CAPABILITY','storefront.all_templates','true'::jsonb),
 ('CAPABILITY','seo.advanced','true'::jsonb),
 ('LIMIT','max_products','1000'::jsonb)
) as x(t,c,v)
where p.code='LOC_PRO' and p.target_type='LOCAL';

insert into public.plan_feature_catalog(code,entitlement_type,label,family,unit,stage,display_order,description)
values
 ('storefront.visual_editor','CAPABILITY','Editor visual avanzado','Sitio web',null,1,210,'Edición visual tipo presentación: textos, tipografía, colores, imágenes y fondos.'),
 ('storefront.all_templates','CAPABILITY','Todas las plantillas','Sitio web',null,1,220,'Acceso a toda la biblioteca profesional de plantillas de su categoría.'),
 ('seo.advanced','CAPABILITY','SEO avanzado','Marketing',null,1,230,'Metadatos y estructura preparada para posicionamiento y páginas indexables.')
on conflict(code) do update set
 label=excluded.label,family=excluded.family,stage=excluded.stage,display_order=excluded.display_order,description=excluded.description;

create table if not exists public.subscription_payment_settings(
  id smallint primary key default 1 check(id=1),
  card_provider text not null default 'PAYPHONE' check(card_provider in ('PAYPHONE','NONE')),
  card_enabled boolean not null default false,
  transfer_enabled boolean not null default true,
  bank_name text,
  account_type text,
  account_number text,
  account_holder text,
  account_holder_id text,
  transfer_instructions text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.subscription_payment_settings(id) values(1) on conflict(id) do nothing;
alter table public.subscription_payment_settings enable row level security;
revoke all on public.subscription_payment_settings from public,anon,authenticated;
grant all on public.subscription_payment_settings to service_role;

create table if not exists public.subscription_payment_requests(
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  method text not null check(method in ('CARD','TRANSFER')),
  status text not null default 'PENDING' check(status in ('PENDING','AWAITING_TRANSFER','PROCESSING','APPROVED','REJECTED','CANCELLED','FAILED')),
  amount numeric(10,2) not null check(amount>=0),
  currency text not null default 'USD',
  client_reference text not null unique,
  provider text,
  provider_transaction_id text,
  transfer_reference text,
  transfer_note text,
  created_by uuid not null default auth.uid(),
  paid_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscription_payment_requests_local_idx
on public.subscription_payment_requests(local_id,created_at desc);
alter table public.subscription_payment_requests enable row level security;
revoke all on public.subscription_payment_requests from public,anon,authenticated;
grant all on public.subscription_payment_requests to service_role;

CREATE OR REPLACE FUNCTION public.activate_local_plan_from_payment(p_payment_id uuid, p_provider_transaction_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pay record; v_plan record; v_current record; v_assignment uuid; v_change text:='NEW';
declare v_end timestamptz;
begin
 select r.* into v_pay from public.subscription_payment_requests r where r.id=p_payment_id for update;
 if not found then raise exception 'HTPWEB: pago inexistente'; end if;
 if v_pay.status='APPROVED' then
   return jsonb_build_object('payment_id',v_pay.id,'status','APPROVED');
 end if;

 select * into v_plan from public.subscription_plans where id=v_pay.plan_id and target_type='LOCAL';
 if not found then raise exception 'HTPWEB: plan LOCAL inexistente'; end if;

 select a.*,coalesce(a.price_snapshot,p.price) effective_price into v_current
 from public.plan_assignments a join public.subscription_plans p on p.id=a.plan_id
 where a.local_id=v_pay.local_id and a.status in ('ACTIVE','TRIAL','PAST_DUE')
 order by a.starts_at desc limit 1;

 if found then
   v_change:=case
     when v_current.plan_id=v_pay.plan_id then 'RENEW'
     when v_plan.price>coalesce(v_current.effective_price,0) then 'UPGRADE'
     else 'DOWNGRADE' end;
   update public.plan_assignments
   set status='EXPIRED',ends_at=case when ends_at is null or ends_at>now() then now() else ends_at end,updated_at=now()
   where id=v_current.id;
 end if;

 v_end:=now()+make_interval(months=>greatest(1,coalesce(v_plan.duration_months,1)));

 insert into public.plan_assignments(
   plan_id,local_id,status,starts_at,ends_at,assigned_by,metadata,
   plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,
   change_type,previous_assignment_id,selection_reset_required,plan_version_snapshot
 ) values(
   v_plan.id,v_pay.local_id,'ACTIVE',now(),v_end,v_pay.created_by,
   jsonb_build_object('source','LOCAL_SUBSCRIPTION_PAYMENT','payment_id',v_pay.id,'method',v_pay.method),
   v_plan.name,v_plan.price,v_plan.currency,v_plan.duration_months,
   v_change,case when v_current.id is not null then v_current.id else null end,false,v_plan.plan_version
 ) returning id into v_assignment;

 insert into public.plan_assignment_entitlements(assignment_id,entitlement_type,code,value)
 select v_assignment,e.entitlement_type,e.code,e.value
 from public.plan_entitlements e where e.plan_id=v_plan.id;

 update public.subscription_payment_requests
 set status='APPROVED',paid_at=coalesce(paid_at,now()),
     provider_transaction_id=coalesce(nullif(p_provider_transaction_id,''),provider_transaction_id),
     updated_at=now()
 where id=v_pay.id;

 return jsonb_build_object('payment_id',v_pay.id,'status','APPROVED','assignment_id',v_assignment,'ends_at',v_end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.local_create_subscription_payment(p_local_id uuid, p_plan_id uuid, p_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan record; v_method text:=upper(trim(coalesce(p_method,''))); v_settings record;
declare v_id uuid; v_ref text; v_transfer_ref text;
begin
 if not exists(
   select 1 from public.user_locals ul
   where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
 ) then raise exception 'HTPWEB: no administras este LOCAL'; end if;
 select * into v_plan from public.subscription_plans
 where id=p_plan_id and target_type='LOCAL' and active=true;
 if not found then raise exception 'HTPWEB: plan LOCAL no disponible'; end if;
 if v_method not in ('CARD','TRANSFER') then raise exception 'HTPWEB: método de pago inválido'; end if;
 select * into v_settings from public.subscription_payment_settings where id=1;
 if v_method='CARD' and not coalesce(v_settings.card_enabled,false) then
   raise exception 'HTPWEB: pagos con tarjeta pendientes de configurar por MASTER';
 end if;
 if v_method='TRANSFER' and (
   not coalesce(v_settings.transfer_enabled,false)
   or nullif(trim(coalesce(v_settings.bank_name,'')),'') is null
   or nullif(trim(coalesce(v_settings.account_number,'')),'') is null
 ) then raise exception 'HTPWEB: transferencia bancaria pendiente de configurar por MASTER'; end if;
 v_ref:='HTP'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 v_transfer_ref:=case when v_method='TRANSFER' then 'LOC-'||upper(substr(replace(p_local_id::text,'-',''),1,6))||'-'||right(v_ref,6) else null end;
 insert into public.subscription_payment_requests(
   local_id,plan_id,method,status,amount,currency,client_reference,provider,transfer_reference,metadata
 ) values(
   p_local_id,p_plan_id,v_method,
   case when v_method='TRANSFER' then 'AWAITING_TRANSFER' else 'PENDING' end,
   v_plan.price,v_plan.currency,v_ref,
   case when v_method='CARD' then v_settings.card_provider else 'BANK_TRANSFER' end,
   v_transfer_ref,
   jsonb_build_object('plan_code',v_plan.code,'plan_name',v_plan.name)
 ) returning id into v_id;
 return jsonb_build_object(
   'payment_id',v_id,'client_reference',v_ref,'transfer_reference',v_transfer_ref,
   'method',v_method,'amount',v_plan.price,'currency',v_plan.currency,
   'plan_name',v_plan.name,'card_provider',v_settings.card_provider,
   'bank_name',v_settings.bank_name,'account_type',v_settings.account_type,
   'account_number',v_settings.account_number,'account_holder',v_settings.account_holder,
   'account_holder_id',v_settings.account_holder_id,'transfer_instructions',v_settings.transfer_instructions
 );
end;
$function$;

CREATE OR REPLACE FUNCTION public.local_my_plan_summary(p_local_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_current jsonb; v_plans jsonb; v_payments jsonb;
begin
 if not (
   public.is_master() or exists(
     select 1 from public.user_locals ul
     where ul.user_id=auth.uid() and ul.local_id=p_local_id and ul.active
   )
 ) then raise exception 'HTPWEB: no autorizado para consultar Mi Plan'; end if;

 select jsonb_build_object(
   'assignment_id',a.id,'code',p.code,'name',p.name,'description',p.description,
   'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'trial_ends_at',a.trial_ends_at,
   'price',coalesce(a.price_snapshot,p.price),'currency',coalesce(a.currency_snapshot,p.currency)
 )
 into v_current
 from public.plan_assignments a
 join public.subscription_plans p on p.id=a.plan_id
 where a.local_id=p_local_id and p.target_type='LOCAL'
   and a.status in ('ACTIVE','TRIAL','PAST_DUE')
 order by a.starts_at desc limit 1;

 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'code',p.code,'name',p.name,'description',p.description,'price',p.price,
   'currency',p.currency,'billing_interval',p.billing_interval,'duration_months',p.duration_months,
   'features',coalesce((
     select jsonb_agg(jsonb_build_object(
       'type',e.entitlement_type,'code',e.code,'value',e.value,
       'label',coalesce(f.label,e.code),'family',coalesce(f.family,'Funciones')
     ) order by coalesce(f.display_order,9999),e.code)
     from public.plan_entitlements e
     left join public.plan_feature_catalog f on f.code=e.code
     where e.plan_id=p.id
   ),'[]'::jsonb)
 ) order by p.display_order,p.price),'[]'::jsonb)
 into v_plans
 from public.subscription_plans p
 where p.target_type='LOCAL' and p.active=true;

 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'method',r.method,'status',r.status,'amount',r.amount,'currency',r.currency,
   'client_reference',r.client_reference,'provider',r.provider,'provider_transaction_id',r.provider_transaction_id,
   'transfer_reference',r.transfer_reference,'created_at',r.created_at,'paid_at',r.paid_at,
   'plan_name',p.name,'plan_code',p.code
 ) order by r.created_at desc),'[]'::jsonb)
 into v_payments
 from (
   select * from public.subscription_payment_requests
   where local_id=p_local_id
   order by created_at desc limit 12
 ) r join public.subscription_plans p on p.id=r.plan_id;

 return jsonb_build_object(
   'local_id',p_local_id,
   'current',v_current,
   'plans',coalesce(v_plans,'[]'::jsonb),
   'payments',coalesce(v_payments,'[]'::jsonb),
   'payment_settings',public.local_subscription_payment_settings()
 );
end;
$function$;

CREATE OR REPLACE FUNCTION public.local_subscription_payment_settings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
   'card_provider',s.card_provider,
   'card_enabled',s.card_enabled,
   'transfer_enabled',s.transfer_enabled,
   'bank_name',s.bank_name,
   'account_type',s.account_type,
   'account_number',s.account_number,
   'account_holder',s.account_holder,
   'account_holder_id',s.account_holder_id,
   'transfer_instructions',s.transfer_instructions
 )
 from public.subscription_payment_settings s where s.id=1;
$function$;

CREATE OR REPLACE FUNCTION public.master_list_all_commercial_plans()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'code',p.code,'name',p.name,'description',p.description,'target_type',p.target_type,
   'price',p.price,'currency',p.currency,'duration_months',p.duration_months,'billing_interval',p.billing_interval,
   'active',p.active,'display_order',p.display_order,'plan_version',p.plan_version,
   'entitlements',coalesce((select jsonb_agg(jsonb_build_object(
     'type',e.entitlement_type,'code',e.code,'value',e.value,'family',f.family,'label',f.label,'unit',f.unit
   ) order by f.family,f.display_order,e.code)
   from public.plan_entitlements e left join public.plan_feature_catalog f on f.code=e.code where e.plan_id=p.id),'[]'::jsonb)
 ) order by p.target_type,p.display_order,p.name),'[]'::jsonb)
 into v from public.subscription_plans p where p.target_type in ('DELIVERY','LOCAL');
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.master_list_local_subscription_payments()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when public.is_master() then coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',r.id,'local_id',r.local_id,'local_name',l.name,'plan_id',r.plan_id,'plan_name',p.name,
     'method',r.method,'status',r.status,'amount',r.amount,'currency',r.currency,
     'client_reference',r.client_reference,'transfer_reference',r.transfer_reference,
     'provider',r.provider,'provider_transaction_id',r.provider_transaction_id,
     'created_at',r.created_at,'paid_at',r.paid_at,'transfer_note',r.transfer_note
   ) order by r.created_at desc)
   from public.subscription_payment_requests r
   join public.locals l on l.id=r.local_id
   join public.subscription_plans p on p.id=r.plan_id
 ),'[]'::jsonb) else '[]'::jsonb end;
$function$;

CREATE OR REPLACE FUNCTION public.master_review_local_transfer_payment(p_payment_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if coalesce(p_approve,false) then
   update public.subscription_payment_requests
   set transfer_note=nullif(trim(coalesce(p_note,'')),''),
       reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
   where id=p_payment_id and method='TRANSFER' and status='AWAITING_TRANSFER';
   if not found then raise exception 'HTPWEB: transferencia no disponible para aprobar'; end if;
   v_result:=public.activate_local_plan_from_payment(p_payment_id,'TRANSFER-APPROVED');
   return v_result;
 else
   update public.subscription_payment_requests
   set status='REJECTED',transfer_note=nullif(trim(coalesce(p_note,'')),''),
       reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
   where id=p_payment_id and method='TRANSFER' and status in ('AWAITING_TRANSFER','PENDING');
   if not found then raise exception 'HTPWEB: transferencia no disponible para rechazar'; end if;
   return jsonb_build_object('payment_id',p_payment_id,'status','REJECTED');
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.master_save_commercial_plan_v2(p_plan_id uuid, p_target_type text, p_code text, p_name text, p_description text, p_price numeric, p_duration_months integer, p_active boolean, p_display_order integer, p_entitlements jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=coalesce(p_plan_id,gen_random_uuid()); v_item jsonb; v_type text; v_code text; v_value jsonb; v_expected text; v_target text:=upper(trim(coalesce(p_target_type,'')));
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if v_target not in ('DELIVERY','LOCAL') then raise exception 'HTPWEB: tipo de plan inválido'; end if;
 if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then raise exception 'HTPWEB: código y nombre son obligatorios'; end if;
 if p_price is null or p_price<0 then raise exception 'HTPWEB: precio inválido'; end if;
 if p_duration_months is null or p_duration_months<1 or p_duration_months>120 then raise exception 'HTPWEB: duración inválida'; end if;
 if p_entitlements is null or jsonb_typeof(p_entitlements)<>'array' then raise exception 'HTPWEB: prestaciones inválidas'; end if;

 insert into public.subscription_plans(id,code,name,description,target_type,price,currency,billing_interval,duration_months,active,display_order,plan_version,created_at,updated_at)
 values(v_id,upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),v_target,round(p_price,2),'USD','MONTH',p_duration_months,coalesce(p_active,true),coalesce(p_display_order,0),1,now(),now())
 on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,target_type=excluded.target_type,price=excluded.price,
 duration_months=excluded.duration_months,active=excluded.active,display_order=excluded.display_order,
 plan_version=public.subscription_plans.plan_version+1,updated_at=now();

 delete from public.plan_entitlements where plan_id=v_id;
 for v_item in select value from jsonb_array_elements(p_entitlements) loop
   v_type:=upper(trim(coalesce(v_item->>'type',''))); v_code:=lower(trim(coalesce(v_item->>'code',''))); v_value:=v_item->'value';
   select entitlement_type into v_expected from public.plan_feature_catalog where code=v_code and active=true;
   if v_expected is null then raise exception 'HTPWEB: prestación desconocida %',v_code; end if;
   if v_expected<>v_type then raise exception 'HTPWEB: tipo inválido para %',v_code; end if;
   if v_type='CAPABILITY' and jsonb_typeof(v_value)<>'boolean' then raise exception 'HTPWEB: % debe ser booleano',v_code; end if;
   if v_type='LIMIT' and (jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')::numeric<0) then raise exception 'HTPWEB: % debe ser numérico no negativo',v_code; end if;
   insert into public.plan_entitlements(plan_id,entitlement_type,code,value) values(v_id,v_type,v_code,v_value);
 end loop;
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.master_set_subscription_payment_settings(p_card_enabled boolean, p_transfer_enabled boolean, p_bank_name text, p_account_type text, p_account_number text, p_account_holder text, p_account_holder_id text, p_transfer_instructions text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 update public.subscription_payment_settings set
   card_enabled=coalesce(p_card_enabled,false),
   transfer_enabled=coalesce(p_transfer_enabled,true),
   bank_name=nullif(trim(coalesce(p_bank_name,'')),''),
   account_type=nullif(trim(coalesce(p_account_type,'')),''),
   account_number=nullif(trim(coalesce(p_account_number,'')),''),
   account_holder=nullif(trim(coalesce(p_account_holder,'')),''),
   account_holder_id=nullif(trim(coalesce(p_account_holder_id,'')),''),
   transfer_instructions=nullif(trim(coalesce(p_transfer_instructions,'')),''),
   updated_by=auth.uid(),updated_at=now()
 where id=1;
 return public.local_subscription_payment_settings();
end;
$function$;

revoke all on function public.local_subscription_payment_settings() from public,anon;
revoke all on function public.local_my_plan_summary(uuid) from public,anon;
revoke all on function public.local_create_subscription_payment(uuid,uuid,text) from public,anon;
revoke all on function public.activate_local_plan_from_payment(uuid,text) from public,anon,authenticated;
revoke all on function public.master_review_local_transfer_payment(uuid,boolean,text) from public,anon;
revoke all on function public.master_set_subscription_payment_settings(boolean,boolean,text,text,text,text,text,text) from public,anon;
revoke all on function public.master_list_local_subscription_payments() from public,anon;
revoke all on function public.master_list_all_commercial_plans() from public,anon;
revoke all on function public.master_save_commercial_plan_v2(uuid,text,text,text,text,numeric,integer,boolean,integer,jsonb) from public,anon;

grant execute on function public.local_subscription_payment_settings() to authenticated,service_role;
grant execute on function public.local_my_plan_summary(uuid) to authenticated,service_role;
grant execute on function public.local_create_subscription_payment(uuid,uuid,text) to authenticated;
grant execute on function public.activate_local_plan_from_payment(uuid,text) to service_role;
grant execute on function public.master_review_local_transfer_payment(uuid,boolean,text) to authenticated;
grant execute on function public.master_set_subscription_payment_settings(boolean,boolean,text,text,text,text,text,text) to authenticated;
grant execute on function public.master_list_local_subscription_payments() to authenticated;
grant execute on function public.master_list_all_commercial_plans() to authenticated;
grant execute on function public.master_save_commercial_plan_v2(uuid,text,text,text,text,numeric,integer,boolean,integer,jsonb) to authenticated;
