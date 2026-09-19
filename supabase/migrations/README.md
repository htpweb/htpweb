# Migraciones HTPWEB

Este repositorio empezó a versionar migraciones de Supabase después de completar manualmente los Códigos #1–#64 en el proyecto remoto existente.

## Regla

- NO copiar aquí los scripts históricos #1–#64 para ejecutarlos otra vez.
- Desde el Código #65 en adelante, cada cambio permanente de base de datos debe guardarse como una nueva migración `.sql`.
- Las migraciones nuevas se aplican con `supabase db push`.
- Antes de desplegar, usar `supabase db push --dry-run`.

Ejemplo de nombre:

`20260919050000_codigo_65_descripcion.sql`

El estado remoto existente de HTPWEB se considera el baseline operativo.
