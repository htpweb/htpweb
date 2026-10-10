# Bloque 1 — Control de cierre (2026-10-10)

## Respaldo previo realizado
Migración: `20261010055000_precleanup_commercial_archive.sql`, esquema `htpweb_backup_20261010`.
Verificado por conteos: products 1067/1067, product_variants 387/387, orders 22/22, order_items 38/38.
El respaldo es una copia interna en el mismo proyecto, no equivale a un backup externo de recuperación ante caída total.

## Bloqueadores detectados en Excel V4 real (ALIA)
- 36 negocios, 1174 filas.
- 21 repeticiones de clave negocio + SKU + variante; varias son legítimas filas de grupos de opciones distintos de un mismo producto (por ejemplo cocción y acompañamiento), no deben eliminarse ni deduplicarse por fuerza.
- 101 filas con estado REVISAR.
- Abracadabra es una sola empresa con 3 sucursales; el libro la nombra como empresa, requiere regla de distribución a sucursales.

## Consecuencia operativa
NO ejecutar truncados/borrados del catálogo antiguo todavía: la función actual de importación V4 rechaza filas SKU+variante repetidas y aún no almacena grupos múltiples de opciones como datos normalizados.
NO marcar bloque 1 al 100% hasta que estén implementadas y probadas estas opciones, correspondencias del Excel y las importaciones autenticadas MASTER y NEGOCIO.

## Próxima corrección necesaria
1. Modelo persistente product_option_groups/product_option_values con restricciones cantidad, repetición, mínimos y máximos.
2. Normalizador Excel que agrupe por negocio+SKU+variante y adjunte grupos de opciones a la misma ficha.
3. Importación atómica en Supabase por negocio con control de RLS/roles y pruebas idempotentes.
4. Conciliación negocio/SKU y matriz por sucursal, seguida de respaldo externo y limpieza autorizada.
5. Pruebas en páginas publicadas y entrega a ambos canales comerciales.
