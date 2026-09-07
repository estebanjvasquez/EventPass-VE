# Revisión visual y experiencia pública · 7 septiembre 2026

## Implementado

- Landing comercial con fotografía original de recinto, dirección cinematográfica, tipografía y superficies oscuras coherentes. CTA inicial visible en móvil y escritorio; rutas de alta y contacto conservadas, incluido el ancla `#caracteristicas`.
- Landing del organizador conserva su marca y listado de eventos publicados.
- Agenda pública responsive: tarjetas de actividad actual y siguiente, programa con inicio/fin, estado explícito, escenario, ponentes y patrocinantes. Conserva configuración de colores, tipografía, escala y refresco. Un fallo de refresco no elimina la última agenda recibida.
- Plano público: detalle de empresa visible como panel inferior en móvil y lateral en escritorio; cierre con botón o Escape. Los filtros incluyen la categoría pública aprobada y no eliminan el contexto del recinto. Botón para limpiar filtros.
- Colores públicos por disponibilidad/asignación, independientes de los colores por tamaño del diseñador. Leyenda corregida. Impresión del plano habilitada sin cambiar la impresión de gafetes en otras rutas.
- Editor: biblioteca plegable en pantallas pequeñas; paneles laterales con desplazamiento propio en escritorio. No se cambió geometría, arrastre, persistencia, RPC ni permisos.
- Movimiento de entrada desactivado cuando el visitante solicita movimiento reducido.

## Referencias que orientaron las decisiones

- [Apple TV](https://tv.apple.com/): dirección fotográfica, jerarquía sobre imagen y superficies oscuras. Inspiración visual, sin copiar material de series ni marcas.
- [ExpoFP: funciones del plano](https://help.expofp.com/en/articles/11031113-floor-plan-features): búsqueda, categorías, favoritos y consulta de empresas desde el plano.
- [ExpoFP: vista del plano](https://help.expofp.com/en/articles/8699098-floor-plan-view): interacción pública y acceso a información del expositor.

## Verificación reproducible

Desde `frontend/`, mantener Vite activo con `npm run dev -- --host 127.0.0.1` y ejecutar:

```powershell
node scripts/qa-public-visual.mjs
npm run build
npx oxlint src/pages/Landing.tsx src/pages/AgendaPublica.tsx src/pages/PlanoPublico.tsx src/pages/admin/ExhibitionCanvasEditor.tsx src/pages/admin/exhibition/ExhibitionKonvaStage.tsx
```

La prueba de navegador intercepta todas las peticiones a Supabase y usa exclusivamente datos ficticios. No crea ni modifica eventos reales. Se ejecutó con Chromium en 1440, 768 y 390 píxeles:

- CTA de portada visible sin desplazamiento.
- Búsqueda por categoría pública y conservación visual del recinto.
- Apertura del detalle, descripción visible y cierre con Escape.
- Plano presente bajo modo de impresión, no página vacía.
- Agenda clara y oscura, estados, sin desbordamiento horizontal.
- Sin excepciones JavaScript no controladas.
- Favoritos con JSON local dañado y almacenamiento bloqueado: la visita sigue utilizable.
- Blueprint inaccesible: muestra aviso sin impedir la consulta de stands.
- Cambio de ruta a un evento no publicado: no conserva el plano del evento anterior.

Capturas regenerables en `frontend/test-results/public-visual/` (ignoradas por Git). Revisadas visualmente la portada, el detalle móvil y la agenda clara/oscura.

## Límites de esta validación

No equivale a una prueba autenticada de creación/edición de planos ni a comprobación de producción. El editor conserva su lógica y pasa TypeScript; sus controles autenticados requieren smoke sobre un evento de prueba. No se aplicaron migraciones ni cambios de seguridad. La advertencia de hooks en `PlanoPublico` se corrigió colocando la carga dentro del efecto dependiente del evento, con limpieza de respuestas tardías, sin desactivar reglas del linter.

Entrega autorizada para commit y despliegue. Punto de retorno documentado en `ROLLBACK_VISUAL_2026-09-07.md`. No se afirma rendimiento Lighthouse ni ausencia total de regresiones: se documentan las comprobaciones efectivamente ejecutadas.
