# Política de código legacy y limpieza — HTPWEB

Fecha de corte: 2026-10-07.

## Regla de dominio
La entidad comercial canónica es **NEGOCIO** en interfaz y **BUSINESS** en código.

`LOCAL`, `local_id`, `LOCAL_ADMIN` y nombres `*_local_*` solo pueden permanecer cuando formen parte de:
- contratos históricos de Supabase;
- migraciones ya aplicadas;
- compatibilidad temporal explícita;
- rutas antiguas que redirigen a una ruta BUSINESS/NEGOCIO.

No se debe agregar lógica nueva a archivos legacy.

## Archivos retirados en esta limpieza
Estos archivos estaban sin referencias activas y su funcionalidad ya existe dentro de los módulos actuales:
- admin/analytics.html
- admin/analytics-dashboard.js
- assets/analytics-dashboard.css
- admin/carga-masiva.html
- admin/bulk-import.js
- admin/package-import.js

## Shims temporales
Los siguientes nombres históricos se conservan únicamente para caché/enlaces antiguos y deben seguir siendo pequeños:
- admin/locales-master.js
- admin/locales-bulk.js
- admin/local-page-editor.js
- admin/local-subscriptions.js
- admin/local-categories-master.js
- app/crear-local.html
- app/reclamar-local.html

La implementación activa vive en archivos BUSINESS/NEGOCIO.

## Regla para borrar
Un archivo puede eliminarse cuando:
1. no tiene referencias activas;
2. existe una implementación canónica equivalente;
3. no es una migración histórica;
4. no es una URL pública que aún necesite compatibilidad;
5. las pruebas pasan después de retirarlo.

Las migraciones SQL históricas no se renombran ni se borran.
