-- HTPWEB — normalización integral de catálogo cliente
-- Aplicada en producción: 2026-09-27
-- Regla: el producto debe ser entendible por sí solo; tamaño/proteína/presentación se modelan como variantes.
-- Los productos origen no canónicos se conservan activos pero ocultos para no romper carritos históricos.

create temp table merge_plan(
  group_key text,
  local_name text,
  source_category text,
  target_category text,
  old_name text,
  new_product_name text,
  variant_name text,
  new_description text,
  variant_order int,
  is_canonical boolean
) on commit drop;

insert into merge_plan values
('ced_entera','Parrilladas Cedeño','Parrilladas enteras','Parrilladas','Carne','Parrillada entera','Carne','Parrillada entera. Elige proteína: carne, pollo o chuleta.',1,true),
('ced_entera','Parrilladas Cedeño','Parrilladas enteras','Parrilladas','Pollo','Parrillada entera','Pollo','Parrillada entera. Elige proteína: carne, pollo o chuleta.',2,false),
('ced_entera','Parrilladas Cedeño','Parrilladas enteras','Parrilladas','Chuleta','Parrillada entera','Chuleta','Parrillada entera. Elige proteína: carne, pollo o chuleta.',3,false),
('ced_media','Parrilladas Cedeño','Parrilladas','Parrilladas','Parrillada de Carne','Parrillada media','Carne','Parrillada media. Elige proteína: carne, pollo o chuleta.',1,true),
('ced_media','Parrilladas Cedeño','Parrilladas','Parrilladas','Parrillada de Pollo','Parrillada media','Pollo','Parrillada media. Elige proteína: carne, pollo o chuleta.',2,false),
('ced_media','Parrilladas Cedeño','Parrilladas','Parrilladas','Parrillada de Chuleta','Parrillada media','Chuleta','Parrillada media. Elige proteína: carne, pollo o chuleta.',3,false),

('pp_bandera','Punto Pez','Bandera','Bandera','Doble','Bandera','Doble','Elige la presentación de tu bandera.',1,true),
('pp_bandera','Punto Pez','Bandera','Bandera','Triple','Bandera','Triple','Elige la presentación de tu bandera.',2,false),
('pp_bandera','Punto Pez','Bandera','Bandera','Completa','Bandera','Completa','Elige la presentación de tu bandera.',3,false),
('pp_cazuela','Punto Pez','Cazuela','Cazuela','Pescado','Cazuela','Pescado','Elige tu cazuela: pescado, camarón o mixta.',1,true),
('pp_cazuela','Punto Pez','Cazuela','Cazuela','Camarón','Cazuela','Camarón','Elige tu cazuela: pescado, camarón o mixta.',2,false),
('pp_cazuela','Punto Pez','Cazuela','Cazuela','Mixta','Cazuela','Mixta','Elige tu cazuela: pescado, camarón o mixta.',3,false),
('pp_encebollado','Punto Pez','Encebollado','Encebollado','Grande','Encebollado','Grande','Elige la presentación de tu encebollado.',1,true),
('pp_encebollado','Punto Pez','Encebollado','Encebollado','Pequeño','Encebollado','Pequeño','Elige la presentación de tu encebollado.',2,false),
('pp_encebollado','Punto Pez','Encebollado','Encebollado','Estudiantil','Encebollado','Estudiantil','Elige la presentación de tu encebollado.',3,false),
('pp_encebollado','Punto Pez','Encebollado','Encebollado','Con camarón','Encebollado','Con camarón','Elige la presentación de tu encebollado.',4,false),
('pp_tamal','Punto Pez','Tamal','Tamal','Pescado','Tamal','Pescado','Elige tu tamal: pescado, camarón o guatita.',1,true),
('pp_tamal','Punto Pez','Tamal','Tamal','Camarón','Tamal','Camarón','Elige tu tamal: pescado, camarón o guatita.',2,false),
('pp_tamal','Punto Pez','Tamal','Tamal','Guatita','Tamal','Guatita','Elige tu tamal: pescado, camarón o guatita.',3,false),
('pp_ceviche','Punto Pez','Ceviche','Ceviche','Pescado con o sin maní','Ceviche','Pescado con o sin maní','Elige el tipo de ceviche.',1,true),
('pp_ceviche','Punto Pez','Ceviche','Ceviche','Camarón con o sin maní','Ceviche','Camarón con o sin maní','Elige el tipo de ceviche.',2,false),

('santas_alitas','Santas Alitas','Alitas','Alitas','3 alitas','Alitas','3 alitas','Elige la cantidad de alitas.',1,true),
('santas_alitas','Santas Alitas','Alitas','Alitas','6 alitas','Alitas','6 alitas','Elige la cantidad de alitas.',2,false),
('santas_alitas','Santas Alitas','Alitas','Alitas','9 alitas','Alitas','9 alitas','Elige la cantidad de alitas.',3,false),
('santas_alitas','Santas Alitas','Alitas','Alitas','12 alitas','Alitas','12 alitas','Elige la cantidad de alitas.',4,false),
('santas_alitas','Santas Alitas','Alitas','Alitas','15 alitas','Alitas','15 alitas','Elige la cantidad de alitas.',5,false),
('santas_alitas','Santas Alitas','Alitas','Alitas','20 alitas','Alitas','20 alitas','Elige la cantidad de alitas.',6,false),
('santas_alitas','Santas Alitas','Alitas','Alitas','30 alitas','Alitas','30 alitas','Elige la cantidad de alitas.',7,false),

('dp_chuleta','Asado D'' Paolo','Chuleta o solomillo','Chuleta o solomillo','Chuleta o solomillo - Entera','Chuleta o solomillo','Entera','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',1,true),
('dp_chuleta','Asado D'' Paolo','Chuleta o solomillo','Chuleta o solomillo','Chuleta o solomillo - Media','Chuleta o solomillo','Media','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',2,false),
('dp_costillas','Asado D'' Paolo','Costillas','Costillas','Costillas - Entera','Costillas','Entera','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',1,true),
('dp_costillas','Asado D'' Paolo','Costillas','Costillas','Costillas - Media','Costillas','Media','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',2,false),
('dp_pechuga','Asado D'' Paolo','Pechuga de pollo','Pechuga de pollo','Pechuga de pollo - Entera','Pechuga de pollo','Entera','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',1,true),
('dp_pechuga','Asado D'' Paolo','Pechuga de pollo','Pechuga de pollo','Pechuga de pollo - Media','Pechuga de pollo','Media','Elige media o entera. Acompañamiento a elección: arroz con menestra, arroz moro o patacones con ensalada.',2,false),

('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Sencilla','Hamburguesa','Sencilla','Elige la presentación de tu hamburguesa.',1,true),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Huevo','Hamburguesa','Con huevo','Elige la presentación de tu hamburguesa.',2,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Queso','Hamburguesa','Con queso','Elige la presentación de tu hamburguesa.',3,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Tocino','Hamburguesa','Con tocino','Elige la presentación de tu hamburguesa.',4,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Salami','Hamburguesa','Con salami','Elige la presentación de tu hamburguesa.',5,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Queso y Huevo','Hamburguesa','Con queso y huevo','Elige la presentación de tu hamburguesa.',6,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Con Doble Carne','Hamburguesa','Con doble carne','Elige la presentación de tu hamburguesa.',7,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Completa','Hamburguesa','Completa','Elige la presentación de tu hamburguesa.',8,false),
('bigmac_hamb','Big Mac','Hamburguesas','Hamburguesas','Completa Doble Carne','Hamburguesa','Completa doble carne','Elige la presentación de tu hamburguesa.',9,false),

('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','Sencilla','Salchipapa','Sencilla','Elige la presentación de tu salchipapa.',1,true),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','PapiCarne','Salchipapa','PapiCarne','Elige la presentación de tu salchipapa.',2,false),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','SalchiCarne','Salchipapa','SalchiCarne','Elige la presentación de tu salchipapa.',3,false),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','PapiPollo','Salchipapa','PapiPollo','Elige la presentación de tu salchipapa.',4,false),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','Salchipollo','Salchipapa','Salchipollo','Elige la presentación de tu salchipapa.',5,false),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','Completa','Salchipapa','Completa','Elige la presentación de tu salchipapa.',6,false),
('bigmac_salchi','Big Mac','Salchipapas','Salchipapas','Completa Dividida','Salchipapa','Completa dividida','Elige la presentación de tu salchipapa.',7,false),

('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Cerdo','Bolón','Cerdo','Elige el tipo de bolón.',1,true),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Queso','Bolón','Queso','Elige el tipo de bolón.',2,false),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Bolivar','Bolón','Bolívar','Elige el tipo de bolón.',3,false),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Camarón','Bolón','Camarón','Elige el tipo de bolón.',4,false),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Maduro cerdo','Bolón','Maduro con cerdo','Elige el tipo de bolón.',5,false),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Maduro queso','Bolón','Maduro con queso','Elige el tipo de bolón.',6,false),
('bolivar_bolones','Cafetería y Restaurante Bolivar','Bolones','Bolones','Maduro mixto','Bolón','Maduro mixto','Elige el tipo de bolón.',7,false),
('bolivar_tigrillos','Cafetería y Restaurante Bolivar','Tigrillos','Tigrillos','De queso','Tigrillo','Queso','Incluye 1 huevo y café. Elige el tipo de tigrillo.',1,true),
('bolivar_tigrillos','Cafetería y Restaurante Bolivar','Tigrillos','Tigrillos','De cerdo','Tigrillo','Cerdo','Incluye 1 huevo y café. Elige el tipo de tigrillo.',2,false),
('bolivar_tigrillos','Cafetería y Restaurante Bolivar','Tigrillos','Tigrillos','Mixto','Tigrillo','Mixto','Incluye 1 huevo y café. Elige el tipo de tigrillo.',3,false),

('lore_bolones_mini','Lorejón','Bolones Mini','Bolones Mini','Chancho','Bolón mini','Chancho','Elige el tipo de bolón mini.',1,true),
('lore_bolones_mini','Lorejón','Bolones Mini','Bolones Mini','Queso','Bolón mini','Queso','Elige el tipo de bolón mini.',2,false),
('lore_bolones_mini','Lorejón','Bolones Mini','Bolones Mini','Chicharrón','Bolón mini','Chicharrón','Elige el tipo de bolón mini.',3,false),
('lore_bolones_mini','Lorejón','Bolones Mini','Bolones Mini','Mixto','Bolón mini','Mixto (2 proteínas)','Elige el tipo de bolón mini.',4,false),

('lore_bolones','Lorejón','Bolones','Bolones','Cerdo','Bolón','Cerdo','Elige el tipo de bolón.',1,true),
('lore_bolones','Lorejón','Bolones','Bolones','Queso','Bolón','Queso','Elige el tipo de bolón.',2,false),
('lore_bolones','Lorejón','Bolones','Bolones','Chicharrón','Bolón','Chicharrón','Elige el tipo de bolón.',3,false),
('lore_bolones','Lorejón','Bolones','Bolones','Mixto','Bolón','Mixto (2 proteínas)','Elige el tipo de bolón.',4,false),
('lore_bolones','Lorejón','Bolones','Bolones','Trimixto','Bolón','Trimixto (3 proteínas)','Elige el tipo de bolón.',5,false),
('lore_bolones','Lorejón','Bolones','Bolones','Maduro con queso','Bolón','Maduro con queso · incluye salsa de queso','Elige el tipo de bolón.',6,false),

('lore_bolones_prot','Lorejón','Bolones con proteína','Bolones con proteína','Cerdo','Bolón con proteína','Cerdo','Bolón con proteína. Elige la opción.',1,true),
('lore_bolones_prot','Lorejón','Bolones con proteína','Bolones con proteína','Queso','Bolón con proteína','Queso','Bolón con proteína. Elige la opción.',2,false),
('lore_bolones_prot','Lorejón','Bolones con proteína','Bolones con proteína','Chicharrón','Bolón con proteína','Chicharrón','Bolón con proteína. Elige la opción.',3,false),
('lore_bolones_prot','Lorejón','Bolones con proteína','Bolones con proteína','Mixto','Bolón con proteína','Mixto (2 proteínas)','Bolón con proteína. Elige la opción.',4,false),
('lore_bolones_prot','Lorejón','Bolones con proteína','Bolones con proteína','Trimixto','Bolón con proteína','Trimixto (3 proteínas)','Bolón con proteína. Elige la opción.',5,false),

('lore_bolones_mani','Lorejón','Bolones con maní','Bolones con maní','Cerdo','Bolón con maní','Cerdo','Maní mezclado con masa de plátano. Elige la opción.',1,true),
('lore_bolones_mani','Lorejón','Bolones con maní','Bolones con maní','Queso','Bolón con maní','Queso','Maní mezclado con masa de plátano. Elige la opción.',2,false),
('lore_bolones_mani','Lorejón','Bolones con maní','Bolones con maní','Chicharrón','Bolón con maní','Chicharrón','Maní mezclado con masa de plátano. Elige la opción.',3,false),
('lore_bolones_mani','Lorejón','Bolones con maní','Bolones con maní','Mixto','Bolón con maní','Mixto (2 proteínas)','Maní mezclado con masa de plátano. Elige la opción.',4,false),
('lore_bolones_mani','Lorejón','Bolones con maní','Bolones con maní','Trimixto','Bolón con maní','Trimixto (3 proteínas)','Maní mezclado con masa de plátano. Elige la opción.',5,false),

('lore_tigrillos','Lorejón','Tigrillos','Tigrillos','Mini','Tigrillo','Mini · incluye chicharrón','Elige la presentación de tu tigrillo.',1,true),
('lore_tigrillos','Lorejón','Tigrillos','Tigrillos','Mediano','Tigrillo','Mediano · incluye chicharrón','Elige la presentación de tu tigrillo.',2,false),
('lore_tigrillos','Lorejón','Tigrillos','Tigrillos','Grande','Tigrillo','Grande · incluye todo','Elige la presentación de tu tigrillo.',3,false),
('lore_tigrillos','Lorejón','Tigrillos','Tigrillos','Lorejón','Tigrillo','Lorejón · grande para compartir','Elige la presentación de tu tigrillo.',4,false);

create temp table rename_plan(
  local_name text,
  category_name text,
  old_name text,
  new_name text
) on commit drop;

insert into rename_plan values
('Abracadabra - Codesa','Hamburguesas','Clásica','Hamburguesa clásica'),
('Abracadabra - Espejo','Hamburguesas','Clásica','Hamburguesa clásica'),
('Abracadabra - Las Palmas','Hamburguesas','Clásica','Hamburguesa clásica'),
('Casa Bruma','Salchipapas','Clásica','Salchipapa clásica'),
('Santas Alitas','Hamburguesas','Completa','Hamburguesa completa'),
('Santas Alitas','Hamburguesas','Clásica','Hamburguesa clásica'),
('Santas Alitas','Hamburguesas','Hawaiana','Hamburguesa hawaiana'),
('Santas Alitas','Hamburguesas','Mexicana','Hamburguesa mexicana'),
('Santas Alitas','Ensaladas','César','Ensalada César'),
('Santas Alitas','Ensaladas','Crispy','Ensalada crispy'),
('Cafetería y Restaurante Bolivar','Porciones adicionales','Camarón','Porción adicional de camarón'),
('Lorejón','Bolones con encocados','Camarón','Bolón con encocado de camarón'),
('Lorejón','Adicionales','Chicharrón','Adicional de chicharrón'),
('Lorejón','Adicionales','Chorizo','Adicional de chorizo'),
('Lorejón','Adicionales','Patacones','Adicional de patacones'),
('Lorejón','Adicionales','Queso','Adicional de queso'),
('Lorejón','Adicionales','Tocino','Adicional de tocino');

create temp table resolved_merge on commit drop as
select
  mp.*,
  l.id as local_id,
  sc.id as source_category_id,
  tc.id as target_category_id,
  p.id as product_id,
  p.price as old_price,
  p.description as old_description,
  p.image_url as old_image_url,
  p.display_order as old_display_order
from merge_plan mp
join public.locals l on l.name=mp.local_name
join public.categories sc on sc.local_id=l.id and sc.name=mp.source_category
join public.categories tc on tc.local_id=l.id and tc.name=mp.target_category
join public.products p
  on p.local_id=l.id
 and p.category_id=sc.id
 and p.name=mp.old_name
 and p.active=true;

do $$
declare
  expected_rows int;
  actual_rows int;
  expected_groups int;
  valid_groups int;
begin
  select count(*) into expected_rows from merge_plan;
  select count(*) into actual_rows from resolved_merge;
  if expected_rows <> actual_rows then
    raise exception 'HTPWEB catálogo: % filas esperadas, % encontradas',expected_rows,actual_rows;
  end if;

  select count(distinct group_key) into expected_groups from merge_plan;
  select count(*) into valid_groups
  from (
    select group_key
    from resolved_merge
    group by group_key
    having count(*) filter(where is_canonical)=1
  ) q;

  if expected_groups <> valid_groups then
    raise exception 'HTPWEB catálogo: grupo canónico inválido';
  end if;
end
$$;

create temp table canonical_groups on commit drop as
select
  r.group_key,
  (array_agg(r.product_id) filter(where r.is_canonical))[1] as canonical_product_id,
  (array_agg(r.target_category_id))[1] as target_category_id,
  max(r.new_product_name) as new_product_name,
  max(r.new_description) as new_description
from resolved_merge r
group by r.group_key;

create table if not exists private.catalog_cleanup_20260927_backup(
  product_id uuid primary key,
  captured_at timestamptz not null default now(),
  product_snapshot jsonb not null
);

insert into private.catalog_cleanup_20260927_backup(product_id,product_snapshot)
select
  p.id,
  jsonb_build_object(
    'product',to_jsonb(p),
    'variants',coalesce(
      (select jsonb_agg(to_jsonb(v) order by v.display_order,v.name)
       from public.product_variants v
       where v.product_id=p.id),
      '[]'::jsonb
    ),
    'promotion_items',coalesce(
      (select jsonb_agg(to_jsonb(pi))
       from public.local_promotion_items pi
       where pi.product_id=p.id),
      '[]'::jsonb
    ),
    'promotions',coalesce(
      (select jsonb_agg(to_jsonb(lp))
       from public.local_promotions lp
       where lp.product_id=p.id),
      '[]'::jsonb
    ),
    'advertisements',coalesce(
      (select jsonb_agg(to_jsonb(a))
       from public.advertisements a
       where a.product_id=p.id),
      '[]'::jsonb
    )
  )
from public.products p
where p.id in (select product_id from resolved_merge)
   or p.id in (
     select p2.id
     from rename_plan rp
     join public.locals l on l.name=rp.local_name
     join public.categories c on c.local_id=l.id and c.name=rp.category_name
     join public.products p2
       on p2.local_id=l.id
      and p2.category_id=c.id
      and p2.name=rp.old_name
   )
on conflict(product_id) do nothing;

create table if not exists private.catalog_category_cleanup_20260927_backup(
  category_id uuid primary key,
  captured_at timestamptz not null default now(),
  category_snapshot jsonb not null
);

insert into private.catalog_category_cleanup_20260927_backup(category_id,category_snapshot)
select c.id,to_jsonb(c)
from public.categories c
join public.locals l on l.id=c.local_id
where l.name='Parrilladas Cedeño'
  and c.name='Parrilladas enteras'
on conflict(category_id) do nothing;

insert into public.product_variants(product_id,name,price,display_order,active)
select
  c.canonical_product_id,
  r.variant_name,
  r.old_price,
  r.variant_order,
  true
from resolved_merge r
join canonical_groups c using(group_key)
on conflict(product_id,name) do update
set
  price=excluded.price,
  display_order=excluded.display_order,
  active=true,
  updated_at=now();

update public.local_promotion_items i
set
  product_id=c.canonical_product_id,
  variant_id=v.id
from resolved_merge r
join canonical_groups c using(group_key)
join public.product_variants v
  on v.product_id=c.canonical_product_id
 and v.name=r.variant_name
where i.product_id=r.product_id;

update public.local_promotions lp
set
  product_id=c.canonical_product_id,
  updated_at=now()
from resolved_merge r
join canonical_groups c using(group_key)
where lp.product_id=r.product_id
  and lp.product_id<>c.canonical_product_id;

update public.advertisements a
set product_id=c.canonical_product_id
from resolved_merge r
join canonical_groups c using(group_key)
where a.product_id=r.product_id
  and a.product_id<>c.canonical_product_id;

update public.products p
set
  name=c.new_product_name,
  category_id=c.target_category_id,
  description=c.new_description,
  price=(
    select r.old_price
    from resolved_merge r
    where r.group_key=c.group_key
      and r.is_canonical
    limit 1
  ),
  catalog_visible=true,
  updated_at=now()
from canonical_groups c
where p.id=c.canonical_product_id;

update public.products p
set
  name=c.new_product_name||' · '||r.variant_name,
  catalog_visible=false,
  updated_at=now()
from resolved_merge r
join canonical_groups c using(group_key)
where p.id=r.product_id
  and r.product_id<>c.canonical_product_id;

update public.products p
set
  name=rp.new_name,
  updated_at=now()
from rename_plan rp
join public.locals l on l.name=rp.local_name
join public.categories c on c.local_id=l.id and c.name=rp.category_name
where p.local_id=l.id
  and p.category_id=c.id
  and p.name=rp.old_name
  and p.active=true
  and p.catalog_visible=true;

update public.categories c
set
  active=false,
  updated_at=now()
from public.locals l
where c.local_id=l.id
  and l.name='Parrilladas Cedeño'
  and c.name='Parrilladas enteras'
  and not exists(
    select 1
    from public.products p
    where p.category_id=c.id
      and p.active=true
      and p.catalog_visible=true
  );
