update public.products
set
  description='Picada personal. Elige proteína: carne, pollo o chuleta.',
  price=4.50,
  updated_at=now()
where id='9f9309a6-6f88-4b59-96f9-51296f825bd8'::uuid;

update public.product_variants
set
  active=true,
  price=4.50,
  display_order=case name
    when 'Carne' then 1
    when 'Pollo' then 2
    when 'Chuleta' then 3
    else display_order
  end,
  updated_at=now()
where product_id='9f9309a6-6f88-4b59-96f9-51296f825bd8'::uuid
  and name in ('Carne','Pollo','Chuleta');

notify pgrst,'reload schema';
