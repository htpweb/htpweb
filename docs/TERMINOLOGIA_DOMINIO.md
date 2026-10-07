# Terminología de dominio HTPWEB

## Decisión oficial

Desde el 7 de octubre de 2026, la entidad comercial principal de HTPWEB se denomina:

- **Español:** NEGOCIO
- **Código nuevo:** `business`
- **Plural de código:** `businesses`
- **Administrador:** `BUSINESS_ADMIN`

La palabra **LOCAL** deja de ser el nombre de la entidad comercial. Solo puede usarse cuando describa una ubicación física, sucursal o cuando sea una dependencia heredada que todavía no se ha migrado.

## Compatibilidad heredada

HTPWEB nació con la entidad técnica `LOCAL`. En producción todavía existen dependencias como:

- `public.locals`
- `local_id`
- `local_deliveries`
- `user_locals`
- `LOCAL_ADMIN`
- funciones, políticas RLS, triggers y migraciones históricas con prefijo `local_`

Estas referencias son **legacy** y no deben crecer. Se mantienen temporalmente para evitar regresiones mientras el dominio se migra por capas.

## Regla para código nuevo

No crear nuevas entidades de negocio con nombres `local`, `locals`, `local_id` o `LOCAL_ADMIN`.

Usar:

- `business`
- `businesses`
- `businessId`
- `business_id`
- `BUSINESS_ADMIN`

Cuando una funcionalidad nueva necesite acceder al esquema heredado, debe hacerlo a través de la capa de compatibilidad documentada en `config/business-domain.js`.

## Distinción futura

- **Business / Negocio:** empresa, emprendimiento, profesional o actividad comercial.
- **Branch / Sucursal:** sede física de un negocio.
- **Location / Ubicación:** dirección o punto geográfico.
- **Storefront / Página del negocio:** presencia pública generada por HTPWEB.

Ejemplo:

```
Negocio: Abracadabra
├── Sucursal Las Palmas
├── Sucursal Codesa
└── Sucursal Espejo
```

Un negocio puede existir sin una ubicación física pública.

## Regla de migración

La migración se ejecuta en este orden:

1. Interfaz y lenguaje público.
2. Nombres de dominio en JavaScript.
3. Rutas canónicas con compatibilidad.
4. Roles y permisos mediante alias compatibles.
5. Backend y RPC.
6. Tablas/columnas de Supabase.
7. Retiro del legado después de validar todas las pruebas.

Las migraciones SQL históricas no se renombran: son parte del historial del sistema.
