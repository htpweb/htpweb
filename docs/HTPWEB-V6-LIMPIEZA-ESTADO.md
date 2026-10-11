# HTPWEB V6 — Limpieza estructural (11-10-2026)

## Alcance autorizado
Eliminar todos los datos operativos de negocios, sucursales, deliverys, usuarios no MASTER, productos, variantes, menús, promociones y pedidos. Mantener dos usuarios MASTER, infraestructura y funcionalidades reutilizables. Reconstruir cualquier componente que dependa del modelo obsoleto.

## Ejecutado
- Supabase: vaciado de tablas comerciales public y private, verificación negocios=0, deliverys=0, productos=0, pedidos=0, promociones=0, clientes=0, usuarios=2 y perfiles=2.
- GitHub rama v6-reconstruccion-limpia: 32 rutas comerciales nominales y archivo SEO generado retirados en un commit anterior (33 archivos); 177 páginas/rutas generadas bajo p/ y carpetas hexadecimales retiradas en un segundo commit.
- main sin modificación por estas intervenciones.

## Pendiente — no eliminar a ciegas
- Supabase Storage: htpweb-media (755), menu-review (72), local-claim-evidence (5), htpweb-imports (1), htpweb-share-pages (1) objetos. Identificar pertenencia y borrar usando Storage API, no mediante DELETE de storage.objects.
- Auditar config/legacy-local-baseline.json, premium-v3/showcase/business-demo-config.json, catalog-manifest.json y catalog.json y referencias antes de retirarlos.
- Auditar páginas demo, fotografías, materiales de showcase y referencias de negocio/producto antiguo. Mantener plantillas web de carácter genérico.
- Sustituir modelo legacy locals y reconstruir negocios, deliverys, menús en módulos coherentes sin parches.
- Ejecutar pruebas de MASTER, autenticación, alta de negocios/deliverys, flujo de pedido, tarifas, rutas y Meta antes de publicar.

## Regla de despliegue
No mezclar en main ni publicar V6 hasta que la plataforma funcione correctamente sin registros comerciales y supere las pruebas de integración.
