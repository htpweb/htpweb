-- BLOQUE 1 / intervención 2: diagnóstico transaccional sin cambiar catálogos.
create or replace function public.preflight_business_catalog_v4(
 p_business_id uuid,p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 r jsonb;
 key text;
 variant_name text;
 pname text;
 price numeric;
 seen text[]:=array[]::text[];
 issues jsonb:='[]'::jsonb;
 count_existing integer:=0;
 count_new integer:=0;
 count_legacy integer:=0;
 count_options integer:=0;
 count_invalid integer:=0;
 n integer:=0;
begin
 if not (public.is_master() or public.user_can_manage_business_resource(p_business_id,'products.manage','products.manage')) then
  raise exception 'Acceso no autorizado para negocio';
 end if;
 if not exists(select 1 from public.locals where id=p_business_id) then raise exception 'Negocio no encontrado'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 3000 then
  raise exception 'Matriz invalida: 1-3000 filas';
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  key:=lower(btrim(coalesce(r->>'sku','')));
  variant_name:=lower(btrim(coalesce(r->>'variant','')));
  pname:=btrim(coalesce(r->>'name',''));
  if key='' or pname='' then
   count_invalid:=count_invalid+1;
   issues:=issues||jsonb_build_array(jsonb_build_object('row',n,'reason','sku_or_name_missing'));
   continue;
  end if;
  if (key||'::'||variant_name)=any(seen) then
   count_invalid:=count_invalid+1;
   issues:=issues||jsonb_build_array(jsonb_build_object('row',n,'sku',key,'reason','duplicate_sku_variant'));
  end if;
  seen:=array_append(seen,key||'::'||variant_name);
  begin
   price:=(r->>'price')::numeric;
   if price is null or price<0 or price>1000000 then raise invalid_text_representation; end if;
  exception when others then
   count_invalid:=count_invalid+1;
   issues:=issues||jsonb_build_array(jsonb_build_object('row',n,'sku',key,'reason','invalid_price'));
  end;
  if nullif(btrim(coalesce(r->>'option_group','')),'') is not null
   or nullif(btrim(coalesce(r->>'options','')),'') is not null then
   count_options:=count_options+1;
  end if;
  if exists(select 1 from public.products p where p.business_id=p_business_id and lower(btrim(p.sku))=key) then
   count_existing:=count_existing+1;
  elsif exists(select 1 from public.products p where p.business_id=p_business_id
   and nullif(btrim(p.sku),'') is null and lower(btrim(p.name))=lower(pname)) then
   count_legacy:=count_legacy+1;
   issues:=issues||jsonb_build_array(jsonb_build_object('row',n,'sku',key,'reason','legacy_without_sku','product_name',pname));
  else
   count_new:=count_new+1;
  end if;
 end loop;
 return jsonb_build_object('business_id',p_business_id,'rows',n,
  'matching_existing_rows',count_existing,'new_candidate_rows',count_new,
  'legacy_name_conflicts',count_legacy,'complex_option_rows',count_options,
  'invalid_rows',count_invalid,'can_import',count_invalid=0 and count_legacy=0,
  'issues',issues);
end $fn$;
revoke all on function public.preflight_business_catalog_v4(uuid,jsonb) from public;
grant execute on function public.preflight_business_catalog_v4(uuid,jsonb) to authenticated;
-- Branch-specific WhatsApp is stored on existing locals; never fabricate numbers.
create or replace function public.business_group_branch_directory(p_group_slug text)
returns table(group_id uuid,company_name text,business_id uuid,branch_name text,
 branch_label text,whatsapp text,phone text,display_order integer)
language sql stable security invoker set search_path=''
as $fn$
 select g.id,g.name,b.business_id,l.name,b.branch_label,l.whatsapp,l.phone,b.display_order
 from public.business_groups g join public.business_group_branches b on b.group_id=g.id
 join public.locals l on l.id=b.business_id
 where g.slug=p_group_slug and g.active and b.active and l.active
 order by b.display_order,l.name
$fn$;
revoke all on function public.business_group_branch_directory(text) from public;
grant execute on function public.business_group_branch_directory(text) to anon,authenticated;
