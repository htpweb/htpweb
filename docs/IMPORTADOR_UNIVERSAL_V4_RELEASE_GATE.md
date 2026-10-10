# HTPWEB — Puerta de salida para catálogo universal V4

## Fuente única verificada
- `public.products` es la tabla de catálogo canónica.
- `public.business_products` es una **vista SELECT** de `public.products`, no una tabla duplicada.
- `public.product_variants` conserva precios/presentaciones.
- `public.business_categories` y demás vistas exponen el catálogo a la tienda web.
- Matriz ALIA: `HTPWEB_MATRIZ_UNIVERSAL_V4_40_NEGOCIOS.xlsx`, hoja `MATRIZ V4` con **1.174 filas y 36 nombres de negocio** (nombre histórico de archivo no determina conteo).

## Rama
`feature/importador-matriz-v4-negocios`: nunca publicar ni mergear sin completar los criterios pendientes.

## Implementado en esta rama
- Panel de lectura previa de V4 en administración de catálogo.
- Selección de carpeta de fotos y comprobación de nombres.
- Hojas auxiliares de matriz preservadas en memoria.
- Alertas para SKU en conflicto, precio ausente, imagen sin nombre, variantes mezcladas.
- `app/tienda.html` y `app/local.html` orientadas a tarjetas sin ejecutar los antiguos visores en estas páginas.

## Bloqueadores de publicación — obligatorios
1. Resolver negocio V4 -> UUID exacto existente, incluyendo nombres comerciales que difieren; **nunca** elegir por orden o parecido automático.
2. Implementar carga real de imágenes a Storage con permiso por rol, nombre verificado y trazabilidad; no publicar imagen de menú como producto.
3. Implementar importador transaccional e idempotente por (business_id, SKU) sin modificaciones ajenas. El RPC heredado `bulk_import_catalog_multilocal_v3` usa fallback por nombre y NO resulta seguro para este caso hasta ser adaptado.
4. Persistir grupos de opciones, cantidades, reglas según variante, suplementos, combos y condiciones especiales. Los campos V4 no caben todos en el esquema actual.
5. Calcular precio y validar selecciones de opciones en tienda, carrito, checkout y confirmación de pedido (servidor).
6. Los artículos de importe o reglas obligatorias no confirmados se guardan como borradores, sin posibilidad de comprar.
7. Resolver menú/plantilla en panel MASTER y NEGOCIO. Desactivar selecciones de antiguos menús solamente tras validación y verificación en todas las rutas.
8. Validar rendimiento móvil/escritorio, 36 negocios, seguridad RLS, disponibilidad, delivery, rastreo de vistas, rollback y backups.

## Protección
- No modificar `analytics_events` ni borrar registros PAGE_VIEW.
- No borrar órdenes, configuraciones ni perfiles por compartir dependencias.
- La eliminación física de archivos heredados se hace únicamente al desaparecer todas sus referencias y aprobarse tests.
- No cambiar `main` ni Supabase producción antes de pruebas completas.
