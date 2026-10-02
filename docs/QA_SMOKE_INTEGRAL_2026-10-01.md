# Auditoría funcional y smoke — 1 de octubre de 2026

## Resultado

**QA con incidencias abiertas. No es una aprobación integral para lanzamiento.** Se recorrieron los módulos públicos y de organización en Chrome autenticado, se probaron interacciones reales y se ejecutaron suites locales con respuestas simuladas, pruebas SQL aisladas y verificaciones anónimas de producción. Cargar una pantalla no equivale a aprobar todas sus operaciones.

Entorno público: `https://eventosfacil.net` y `https://expo-energia-2026.eventosfacil.net`. Repositorio en `main`, base `d598a1a`; código desplegado según registro previo `ef27bba`. Supabase del proyecto: `moqywmcbklaeaelttzdm`. Navegación autenticada con organización activa Expo Venezuela Energética 2026. Viewport móvil probado: 390 × 844; suites locales: 1440, 768 y 390 px.

Identificadores reproducibles:

| Objeto | ID |
|---|---|
| Foro Energetico de Venezuela | `47ad0375-24dd-4f40-80c0-500f4362767c` |
| Expo Energia 2026 | `276e4d25-b107-4393-9530-542db8ed03a3` |
| Programa Foro + Expo 2 | `8f84c7bf-384c-4756-8b47-bde4306642a3` |
| Empresa Demo QA Hidrocarburos 01 | `27bb7870-2a99-4c19-b277-bc4d87992b65` |

## Incidencias confirmadas, por prioridad

P1: bloquea captación o medición principal. P2: función o experiencia incorrecta con alternativa. P3: mejora de claridad. No se ha confirmado una incidencia P0.

### QA-01 · P1 · Registro del programa inutilizable cuando no hay pases

1. Abrir la web compartida y pulsar **Registrarme**.
2. La ruta `/p/8f84c7bf-384c-4756-8b47-bde4306642a3/registro` carga el formulario.
3. **Acceso** está vacío y **Registrarme** deshabilitado, sin explicación ni alternativa.
4. El centro del programa, después de cargar empresas y sesiones, no muestra ningún pase.

Confirmado en escritorio y móvil. Causa inmediata: falta de configuración; defecto del producto: permite anunciar un registro imposible y no explica cómo continuar. `RegistroPrograma.tsx` deshabilita el envío con `!passes.length`; también convierte una respuesta sin datos de pases en lista vacía sin mostrar su error específico.

Propuesta: validación del checklist/publicación, estado público explícito de inscripciones no disponibles, enlace de contacto y errores de carga diferenciados. Configurar un pase real con sus reglas antes de lanzar. No se creó un pase arbitrario en producción.

### QA-02 · P1 · El CTA de información apunta a un formulario no publicado

1. Abrir la web compartida.
2. Pulsar **Solicitar información**.
3. Destino: `/e/276e4d25-b107-4393-9530-542db8ed03a3/interes/solicita-informacion`.
4. Resultado: **Formulario no disponible. Este enlace puede haber vencido o no está publicado.**

El módulo de formularios del evento no mostraba formularios configurados. `EventPublicLanding.tsx` construye un slug fijo. Propuesta: seleccionar un formulario publicado, comprobar su disponibilidad y ocultar/deshabilitar el CTA cuando no existe. Añadir esta dependencia al checklist.

### QA-03 · P1 · Pérdida de atribución por enlaces secundarios

Campaña real de prueba: **QA Smoke 2026-10-01**, ID `12879085-bfa8-4aed-867e-de14dd8c7ea0`, Instagram / publicación orgánica, promoviendo el Foro sobre la web compartida.

1. Entrar a la web compartida con `utm_campaign`, `utm_source=instagram`, `utm_medium=social` y `ep_event` del Foro.
2. Actualizar el dashboard: campaña con **1 visita, 0 aperturas, 0 completados**.
3. Pulsar **Foro Energetico de Venezuela** dentro de **Eventos del programa**.
4. Abre `/e/47ad0375-24dd-4f40-80c0-500f4362767c` sin parámetros. Tras actualizar el dashboard, la campaña sigue con **0 aperturas**.
5. Volver por el enlace de campaña y pulsar el CTA principal **Registrarme**. Esta ruta conserva los parámetros y ahora el dashboard muestra **1 apertura**.

Evidencia de código: los enlaces de `linkedEvents` en `EventPublicLanding.tsx` no usan `registrationCampaignUrl`. Además, `campaignAttribution.ts` separa sesiones por evento y programa, mientras que `RegistroEvento.tsx` registra con programa nulo. No basta con añadir UTM sin decidir cómo continuar la misma visita entre ambos ámbitos.

Propuesta: contrato único de atribución para todos los recorridos desde landing, agenda y plano; mantener evento promovido, campaña y visita válidos al pasar al registro individual. Test E2E adicional para cada CTA secundario. La conversión final no se envió en producción; el fallo confirmado es la apertura perdida.

### QA-04 · P2 · Formulario de otra organización bajo el dominio del programa

Abrir `https://expo-energia-2026.eventosfacil.net/e/5da6c528-f7b2-4fa8-b458-3adb83fbd095`: se muestra **Petróleo Prueba**, de **JUANCHO EVENTOS**, con formulario y botón de reserva.

Se confirmó mezcla de contexto de dominio con contenido público ajeno. **No demuestra acceso a datos privados ni bypass de RLS.** `resolveTenant` resuelve organizaciones y `resolvePublicSite` sitios por separado; el dominio de programa no impone aquí el alcance de sus eventos.

Propuesta: resolver organización y alcance desde el sitio público; rechazar un evento ajeno o redirigir explícitamente a su URL canónica. Añadir casos para dominios propios, programas y organización.

### QA-05 · P2 · Rutas desconocidas dejan una página vacía

Abrir `https://eventosfacil.net/qa-smoke-ruta-inexistente`. El DOM permanece vacío, sin explicación ni navegación. `App.tsx` no tiene una ruta comodín de recuperación.

Propuesta: página 404 con regreso al inicio contextual, accesible y con enlace de ayuda; comprobar enlaces obsoletos y rutas mal escritas.

### QA-06 · P2 · El cintillo ignora movimiento reducido

Reproducción local aislada: ejecutar `frontend/scripts/qa-agenda-design.mjs` contra Vite con configuración de producción. Pausar y reanudar manualmente funciona. Al activar `prefers-reduced-motion: reduce`, la animación de `.agenda-marquee-track` sigue en estado `running`.

`SponsorTicker` usa `Element.animate`; comprobar únicamente `animationName` o `animationPlayState` CSS no mide esta animación. Se ajustó el test a `getAnimations()`. La suite sigue fallando deliberadamente ante el defecto real.

Propuesta: respetar `matchMedia` y sus cambios en la animación WAAPI; detenerla y presentar patrocinadores estáticos sin perder contenido. Validar preferencia inicial y cambio durante la sesión.

## Configuración y mejoras que requieren decisión

| ID | Prioridad | Observación | Acción propuesta |
|---|---|---|---|
| QA-07 | P2 | Expo en modalidad pagada muestra «Importe no registrado; consulta al organizador» y ofrece reservar. No se completó la reserva. | Definir precio/categoría o explicitar una reserva sin importe; validar precio y método antes de publicar venta. |
| QA-08 | P2 | La agenda publicada presenta Foro en septiembre y sesiones en noviembre; el registro del Foro anuncia 23 de octubre. | Conciliar datos/borrador publicado y avisar de sesiones fuera de rango. Puede ser contenido QA; no se atribuye automáticamente al cálculo de fechas. |
| QA-09 | P2 | Evento de prueba de julio permanece publicado con botón de reserva en octubre. | Acordar cierre por fecha/plazo y mensaje de evento finalizado; envío final no probado. |
| QA-10 | P3 | «Volver al evento» del plano conduce al formulario; «Agenda» conduce a pantalla de sala. | Diferenciar portada, agenda de visitante y pantalla de sala. |
| QA-11 | P3 | Estados como `published`, `draft`, `unpaid`, `fulfilled`, `prospect` y tipos de evento en inglés. | Diccionario de etiquetas consistente en español. |
| QA-12 | P3 | Algunos módulos muestran ceros o «no hay…» antes de terminar la carga; posteriormente aparecen empresas, eventos o sesiones. | Esqueletos/indicador de carga; no presentar vacío definitivo mientras hay consultas pendientes. |
| QA-13 | P3 | Fechas de venta de categorías usan Europe/Madrid del dispositivo; resto del evento America/Caracas. La UI sí lo indica. | Permitir operar en zona horaria del evento y mostrarla junto al campo. |
| QA-14 | P3 | La web compartida presenta encabezado de Expo, formulario de programa y marca del Foro. | Revisar identidad común y explicar acceso a cada evento. |

## Cobertura real en navegador

| Área | Ejecutado | Resultado / límite |
|---|---|---|
| Inicio comercial y alta de organización | Navegación, anclas, formulario y campos obligatorios | Carga correcta; no se creó una organización ni se aceptaron términos. |
| Panel organizador, eventos y resúmenes | Navegación autenticada y lectura de métricas | Correcto en pantallas revisadas. |
| Web compartida | Entrada desde Foro y Expo; selección del programa; guardar borrador sin alterar sus valores | Guardado real con confirmación. Ambas entradas llegan al mismo editor. No se publicó contenido nuevo. |
| Campañas | Crear campaña QA, abrir destino, actualizar métricas; comparar CTA principal/secundario | Creación y medición principal correctas; QA-03 en enlaces secundarios. No se publicó en redes ni compró publicidad. |
| Categorías | Categoría gratuita publicada, selección pública y formulario administrativo | Lectura/selección correctas; inventario/precios además cubiertos por SQL aislado. No se cambiaron precios reales. |
| Registro individual | Formularios gratuito y pagado, resumen y selección de entrada | Presentes; falta comprobar envío y correo con destinatario QA controlado. |
| Registro programa | Formulario y resumen en escritorio/móvil | Bloqueado por ausencia de pases: QA-01. |
| Recuperación y credencial | Formulario de recuperación, sin sesión, tokens inexistentes de credencial/comprobante | Mensajes de acceso/error correctos; recepción real de correo pendiente. |
| Programa/agenda | Agenda pública, filtros sin coincidencias, configuración y centro de programa | Navegación correcta; inconsistencias de contenido QA-08. |
| Plano público | Directorio, búsqueda, detalle, favoritos, código iframe | Interacciones correctas; favorito añadido y retirado. PDF/impresión cubiertos localmente; impresión física pendiente. |
| Expositores | Lista, empresas, perfiles y acceso al portal desde empresa QA | Carga y navegación correctas; no se aprobaron perfiles reales. |
| Portal de empresa QA | Crear tarea identificada QA, marcar lista, comprobar contador 1 → 0 | Correcto con escritura real. Perfil, documentos y pagos inspeccionados; sin registrar pagos. |
| Visitantes del stand | Seleccionar stand y enviar QR inválido | Rechazo claro, cero visitas registradas. No se habilitó cámara. |
| Check-in | Código inexistente de 32 caracteres | «Código no válido», sin incremento de ingresos. Check-in válido/duplicado pendiente con credencial QA. |
| Acreditación | Selector evento, búsqueda sin coincidencias, apertura de walk-in | Correcto; no se creó walk-in, imprimió ni marcó entrega. |
| Operación, equipo y puntos de acceso | Lectura de pantallas y selectores | No se asignaron permisos ni invitaron usuarios. |
| Planos, paquetes, publicación | Abrir diseñador, paquete existente, estado de publicación | Smoke de navegación; no se movió inventario ni retiró publicación. |
| Proveedores, patrocinantes, suscripción | Lectura y formularios | Sin compras, cambios de plan, envíos ni importaciones masivas. |
| Móvil en producción | Landing, registro programa, plano, campañas, categorías y constructor | Sin desbordamiento horizontal global detectado a 390 px. No sustituye revisión de cada control ni dispositivo físico. |
| Acceso anónimo | Admin, eventos, check-in, portal y superadmin | Las cinco rutas redirigen al login en navegador limpio. No prueba separación de todos los roles autenticados. |

Las inspecciones iniciales de carga vacía se contrastaron cuando eran relevantes; no se contabilizan como pérdida de datos. El portal se abrió con usuario organizador, no con credenciales independientes de expositor.

## Suites ejecutadas

| Comando | Resultado final | Alcance |
|---|---|---|
| `node scripts/test-program-agenda.mjs` | PASS | Días, zonas horarias, hora inexistente por DST. |
| `node scripts/test-participant-db.mjs --campaigns` | PASS | PGlite aislado: migración repetible, permisos, borradores, categorías/cupos/precio inmutable, recuperación, QR, campañas, deduplicación, conversión atómica y aislamiento. |
| `node scripts/smoke-program-agenda.mjs` | PASS | API pública real, sesiones, ámbito de programa/evento, inexistente, escritura anónima denegada, borradores privados. |
| `node scripts/qa-participant.mjs` desde frontend | PASS | Playwright local, mocks: entradas de editor compartido, recarga de borrador, categoría/resumen, estados y recuperación; escritorio/móvil. |
| `node scripts/qa-public-visual.mjs` desde frontend | PASS | Mocks locales, 1440/768/390: landing, filtros, detalle, Escape, impresión, storage bloqueado, blueprint ausente, cambio de evento, agenda clara/oscura. |
| `QA_BASE_URL=http://127.0.0.1:5173 node scripts/qa-agenda-design.mjs` desde frontend | FAIL QA-06 | Pasan pausa manual, modos de patrocinio, layouts, guardado/preservación de campos, conflicto de escritura, contraste y tres tamaños; falla movimiento reducido al finalizar. |
| `node scripts/qa-production-access.mjs` desde frontend | PASS, 8 casos | Cinco redirecciones anónimas y tres estados públicos de acceso/credencial/comprobante. Sin envío de formularios. |

Se corrigieron dos comprobaciones del instrumental de QA: selección del Foro por ID en vez de por posición y observación de animaciones WAAPI en vez de propiedades CSS. No se alteró código funcional de la aplicación.

Para suites locales: iniciar Vite desde frontend con `npm run dev -- --mode production --host 127.0.0.1`. En PowerShell, definir `$env:QA_BASE_URL='http://127.0.0.1:5173'` antes de la suite de diseñador. Las suites locales interceptan respuestas para sus escenarios; sus PASS no certifican correos o pagos de producción.

Evidencias generadas localmente (no implican capturas de producción): `frontend/test-results/participant/`, `frontend/test-results/public-visual/`, `frontend/test-results/agenda-design/`. Resultado de acceso anónimo real: `frontend/test-results/production-access/results.json`.

`scripts/load-smoke.mjs` no se ejecutó: requiere destinos definidos y genera 350 peticiones por destino; esta auditoría no establece capacidad ni umbrales de rendimiento. Tampoco sustituye una auditoría de seguridad integral.

## Datos de prueba y cambios de esta sesión

- Se conserva la campaña **QA Smoke 2026-10-01** para reproducir la atribución. Visita y apertura de prueba quedan en las métricas de producción; no son captación orgánica real. No se archivaron campañas existentes.
- En **Demo QA Hidrocarburos 01** se creó y completó la tarea **QA Smoke 2026-10-01: verificar portal**; contador de pendientes volvió a cero. No se borró historial.
- Borrador de web compartida guardado con sus mismos valores; ninguna nueva publicación.
- Favorito de plano añadido y retirado; viewport restaurado.
- Dos scripts QA ajustados y nuevo smoke anónimo. Sin commit, push, migración ni despliegue en esta auditoría. Se conserva el archivo previo ajeno `.github/workflows/checks.yml`.

## Orden de corrección y cierre

1. Resolver disponibilidad de pases y formulario de contacto antes de anunciar la web.
2. Corregir continuidad de atribución en todos los enlaces y verificar registro exitoso desde cada ruta.
3. Restringir contexto de dominio y añadir pantalla 404.
4. Respetar movimiento reducido y dejar la suite de diseñador completamente verde.
5. Conciliar fechas, precios e identidad; incorporar validaciones al checklist y estados de carga.
6. Completar E2E con correo controlado: alta, recepción, consulta, recuperación, enlace reutilizado/caducado, credencial y check-in válido/duplicado. Queda pendiente el correo de pruebas solicitado al usuario.
7. Probar roles independientes de expositor y staff, carga/descarga de comprobante QA, revisión de pago sin mover dinero, importaciones, impresión/cámara físicas y operaciones de inventario en un evento de pruebas aislado.

**Pendientes no equivalen a fallos confirmados.** La cobertura anterior permite priorizar correcciones, pero no afirmar que todos los flujos del sistema estén aprobados de extremo a extremo.
