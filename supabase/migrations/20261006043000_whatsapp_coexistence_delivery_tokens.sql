create or replace function public.whatsapp_store_delivery_token(
  p_delivery_id uuid,
  p_access_token text,
  p_business_id text,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone text,
  p_verified_name text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_name text := 'whatsapp_delivery_' || p_delivery_id::text;
  v_secret_id uuid;
begin
  if p_delivery_id is null
     or nullif(trim(coalesce(p_access_token,'')),'') is null
     or nullif(trim(coalesce(p_waba_id,'')),'') is null
     or nullif(trim(coalesce(p_phone_number_id,'')),'') is null
  then
    raise exception 'HTPWEB: datos de credencial WhatsApp incompletos';
  end if;

  select s.id into v_secret_id
  from vault.secrets s
  where s.name=v_name
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      p_access_token,
      v_name,
      'HTPWEB WhatsApp token for delivery ' || p_delivery_id::text,
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_access_token,
      v_name,
      'HTPWEB WhatsApp token for delivery ' || p_delivery_id::text,
      null
    );
  end if;

  update private.delivery_whatsapp_connections
  set connection_mode='HTPWEB_MANAGED',
      status='CONNECTED',
      environment='PRODUCTION',
      credential_source='VAULT',
      meta_business_id=p_business_id,
      waba_id=p_waba_id,
      phone_number_id=p_phone_number_id,
      display_phone=p_display_phone,
      verified_name=p_verified_name,
      token_secret_name=v_name,
      last_error=null,
      connected_at=now(),
      approved_at=now(),
      updated_at=now()
  where delivery_id=p_delivery_id;

  if not found then
    raise exception 'HTPWEB: no existe solicitud WhatsApp para este DELIVERY';
  end if;
end;
$function$;

revoke all on function public.whatsapp_store_delivery_token(uuid,text,text,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.whatsapp_store_delivery_token(uuid,text,text,text,text,text,text)
to service_role;
