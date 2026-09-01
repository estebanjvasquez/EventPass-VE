# Handoff de trabajo — EventPass VE

## Validación funcional — 20 de agosto de 2026

- Se actualizó el backlog de Notion: agenda, check-in, participantes,
  registro y comercial de exposición quedan **En progreso**. Se añadió la
  tarea "Validar y estabilizar flujo integral del organizador" con los
  hallazgos de esta prueba.
- Con la cuenta administrativa de QA se comprobó el acceso y la carga de
  Eventos, Programas, Agenda, Asientos, Plano, Acreditación, Check-in,
  Suscripción y Superadmin. No hubo errores de consola ni respuestas HTTP
  fallidas durante el recorrido autenticado.
- Se creó el evento de prueba `QA Flujo Organizador 2026-08-20` en borrador,
  correctamente y sin errores.
- Fricciones confirmadas:
  1. Crear un evento no guía al organizador al siguiente paso aplicable
     (programa, agenda, plano o publicación).
  2. La pantalla Eventos contiene dos acciones llamadas "Guardar" (evento y
     subdominio), una ambigüedad para personas, accesibilidad y pruebas.
  3. Check-in expone primero el fallo de cámara; el acceso manual debe ser
     visible y explicarse como alternativa operativa inmediata.
- Siguiente bloque: configurar el evento QA, validar plano/agenda, publicar
  y recorrer el registro público y la operación sin tocar eventos existentes.

## Continuación de pruebas QA — 20 de agosto de 2026

- Se creó correctamente el plano del evento QA. La primera creación entrega
  una cuadrícula de 18 × 12 con escenario y controles de tamaño, sillas,
  pasillos y accesos; no registró errores de consola ni de red.
- La Agenda QA inicia con instrucciones claras para crear el primer escenario
  y expone el formulario `Nuevo escenario` con nombre obligatorio, URL de
  transmisión y restricción de vídeo.
- **Bloqueo funcional reproducible:** al repetir el flujo de crear escenario
  desde una sesión limpia, el formulario se muestra pero su campo de nombre
  no queda disponible para interacción y la prueba expira. No se publicó el
  evento QA ni se continuó al registro público para no validar una
  configuración parcial como si estuviera operativa.
- Fricción adicional: la configuración de plano y agenda sólo se alcanza
  desde acciones pequeñas dentro de la fila del evento; no existe una
  secuencia guiada ni estado de preparación que indique qué falta antes de
  publicar.

## Siguiente corrección antes de reanudar QA

1. Diagnosticar el modal/formulario de `Añadir escenario` en `AgendaAdmin`:
   foco, montaje, selectores, estado de carga y posible cierre o renderizado
   transitorio.
2. Añadir un flujo posterior a creación de evento: `Configurar agenda`,
   `Diseñar plano` y `Publicar` con indicadores de estado.
3. Reanudar desde el escenario QA, crear sesión, publicar y probar registro
   público, acreditación y check-in manual.

## Corrección en curso — 20 de agosto de 2026

- `AgendaAdmin`: el modal de escenario ahora usa semántica de diálogo,
  etiquetas asociadas a sus campos y foco explícito al abrir. Esto evita que
  el campo Nombre dependa de `autoFocus` durante el montaje asíncrono.
- `EventosAdmin`: los eventos en borrador muestran una tarjeta de siguientes
  pasos con accesos directos a Agenda/Plano/Asientos y una publicación
  explícitamente condicionada a que el evento esté listo.
- Verificación de código: `npm run lint` y `npm run build` pasan.
- Pendiente: desplegar o iniciar entorno local y repetir la creación de
  escenario QA antes de continuar publicación y registro público.

## Repetición QA y siguientes correcciones — 20 de agosto de 2026

- La repetición local pasó: `Nuevo escenario` abre con el foco en
  `stage-name`, el nombre acepta texto y no hubo errores de consola.
- Se renombraron las acciones ambiguas a `Guardar evento` y `Guardar
  subdominio`.
- Check-in informa que la cámara no es necesaria y enlaza directamente al
  ingreso manual, ahora destacado como alternativa operativa.
- `npm run lint` y `npm run build` pasan después de estos cambios.

## Bloque 2 — Búsqueda e incidencias de Check-in

- `CheckinReportAdmin` ahora permite buscar por nombre o correo y filtrar
  ingresados/pendientes.
- Se puede registrar una incidencia por participante con categoría y notas,
  listar incidencias abiertas y resolverlas.
- Se conserva el ingreso manual y la exportación CSV existentes.
- La implementación usa `checkin_incidents` creada en la migración
  `20260820160000_checkin_incidents_and_badge_print_audit.sql`.
- Verificación: `npm run lint` y `npm run build` pasan.

## Bloque 3 — Auditoría de impresión

- `AcreditacionEvento` consulta el historial de `badge_print_logs` antes de
  imprimir.
- La primera impresión se registra como `initial`; las siguientes como
  `reprint` y exigen un motivo.
- Se guardan evento, registro, organización, dispositivo y operador mediante
  las políticas de Supabase.
- La impresión del navegador sólo se abre después de persistir el registro.
- Verificación: `npm run lint` y `npm run build` pasan. El aviso de formato
  restante pertenece a este archivo local y no se incluye en el commit.

## Cierre de jornada — 20 de agosto de 2026

- Commit y despliegue: `2b01b23`, preview `https://33ca4632.eventpass-d7d.pages.dev`.
- Se comprobó que el preview responde HTTP 200 y contiene los módulos lazy de
  incidencias y acreditación.
- La auditoría de impresión es actualmente silenciosa para el operador:
  registra `initial` o `reprint` en `badge_print_logs`; aún falta una pantalla
  histórica para consultar impresiones y reimpresiones.

## Siguientes pasos para mañana

1. Crear la pantalla de equipo operativo: miembro, evento, punto de acceso y
   permisos `checkin.perform`, `badges.print` y `participants.manage`.
2. Hacer que Check-in valide esos alcances y diferencie claramente denegado,
   duplicado, reingreso y salida.
3. Añadir historial visible de impresiones, filtros y prueba con impresora
   térmica real.
4. Diseñar la PWA/offline: cache de credenciales autorizadas, cola local,
   sincronización y conflictos.
5. Ejecutar QA presencial con cámara, ingreso manual, dos dispositivos,
   conectividad intermitente, impresora y reimpresión.

**Última actualización:** 2026-08-18
**Estado general:** producción activa; editor de exposición en desarrollo y con
mejoras publicadas. No continuar cambios funcionales sin resolver el bloqueo de
carga del evento de prueba.

## Resumen de la jornada

- Se normalizó el editor de exposición basado en `@dnd-kit/react`: canvas con
  cuadrícula, paleta de elementos, historial deshacer/rehacer y guardado
  automático hacia `venue_map_elements`.
- Se incorporaron stands, pasillos, puertas, accesos, verificadores, columnas,
  plantas, lobby, información, espacios libres y áreas especiales.
- Se corrigió la creación de plantillas para enviar `metadata` obligatorio en
  los stands y se añadió recuperación ante inserciones parciales de mapas.
- Se corrigió la carga cuando hay varios `venue_maps` por evento: Diseño,
  Expositores y Operación seleccionan el plano más reciente de forma
  determinista.
- Se implementó el manejo estructural de pasillos: moverlos reordena el
  contenido afectado; los tiradores permiten ampliar/reducir; ampliar stands
  disponibles permite unificarlos.
- Última mejora publicada: elegir **Pasillo** y hacer clic sobre un stand abre
  una fila o columna completa, desplazando el contenido posterior. Se evita
  colocar objetos ordinarios en celdas ocupadas.
- Se instaló y usó Playwright para validaciones de navegación autenticada.
  Las pruebas que modificaban el plano interceptaron las escrituras para no
  cambiar datos reales.

## Commits y despliegues relevantes

- `2e978fe` — entrega inicial del editor de plano validado.
- `1f0f6a0` — metadatos para stands generados.
- `219af35` — recuperación de creación de plantillas.
- `b8bf182` — selección del plano más reciente.
- `4587e9b` — pasillos estructurales editables.
- `e1e6535` — inserción predecible de pasillos.

Último despliegue principal: `https://3f9506c6.eventpass-d7d.pages.dev`.
Dominio público: `https://eventosfacil.net`.

## Validaciones completadas

- `frontend`: `npm run build` y `npm run lint` pasan.
- `git diff --check` pasa antes de los commits.
- Playwright confirmó anteriormente la carga autenticada del diseñador, el
  pasillo central, los tiradores de ampliación y el arrastre con persistencia
  simulada.
- Las vistas previas de Cloudflare no pueden leer los eventos de la
  organización con la sesión de prueba; no usar esos subdominios como prueba
  funcional autenticada de datos.

## Bloqueos y fricciones abiertas

1. **Crítico:** el evento de exposición usado en las pruebas dejó de cargar con
   la cuenta de prueba. La UI muestra solamente `No se pudo cargar el evento`.
   Diagnosticar la consulta a `events`, la sesión y las políticas RLS antes de
   seguir modificando el editor. Exponer el mensaje real de Supabase de forma
   segura para facilitar soporte.
2. La creación de eventos en `/admin/eventos` requiere esperar a que el panel
   termine de montar; el formulario se percibe inestable y no guía al usuario
   hacia el diseñador de exposición al guardar. Revisar el flujo de onboarding
   del organizador.
3. Validar manualmente en el dominio principal la última interacción de
   inserción de pasillo (paleta → clic sobre stand) una vez resuelto el acceso
   al evento.
4. Revisar cruces entre pasillos horizontal y vertical: deben representar una
   intersección visual controlada, no dos elementos ambiguamente superpuestos.
5. Mantener `.claude/` fuera de commits; es contenido local no rastreado.

## Próximo bloque recomendado

1. Con sesión autenticada, inspeccionar el error de `events` para el evento de
   prueba y corregir la causa (RLS, organización activa, evento eliminado o
   consulta).
2. Añadir un estado de carga y un error accionable en `StandsAdmin` para que el
   organizador no reciba un mensaje genérico.
3. Revalidar la creación de evento tipo **Exposición**, abrir su plano y probar
   en navegador: plano vacío, plantilla, insertar pasillo vertical/horizontal,
   moverlo, ampliar/reducir y deshacer/rehacer.
4. Solo después, continuar con la simplificación visual de intersecciones y
   herramientas de flujo de personas.

## Verificación al retomar

```powershell
git status --short
Get-Content task.md
cd frontend
npm run build
npm run lint
```

## Cierre de jornada — 21 de agosto de 2026

- Se incorporó la creación de empresas patrocinantes directamente desde la ventana **Patrocinantes del evento**. El registro se guarda con `kind = 'sponsor'`, solicita contacto opcional y queda seleccionado para asignarlo inmediatamente.
- Se verificó el flujo de moderadores, ponentes y patrocinantes por actividad, incluyendo charlas, talleres y recesos.
- Migración aplicada en Supabase: `session_sponsorships`.
- Commit y despliegue: `9680ad6`; GitHub Actions terminó correctamente y producción respondió HTTP 200.

## Siguientes pasos para retomar

1. Validar en navegador la creación de una empresa patrocinante y su asignación a un evento.
2. Validar la selección de varios patrocinantes en una charla, taller y coffee break.
3. Confirmar que los moderadores creados como perfil independiente aparecen sólo en el selector de moderadores.
4. Añadir edición y eliminación de empresas patrocinantes, además de datos de contacto completos, si el QA lo requiere.
5. Revisar el bloqueo pendiente del evento de exposición de pruebas y continuar QA autenticado del plano.

## Responsive y smoke test — 22 de agosto de 2026

- Se añadió un menú administrativo móvil común, visible en las rutas `/admin/*` y `/superadmin`, con navegación accesible desde teléfonos y tabletas.
- El panel principal oculta su navegación horizontal de escritorio en móvil; el menú compacto conserva Registros, Eventos, Acreditación, Check-in, Equipo, Patrocinantes y Suscripción.
- Se ajustaron tablas administrativas para permitir desplazamiento horizontal controlado y se evitó el overflow global de la página en viewport pequeño.
- Se adaptaron los controles de pasillos y accesos del plano para que sus campos no se compriman en teléfonos.
- `npm run build`, `npm run lint` y `git diff --check` pasan.
- Smoke test Playwright en viewport 390 × 844: login, apertura del menú, navegación a Patrocinantes, creación de `QA Sponsor Responsive 2026-08-22`, asignación al evento y persistencia tras recargar; sin overflow horizontal.
- El cambio aún no está commiteado ni desplegado. Queda pendiente validar el mismo flujo en el dominio público después del despliegue.

## Administración comercial de patrocinantes — 24 de agosto de 2026

- Investigación comparativa: los sistemas maduros separan paquetes, acuerdos por evento, pagos, inventario de beneficios, activaciones, entregables, activos de marca y reporte de cumplimiento. Se tomó como referencia el enfoque de Cvent/Bizzabo/Eventee/TierBook.
- Se creó la ruta global `/admin/patrocinantes`; el botón del menú deja de llevar a la lista de eventos.
- La nueva pantalla administra empresas patrocinantes, acuerdos por evento, paquete, estado comercial, monto acordado, adicionales, estado de pago, notas de cuotas, publicidad aportada, requisitos de impresión y cumplimiento.
- Los paquetes ahora se pueden crear, editar, desactivar y documentar con precio, moneda, inventario y beneficios por línea.
- Se añadieron acciones para registrar pagos parciales, añadir entregables y saltar a las actividades del evento.
- Migración `20260824120000_sponsor_commercial_management.sql` aplicada en Supabase; se verificaron las tablas, columnas nuevas y RLS activo.
- Smoke test local completada en desktop y móvil: crear/editar paquete, crear empresa patrocinante, crear acuerdo, registrar pago parcial y añadir entregable de impresión; sin alertas ni overflow horizontal.
- Siguiente paso: commitear y desplegar el módulo; después repetir la prueba contra producción.

## Expositores y portal comercial — 24 de agosto de 2026

- Se añadió un acceso directo **Expositores** para eventos de tipo exposición desde la tabla y el flujo de creación; ya no es necesario entrar primero al plano.
- El selector de empresas del editor moderno del plano consulta únicamente compañías con `kind = 'exhibitor'`.
- El módulo `/admin/expositores/:eventId` permite crear empresas, asignar sus stands y cargar/descargar el manual privado del expositor en PDF (bucket existente `agenda-attachments`, máximo 10 MB).
- Referencias funcionales revisadas: portales de Swapcard y Cvent con perfil de empresa, personal, tareas, documentos, paquetes, pagos y visibilidad del avance.
- Pendiente siguiente fase: portal autenticado de expositor/patrocinante con invitaciones, datos y personal, pagos/recibos, tareas y documentos; requiere tablas y políticas RLS específicas y una ruta pública de portal con la imagen del evento.

## Portal de expositores — implementación iniciada y lista para despliegue

- Se añadió la migración `20260824150000_exhibitor_portal.sql` con membresías por evento/empresa, tareas, documentos, pagos y políticas RLS; también incluye acceso privado al bucket de adjuntos para usuarios del portal.
- Se añadió `/portal/expositor/:eventId`, con branding del evento, manual, tareas, personal vinculado, registro de pagos y carga de comprobantes.
- El administrador puede invitar personal desde Expositores mediante `POST /api/exhibitor-portal/invite`; el Worker valida organización/evento/empresa antes de enviar la invitación.
- Antes de probar producción hay que ejecutar la migración en Supabase SQL Editor. El despliegue de frontend/backend no sustituye esa aplicación manual.

## Plan actualizado — 28 de agosto de 2026

La prioridad ya no es ampliar módulos sin validación: los commits recientes
completan el flujo P0 de registro/acreditación y el bloque P1 de acreditación,
pero falta demostrar la operación integral sobre producción con datos de QA.

1. **QA integral (en curso):** ejecutar `docs/GUIA_PRUEBAS_MANUALES.md` con
   tenant y datos `QA-*`; registrar cada caso como Pasa/Falla/No aplica y
   priorizar los bloqueantes.
2. **Estabilización:** corregir primero cualquier fallo de aislamiento RLS,
   carga de evento/plano, registro-pago-credencial, permisos operativos o
   check-in. Repetir los casos afectados después de cada corrección.
3. **Ensayo presencial:** probar permisos por evento/punto, dos dispositivos,
   cámara, ingreso manual, impresora térmica y conectividad intermitente. La
   PWA/offline con cola y conflictos sigue pendiente y no debe prometerse.
4. **Cierre técnico:** incorporar automatización para RPC/RLS y flujos
   críticos; documentar migraciones aplicadas, versión de Worker, despliegue
   reversible y smoke test en el dominio de producción.
5. **Posterior al release operativo:** RBAC departamental de plataforma,
   alcances completos por evento/zona, mejoras del plano comercial y limpieza
   de documentación heredada.

**Bloqueador inmediato:** la conexión de Chrome para smoke test no se pudo
inicializar el 28 de agosto; reintentar tras reiniciar Codex y Chrome con la
extensión activa. Mientras tanto, la guía permite ejecutar QA manual desde los
dispositivos autorizados.
