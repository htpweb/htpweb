# HTPWEB — Transición controlada al menú universal V3

Estado: EN PREPARACIÓN. No activar ni borrar menús actuales hasta disponer de reemplazo probado.

## Decisión técnica
- La interfaz actual y la compacta se retirarán al terminar el reemplazo.
- Mantener tablas products, product_variants, business_products, orders, business_orders, analytics_events y business_menu_pages hasta validar consumidores.
- Mantener siempre eventos PAGE_VIEW y las métricas de sitios web.
- No ejecutar TRUNCATE, DROP ni CASCADE sobre tablas compartidas.
- Datos iniciales verificados 2026-10-09: products=1067, product_variants=387, business_products=1067, orders=22, business_orders=22, analytics_events=378, local_menu_pages=94, business_menu_pages=94.

## Implementación
1. Crear un catálogo canónico reutilizando el esquema actual; ampliar para grupos de opciones, reglas por variante, promociones, componentes de combos y trazabilidad de imágenes solamente si faltan.
2. Importador Excel V3 con hojas PRODUCTOS, VARIANTES, OPCIONES, REGLAS, PROMOCIONES, COMPONENTES, CARGOS, IMAGENES, REVISION. Validación y dry run; upsert por business_id + catalog_code; no borrar registros no gestionados por importación.
3. Crear la nueva interfaz de tarjetas con selección condicional y cálculo de precio sin estimaciones. Bloquear compras cuando falte información obligatoria.
4. Integrar la interfaz en MASTER, NEGOCIO y páginas públicas mediante bandera de transición. Conservar la compatibilidad con carrito, pedidos y entregas.
5. Prueba de un negocio real en rama; comprobar compra completa, vista móvil, roles, métricas y fotos; después desplegar para los restantes.
6. Retirar menu-viewer.js, compact-menu.js y sus estilos únicamente cuando las búsquedas de referencias y pruebas automáticas sean satisfactorias.
7. Conservar archivos de rollback y copia de seguridad con verificación.

## Puntos de riesgo identificados
- app/local.html carga ambos módulos y usa businesses.menu_design.
- config/compact-menu.js consume RPCs public_business_menu_pages/public_list_business_gallery y adaptador del carrito.
- config/menu-viewer.js integra visor del menú y promociones.
- La función crear-pedido y las páginas de pedidos no deben eliminarse: se reutilizan.
- Las tablas de métricas mezclan eventos de visita con eventos operativos.
- Los 40 Excel son heterogéneos y varios precios dependen de variantes.

## Criterio de aceptación
Ningún menú antiguo deberá mostrarse al público una vez activado V3. Deben mantenerse páginas públicas, SEO, perfiles, suscripciones, roles, pedidos nuevos y PAGE_VIEW. No publicar en main sin pruebas y respaldo.
