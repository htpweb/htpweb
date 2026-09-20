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


## HTPWEB en GitHub Pages

Para la publicación actual, la clave de navegador debe autorizar como mínimo:

- `https://htpweb.github.io/*`
- `https://htpweb.github.io/htpweb/*`

Después de guardar un cambio de restricciones en Google Cloud, puede tardar unos minutos en propagarse. Actualiza HTPWEB con Ctrl+F5 antes de volver a probar.

## Diagnóstico dentro de HTPWEB

En MASTER > Locales > Crear/Editar LOCAL existe el botón **Probar conexión Google**.

Comprueba por separado:

1. Maps JavaScript API.
2. Places.
3. Geocoding.

Si aparece `REQUEST_DENIED` o "the webpage is not allowed to use the geocoder", revisar en el mismo proyecto de Google Cloud:

- facturación vinculada y activa;
- Geocoding API habilitada;
- Maps JavaScript API habilitada;
- Places API (New) habilitada;
- la clave usa restricciones de tipo Websites/HTTP referrers;
- el dominio de GitHub Pages está en los sitios permitidos;
- las restricciones de API incluyen los tres servicios anteriores.

## Enlaces compartidos de Google Maps

La carga masiva admite enlaces HTTPS de Google Maps, incluidos enlaces cortos `maps.app.goo.gl`.

Los enlaces cortos se resuelven mediante la Edge Function autenticada `resolver-google-maps`. La función:

- acepta únicamente dominios de Google Maps;
- sigue la redirección del enlace corto;
- extrae coordenadas cuando están presentes en la URL final;
- devuelve el enlace resuelto y datos utilizables por el navegador;
- no almacena ni necesita una clave privada de Google.

Después, HTPWEB usa Google Geocoding cuando está autorizado para completar una dirección legible.
