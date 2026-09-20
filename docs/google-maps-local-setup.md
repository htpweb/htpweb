# Google Maps para búsqueda y ubicación de LOCAL

HTPWEB usa Google Maps únicamente en la ficha de creación/edición de LOCAL cuando existe una clave de navegador autorizada.

## APIs requeridas

En el mismo proyecto de Google Cloud habilitar:

1. Maps JavaScript API
2. Places API (New)
3. Geocoding API

Debe existir una cuenta de facturación válida en Google Maps Platform. HTPWEB no habilita facturación ni crea credenciales automáticamente.

## Crear la clave

Crear una API key para navegador y aplicar **antes de usarla en producción**:

- Application restrictions: **Websites (HTTP referrers)**.
- Agregar el dominio HTTPS real de HTPWEB y, solo para desarrollo, los orígenes locales que se utilicen.
- API restrictions: limitar la clave exclusivamente a:
  - Maps JavaScript API
  - Places API (New)
  - Geocoding API

La clave de Maps JavaScript es visible en el navegador por diseño; su seguridad depende de las restricciones anteriores.

## Activarla en HTPWEB

Editar `config/maps.js` y colocar la clave restringida en:

```js
window.HTPWEB_MAPS = Object.freeze({
  googleKey: "CLAVE_RESTRINGIDA",
  defaultCenter: [0.9592, -79.6539]
});
```

No colocar claves de servicio, secretos de Supabase ni credenciales privadas en este archivo.

## Comportamiento implementado

Con la clave activa, en MASTER > Locales:

- el buscador usa Place Autocomplete (New);
- limita resultados a Ecuador;
- sesga resultados hacia el cantón según los polígonos de sus zonas;
- al seleccionar un establecimiento completa nombre y dirección;
- usa componentes administrativos de Google para intentar seleccionar Provincia y Cantón;
- guarda Place ID para evitar duplicados;
- al hacer clic o mover el marcador realiza reverse geocoding;
- vuelve a completar la dirección del nuevo punto;
- detecta la zona HTPWEB a partir de las coordenadas;
- teléfono y horario de Google siguen siendo una consulta opcional; el horario es solo sugerencia.

Si no hay clave, HTPWEB conserva el mapa alternativo y la selección manual del punto.
