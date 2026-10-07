# Rollback seguro — Fase 4 BUSINESS

Fecha: 2026-10-07.

## Código
El punto previo a esta fase está preservado en la rama:

`backup/pre-business-phase4-2026-10-07`

Para volver al código anterior, restaurar esa rama/commit en `main`.

## Base de datos
La Fase 4 fue diseñada como migración aditiva:
- añade `business_id` junto a `local_id`;
- añade `origin_business_id` junto a `origin_local_id`;
- sincroniza ambos nombres mediante triggers;
- agrega RPC BUSINESS que delegan en contratos históricos;
- no renombra ni elimina `local_id`, `origin_local_id`, tablas históricas o datos.

Por esta razón, el código de Fase 3 puede ejecutarse sobre la base posterior a Fase 4 sin retirar las columnas nuevas. Ese es el rollback preferido y evita pérdida de datos.

NO ejecutar un DROP masivo de columnas BUSINESS para volver atrás. Las columnas extra son compatibles y contienen copias sincronizadas de las claves históricas.

## Limpieza
Los archivos muertos retirados se recuperan también desde la rama de respaldo si fuera necesario.
