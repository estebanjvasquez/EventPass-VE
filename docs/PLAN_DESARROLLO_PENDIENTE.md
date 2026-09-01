# Plan de desarrollo pendiente — EventPass VE

**Actualizado:** 1 de septiembre de 2026  
**Punto de partida:** funciones desplegadas en producción y código actual del repositorio.  
**Objetivo:** priorizar estabilidad operativa antes de ampliar el producto y disponer de una demo comercial estable durante la semana del 1 de septiembre de 2026.

## Principios de ejecución

1. No ampliar un módulo crítico mientras su flujo actual tenga errores bloqueantes.
2. Cada cambio de datos debe probar aislamiento entre organizaciones y entre eventos de una misma organización.
3. Una compilación correcta no sustituye una prueba real en producción.
4. Las funciones futuras no deben aparecer como disponibles en el landing.
5. Cada fase termina con build, lint, revisión de migraciones, despliegue reversible y smoke test.

## Fase 0 — Cierre de estabilización y demostración

**Prioridad:** inmediata.  
**Resultado:** recorrido comercial fluido y funciones actuales sin errores visibles.

- Completar el smoke test autenticado de la guía Word en escritorio y teléfono.
- Validar registro → comprobante → confirmación → credencial → acreditación → check-in.
- Validar portal del expositor → personal → tareas → actividades → escaneo de visitantes → CSV.
- Probar creación de foro con IA con capacidades 80, 120 y 200.
- Probar importación de plano de exposición desde PNG, JPG y PDF con ejemplos simples y complejos.
- Verificar impresora real o térmica, tamaños, márgenes y reimpresión.
- Corregir mensajes genéricos y estados de carga que aún generen dudas.
- Consolidar la guía de demo, manual de pruebas y checklist de release.

**Criterio de salida:** cero fallos críticos o altos en el recorrido de la demostración.

### Incidencias P0 detectadas en la revisión con el cliente

#### P0.1 — Correos de registro sin trazabilidad ni confirmación de entrega

**Estado:** corrección técnica desplegada y envío real aceptado por Cloudflare el 1 de septiembre de 2026. Ya existen reintento visible, respuesta comprobada del Worker y trazabilidad con identificador del proveedor. Sigue pendiente completar estados posteriores de entrega, panel operativo y pruebas multibandeja.

Trabajo requerido:

- Auditar todos los correos transaccionales: registro gratuito, instrucciones de pago, confirmación, programas, invitaciones, recordatorios, vencimientos, expositores y proveedores.
- Hacer que el frontend compruebe el código HTTP y la respuesta del Worker; no debe afirmar que el correo fue enviado cuando sólo se guardó el registro.
- Mantener el registro confirmado aunque falle el correo, pero mostrar un aviso claro y una acción **Reintentar envío**.
- Autenticar y limitar los endpoints de reenvío para evitar abuso y enumeración de registros.
- Ampliar `email_log` con destinatario normalizado, proveedor, identificador del mensaje, estado (`queued`, `delivered`, `failed`, `bounced`, `suppressed`), código de error, detalle seguro, número de intentos y fechas.
- Registrar el resultado inmediato devuelto por Cloudflare y actualizarlo posteriormente con logs/eventos de entrega cuando estén disponibles.
- Verificar dominio remitente, binding `EMAIL`, SPF, DKIM, DMARC, supresiones, cuotas y reputación.
- Crear un panel de correo por evento con búsqueda, estado, reenvío controlado y exportación.
- Añadir reintentos con backoff sólo para fallos transitorios; no reintentar direcciones inválidas, suprimidas o dominios no verificados.
- Crear pruebas con cuentas reales controladas en Gmail, Outlook y un dominio corporativo; revisar bandeja de entrada y spam.

Métricas mínimas:

- registros creados vs. notificaciones generadas;
- aceptados, en cola, entregados, fallidos, rebotados y suprimidos;
- tasa de entrega y tiempo hasta entrega;
- rebote duro y blando;
- tasa de reintento y recuperación;
- registros sin `email_log`, cuyo objetivo debe ser cero.

**Criterio de aceptación:** cada registro produce una traza auditable; el usuario conoce si el correo se envió o debe reintentarse y el equipo puede explicar cualquier fallo sin consultar datos personales fuera de su alcance.

#### P0.1B — Contenido de correo genérico y no consciente de la modalidad

**Estado:** D1 desarrollada y desplegada el 1 de septiembre de 2026. Producción selecciona plantillas diferentes para registro gratuito, pago pendiente, pago confirmado y participación aprobada; incorpora branding, fecha y sede disponibles. Los envíos controlados gratuito y con pago fueron aceptados por Cloudflare y quedaron diferenciados en `email_log`. Quedan para una iteración posterior el editor administrativo, vista previa y versionado de plantillas.

Trabajo requerido para la demo de esta semana:

- Resolver primero la modalidad efectiva del registro y seleccionar una plantilla inequívoca:
  - **gratuito:** registro confirmado, credencial y recomendaciones de acceso; nunca mencionar pago ni comprobante;
  - **con pago:** plaza reservada, importe/instrucciones configuradas, fecha límite y enlace al comprobante;
  - **pago confirmado:** pago validado, plaza confirmada y credencial;
  - **por invitación:** invitación, instrucciones para aceptar y credencial cuando corresponda;
  - **programa o charla:** nombre de la actividad, horario, lugar y credencial específica.
- Separar el concepto técnico `sendConfirmationEmail` en plantillas de negocio explícitas; una confirmación gratuita no debe reutilizar el texto de “pago verificado”.
- Usar nombre comercial, logo, colores, nombre del evento, fecha, horario, sede y contacto del organizador cuando estén configurados.
- Incorporar un cierre y llamada a la acción acordes a cada estado: **Ver credencial**, **Cargar comprobante**, **Ver agenda** o **Aceptar invitación**.
- Mantener versiones HTML y texto plano coherentes; ningún canal debe conservar frases de otra modalidad.
- Permitir en una segunda iteración que owner/admin edite asunto, introducción, instrucciones y firma por organización o evento, partiendo de plantillas seguras con variables permitidas.
- Añadir vista previa y envío de prueba antes de publicar una plantilla; no permitir variables desconocidas ni HTML inseguro.
- Registrar en `email_log` el identificador y versión de plantilla utilizados para poder explicar exactamente qué recibió el participante.

Casos mínimos de prueba:

1. evento gratuito: registro → correo sin ninguna referencia a pago → credencial válida;
2. evento con pago: registro → instrucciones y comprobante → confirmación posterior con credencial;
3. evento por invitación: mensaje de invitación sin instrucciones de pago salvo que el evento lo requiera expresamente;
4. comparación del HTML y texto plano en Gmail, Outlook y teléfono;
5. cambio de branding o datos del evento reflejado sin editar código.

**Criterio de aceptación:** cada modalidad recibe un mensaje correcto, específico y reconocible como comunicación del evento; ningún correo gratuito menciona pago, comprobante o “pago verificado”.

#### P0.2 — Liberación de asientos y eliminación segura del plano

**Estado:** flujo principal corregido y desplegado el 1 de septiembre de 2026. Ya existen acciones visibles para reservar/liberar, verificación posterior y eliminación atómica protegida contra registros activos. Sigue pendiente el saneamiento controlado de reservas históricas huérfanas y completar reasignación guiada.

Trabajo requerido:

- Mostrar para cada asiento seleccionado acciones visibles: **Reservar**, **Cambiar reserva** y **Liberar asiento**.
- Distinguir reserva manual, reserva por registro pendiente y asiento confirmado; no usar sólo el color o el doble clic como control.
- Permitir liberar directamente una reserva manual después de confirmación explícita.
- Para reservas vinculadas a un registro, abrir el registro relacionado y exigir una acción de negocio válida: reasignar, cancelar o rechazar.
- Mostrar el motivo exacto que bloquea la eliminación del plano y una lista resumida de reservas afectadas.
- Incorporar un asistente de eliminación: liberar reservas manuales, reasignar/cancelar registros y, sólo después, eliminar el plano mediante una operación atómica.
- Verificar que `delete_floor_plan` y `reset_forum_floorplan` tengan permisos equivalentes y comportamiento coherente para owner/admin, sin concesión anónima.
- Auditar y sanear asientos huérfanos sólo mediante una migración controlada, con conteo previo/posterior y respaldo.
- Añadir pruebas de persistencia: reservar manualmente → liberar → recargar; registrar → reasignar/cancelar → liberar; eliminar plano vacío y plano bloqueado.

**Criterio de aceptación:** una reserva manual se libera desde un botón visible y verificable; un plano puede eliminarse cuando no conserva obligaciones activas y nunca deja asientos, registros o elementos huérfanos.

### Plan de ejecución para la demo comercial de esta semana

El objetivo de este bloque no es terminar todo el producto, sino ofrecer al cliente una versión demostrable, coherente y sin promesas falsas. Cada entrega debe quedar desplegada y probada antes de iniciar la siguiente.

#### Entrega D1 — Comunicaciones correctas y recorrido base

**Estado de ejecución:** completada y desplegada. Worker `a1b1755d-f97b-46e3-87d6-02fb53aa83aa`.

- Corregir P0.1B para modalidades gratuita y con pago.
- Probar registro, correo, comprobante, confirmación, credencial, acreditación y check-in.
- Confirmar liberación manual y eliminación segura de un plano desechable.
- Actualizar la guía de demo con los mensajes y rutas realmente disponibles.

**Salida:** recorrido principal completo sin textos contradictorios ni errores visibles.

Evidencia D1:

- seis validaciones automáticas de contenido para gratuito, pago pendiente, pago confirmado, programa y branding;
- backend typecheck, frontend oxlint y build correctos;
- envío gratuito aceptado y trazado como `registration_confirmed`;
- envío con pago aceptado y trazado como `upload_link`, con incremento de intento sin duplicar registro;
- rutas públicas de registro, comprobante y credencial, además de acreditación y check-in, respondiendo HTTP 200;
- RPC críticas de registro, comprobante, credencial, acreditación y check-in presentes en producción;
- guías de demo y pruebas manuales actualizadas con los casos D1.

#### Entrega D2 — Reservas solicitadas por el cliente

- Crear categorías configurables para invitados especiales, patrocinantes, ponentes, protocolo y otras reservas.
- Mostrar un contador operativo de aforo: total, registros online activos, ingresos acreditados en los accesos, registrados aún sin ingreso, público disponible y cantidades reservadas por categoría.
- Calcular los cupos disponibles con la regla `aforo total − registros activos − reservas institucionales`; la asistencia acreditada se muestra como indicador presencial y no libera un cupo ya reservado.
- Aplicar colores y leyenda accesible en el editor y en la operación de asignación.
- Proteger estas reservas frente al registro público y permitir asignarlas/liberarlas con auditoría.

**Salida:** el organizador demuestra control real del aforo y de los cupos institucionales.

#### Entrega D3 — IA consciente del aforo y las reservas

- Pasar capacidad pública y reservas institucionales como restricciones estructuradas al generador.
- Validar antes de aplicar que el plano contiene el aforo solicitado más las reservas definidas, sin superar la capacidad física.
- Resaltar automáticamente los grupos reservados y mantener el resultado editable manualmente.
- Probar capacidades 80, 120 y 200, además de un caso con varias categorías de reserva.

**Salida:** la IA produce una propuesta consistente con las reglas comerciales del evento.

#### Entrega D4 — Agenda pública para demostración

- Publicar una vista con branding, actividad actual, próximas actividades, horario, escenario y ponentes.
- Mostrar patrocinador específico de una actividad con texto configurable.
- Reflejar cancelaciones y cambios de hora, título o ponente en línea.
- Preparar modo pantalla de lectura clara; el cintillo avanzado y la contingencia offline pueden quedar como siguiente incremento si ponen en riesgo la estabilidad.

**Salida:** página pública utilizable en web y demostrable en una pantalla del evento.

#### Puerta de calidad de cada entrega

- build y lint correctos;
- migración idempotente y permisos revisados;
- aislamiento probado entre dos eventos del mismo organizador y entre dos organizaciones;
- smoke en producción con datos `QA-*` recuperables;
- guía de demo actualizada;
- rollback identificado antes del despliegue;
- cero incidencias críticas o altas abiertas en el recorrido que se va a mostrar.

## Fase 1 — Pruebas automatizadas y seguridad de datos

**Prioridad:** crítica.  
**Resultado:** reducir regresiones y garantizar aislamiento multi-tenant/multi-evento.

- Crear pruebas de integración para RPC críticas:
  - registro público y por programa;
  - carga y aprobación de comprobantes;
  - búsqueda de acreditación;
  - check-in de evento, programa y sesión;
  - publicación y eliminación de planos;
  - portal del expositor y visitantes del stand.
- Crear pruebas negativas de RLS para organizaciones, eventos, empresas y usuarios sin permisos.
- Añadir pruebas E2E de los recorridos principales con datos desechables `QA-*`.
- Incorporar validación automática de migraciones y funciones faltantes antes del despliegue.
- Revisar funciones `security definer`, permisos `PUBLIC/anon/authenticated` y rutas del Worker.
- Incorporar rate limiting para registro, carga, invitaciones, escaneo e IA.
- Definir política de retención, exportación y eliminación de datos personales.

**Criterio de salida:** los flujos críticos y los casos de aislamiento se ejecutan automáticamente en CI.

## Fase 2 — Operación presencial y contingencia

**Prioridad:** alta.  
**Resultado:** operación fiable con conectividad inestable y varios dispositivos.

- Completar PWA de check-in con cola offline persistente.
- Resolver duplicados y conflictos al recuperar conexión.
- Mostrar estado de conexión, elementos pendientes y última sincronización.
- Probar dos o más dispositivos sobre el mismo punto de acceso.
- Incorporar modo kiosco y recuperación rápida de cámara.
- Añadir salidas, reingresos y reglas configurables por evento/sesión.
- Ejecutar pruebas de carga autenticadas sobre registro, check-in y directorio público.
- Documentar plan operativo de contingencia y reconciliación al final del día.

**Criterio de salida:** check-in continúa de forma controlada durante una pérdida temporal de conexión.

## Fase 3 — Analítica de visitantes y movimiento

**Prioridad:** alta después de estabilización.  
**Resultado:** convertir los escaneos en información útil para organizadores y expositores.

Esta línea de trabajo se divide en las seis fases presentadas para el control de visitantes. La numeración siguiente es interna a este módulo y no sustituye las fases generales del producto.

### Visitantes — Fase 1: captación en stands

**Estado:** desarrollada y desplegada el 31 de agosto de 2026.  
**Resultado disponible:** el personal autorizado del expositor puede escanear la credencial QR, seleccionar el stand, registrar todas las visitas —incluidas las repetidas—, consultar los datos profesionales del visitante y descargar el listado en CSV.

Métricas disponibles en el portal del expositor:

- visitantes únicos;
- visitas registradas;
- visitantes que regresaron;
- número de visitas por persona;
- primera y última visita de cada persona.

Pendiente para cerrar formalmente esta fase:

- prueba de operación continua con cámara móvil y lector USB;
- prueba de aislamiento entre organizaciones, eventos, expositores y stands;
- prueba de concurrencia con varios equipos escaneando el mismo stand;
- medición de lecturas válidas, rechazadas, duplicados inmediatos y tiempo de respuesta;
- documentar retención, acceso y exportación de los datos capturados.

### Visitantes — Fase 2: control de acceso a actividades y zonas

**Estado:** pendiente.  
**Resultado esperado:** utilizar la misma credencial para registrar entradas a foros, charlas, talleres, áreas VIP y otras zonas configurables.

- Definir puntos de lectura y su relación con evento, sesión, zona y dispositivo.
- Registrar entrada, salida y reingreso sin alterar el check-in general del evento.
- Aplicar reglas de aforo, tipo de acreditación y acceso permitido.
- Mostrar ocupación y alertas operativas en tiempo casi real.

Métricas recomendadas:

- asistentes únicos y accesos totales por actividad o zona;
- tasa de asistencia sobre inscritos;
- ocupación máxima y promedio;
- puntualidad, hora pico y duración estimada de permanencia;
- reingresos y accesos rechazados por motivo.

### Visitantes — Fase 3: panel analítico para expositores y organizadores

**Estado:** pendiente.  
**Resultado esperado:** transformar las lecturas en indicadores comparables y accionables, respetando el alcance de cada rol.

- Crear panel del expositor por stand, día y franja horaria.
- Crear panel agregado del organizador por evento, pabellón, zona y categoría.
- Incorporar filtros y exportaciones Excel/CSV/PDF.
- Permitir comparaciones entre días, stands y ediciones del evento sin revelar datos de otros expositores.

Métricas recomendadas:

- visitantes únicos, visitas totales y tasa de retorno;
- visitas por hora y hora pico;
- promedio de visitas por visitante;
- participación del stand sobre el total de visitantes del evento;
- contactos captados por cada miembro del equipo o dispositivo;
- empresas, cargos, sectores y procedencias más frecuentes;
- visitantes acreditados que no visitaron stands y visitantes activos por día.

### Visitantes — Fase 4: recorridos y mapas de calor

**Estado:** pendiente.  
**Resultado esperado:** analizar el movimiento agregado entre accesos, stands, zonas y sesiones mediante eventos de lectura ordenados en el tiempo.

- Construir recorridos anonimizados por franjas horarias.
- Generar mapas de calor sobre el plano publicado.
- Identificar zonas frías, zonas congestionadas y rutas frecuentes.
- Analizar conexiones entre exposición, stands y actividades del foro.
- Aplicar umbrales mínimos de población antes de mostrar una ruta o segmento.

Métricas recomendadas:

- afluencia por zona y franja horaria;
- tiempo estimado de permanencia por zona;
- transición entre zonas, stands y charlas;
- porcentaje de visitantes que recorren más de una zona;
- stands de primera visita, última visita y rutas más frecuentes;
- índice de concentración y distribución del tráfico;
- relación entre ubicación física y volumen de visitas.

### Visitantes — Fase 5: seguimiento comercial y consentimiento posterior

**Estado:** pendiente; el consentimiento en el momento del escaneo fue aplazado para no interrumpir la operación.  
**Resultado esperado:** facilitar el seguimiento después del evento y gestionar de forma trazable autorizaciones para usos comerciales adicionales.

- Enviar correo post-evento de agradecimiento con enlace seguro asociado al token.
- Solicitar y registrar autorización, rechazo, fecha, versión del texto y finalidad.
- Permitir al visitante revisar o retirar su autorización.
- Incorporar notas, clasificación y estado de seguimiento de cada contacto.
- Mantener separados los datos operativos del evento y los contactos habilitados para uso comercial posterior.

Métricas recomendadas:

- correos enviados, entregados, abiertos y enlaces visitados;
- tasa de autorización y rechazo;
- tiempo medio hasta responder;
- contactos autorizados por expositor;
- contactos clasificados, contactados y convertidos;
- bajas, retiros de autorización y errores de entrega.

### Visitantes — Fase 6: inteligencia del evento y mejora continua

**Estado:** pendiente.  
**Resultado esperado:** ofrecer al organizador conclusiones agregadas para mejorar diseño, agenda, operación y propuesta comercial de próximas ediciones.

- Crear comparaciones entre días y ediciones equivalentes.
- Relacionar asistencia, ubicación, agenda, categoría de participante y actividad comercial.
- Incorporar segmentos agregados y embudos configurables.
- Generar reportes ejecutivos para organizadores, expositores y patrocinantes.
- Evaluar recomendaciones asistidas por IA únicamente sobre datos agregados y autorizados.

Métricas recomendadas:

- alcance del evento: acreditados, asistentes y visitantes activos;
- profundidad de participación: stands y sesiones visitados por persona;
- conversión acreditado → asistente → visitante de stand → contacto autorizado;
- retención entre días y recurrencia entre ediciones;
- rendimiento relativo de zonas, categorías de stands y sesiones;
- correlación entre afluencia, agenda y ubicación;
- satisfacción o NPS cuando se habiliten encuestas;
- retorno reportado por expositores, sin presentarlo como ROI financiero si no existen datos verificables de ventas.

### Reglas transversales de medición

- Toda métrica debe filtrar obligatoriamente por `organization_id` y `event_id`; cuando corresponda, también por `company_id`, `element_id`, sesión y zona.
- Separar siempre **personas únicas** de **lecturas o visitas totales**.
- Definir la ventana que descarta una lectura accidental consecutiva, sin eliminar retornos reales.
- Guardar zona horaria del evento y conservar marcas de tiempo auditables.
- Mostrar el período, filtros y última actualización utilizados para calcular cada indicador.
- No inferir permanencia o recorridos exactos si sólo existen lecturas puntuales; identificarlos como estimaciones.
- No comparar eventos con duración, capacidad o configuración diferentes sin normalizar los indicadores.
- Aplicar anonimización, retención limitada y umbrales mínimos a mapas y recorridos agregados.
- Incorporar indicadores de calidad: porcentaje de credenciales ilegibles, lecturas rechazadas, dispositivos sin sincronizar y puntos de lectura inactivos.

**Criterio de salida:** analítica verificable sin mezclar eventos ni exponer recorridos individuales fuera del alcance autorizado.

## Fase 4 — Editor profesional de planos

**Prioridad:** media-alta.  
**Resultado:** planos complejos editables con precisión y buen rendimiento.

- Mejorar detección IA de blueprints: calibración, rotación, escala y correlación visual.
- Incorporar revisión asistida: aceptar, corregir o descartar detecciones individualmente.
- Añadir capas editables, visibilidad, bloqueo, orden y niveles.
- Completar alineación, distribución, duplicación, copy/paste y edición masiva.
- Añadir reglas, cotas métricas, minimapa y viewport inicial público.
- Completar geometría para polígonos, rotación e intersecciones no rectangulares.
- Añadir importador DXF normalizado y evaluación de SVG/CAD.
- Optimizar el editor para al menos 500 stands sin degradación perceptible.
- Mejorar ajuste automático de asientos al eliminar filas, pasillos o accesos.
- Añadir validaciones de circulación, salidas, aforo y accesibilidad.

### Reservas institucionales de asientos

**Solicitud del cliente:** separar parte del aforo para invitados especiales, patrocinantes y otras categorías antes de abrir o completar el registro general.

- Crear categorías configurables de reserva, por ejemplo: invitados especiales, patrocinantes, protocolo, ponentes, prensa, producción y contingencia.
- Definir por categoría nombre, código, color, cantidad, prioridad, responsable, notas y vigencia de la reserva.
- Permitir reservar por cantidad antes de asignar nombres y posteriormente convertir cada cupo en asiento nominal.
- Permitir reserva masiva por fila, bloque o selección múltiple y liberación parcial o total.
- Mantener la ecuación: `aforo físico = disponibles + reservas institucionales + registros/asignaciones confirmadas + bloqueados`.
- Impedir publicar o aplicar una propuesta que exceda el aforo físico o deje reservas sin asiento.
- Mostrar un resumen de aforo: capacidad total, disponible al público, reservado por categoría, registros online activos, ingresos acreditados en accesos, registrados aún sin ingreso, confirmado y bloqueado.
- Registrar auditoría de creación, cambio de categoría, asignación, liberación y responsable.
- Resaltar categorías mediante una paleta accesible, leyenda visible, texto/icono además del color y variantes aptas para impresión.

### Generación de foros con IA consciente de aforo y reservas

**Solicitud del cliente:** la IA debe diseñar el plano considerando simultáneamente capacidad pública y reservas institucionales.

- Añadir al contrato de entrada de IA: aforo total solicitado, cantidad pública, reservas por categoría, escenario, pasillos, accesos y restricciones.
- Interpretar instrucciones como “foro para 500 personas, 40 invitados, 20 patrocinantes y 10 puestos de protocolo”.
- Validar matemáticamente la propuesta antes de dibujarla: número de asientos, reservas, bloqueados, pasillos y capacidad útil.
- Distribuir reservas por zonas configurables: primeras filas, laterales, centro, accesibilidad u otra regla indicada.
- Devolver una propuesta editable con colores, leyenda, conteos por categoría y diferencias frente a lo solicitado.
- Impedir **Aplicar** si faltan asientos, existen solapamientos o los conteos no coinciden.
- Al modificar manualmente filas o pasillos, recalcular posiciones sin perder categoría, nombre ni vínculo; si no es posible, bloquear el cambio y explicar las reservas afectadas.
- Añadir casos automáticos de 80, 120, 200, 500 y 1.000 asientos con varias combinaciones de reservas.

**Criterio de aceptación adicional:** la suma visual y persistida coincide con el aforo y las reservas solicitadas; cada categoría puede localizarse, reasignarse y auditarse sin depender exclusivamente del color.

**Criterio de salida:** un blueprint real puede convertirse, corregirse y publicarse sin reconstrucción manual completa.

## Fase 5 — Comercial, patrocinantes y autoservicio

**Prioridad:** media.  
**Resultado:** seguimiento comercial completo por evento.

La comercialización de la versión actualmente disponible para el primer evento gremial se estima en el documento [Plan comercial — Evento gremial con exposición](PLAN_COMERCIAL_EVENTO_ASOCIACION.md). Ese documento separa licencia, capacidad, soporte, puntos de acreditación, equipos y consumibles para evitar comprometer costos operativos todavía desconocidos.

- Completar edición, suspensión y eliminación controlada de patrocinantes.
- Añadir contactos múltiples y bitácora comercial por empresa.
- Completar cuotas, facturas, vencimientos y conciliación de pagos.
- Incorporar inventario de beneficios y alertas de entregables pendientes.
- Crear portal equivalente para patrocinantes con activos, aprobaciones y reportes.
- Añadir documentos versionados y notificaciones por tarea/actividad.
- Incorporar reserva/venta de stands y estados comerciales configurables.
- Evaluar pagos en línea sin sustituir el flujo venezolano de transferencia manual.

**Criterio de salida:** el organizador conoce contrato, pagos y compromisos de cada aliado desde una sola vista.

## Fase 6 — Reportes, comunicaciones y experiencia del participante

**Prioridad:** media.  
**Resultado:** mejor seguimiento antes, durante y después del evento.

- Dashboard de conversión: iniciado, comprobante recibido, confirmado y asistió.
- Reportes de ingresos, métodos de pago y tiempos de confirmación.
- Historial de correos, estado de entrega y reenvío controlado.
- Plantillas de correo por organización y evento.
- Correos post-evento: agradecimiento, encuesta, certificados y consentimiento posterior.
- Centro del participante con agenda personal, favoritos y credenciales.
- Exportación Excel/PDF y programación de reportes.
- Auditoría visible de acciones administrativas sensibles.

### Agenda pública interactiva y modo pantallas

**Estado actual:** existe una agenda pública básica con sesiones, horarios, ponentes y favoritos locales; no tiene todavía modo de señalización, branding configurable, patrocinantes públicos ni actualización en vivo.

**Solicitud del cliente:** publicar el horario en web y en pantallas gigantes, con identidad del evento, patrocinadores y cambios operativos visibles sin recargar manualmente.

- Mantener dos modos sobre la misma fuente de verdad:
  - **Agenda interactiva:** móvil/escritorio, filtros por día, escenario y tipo; detalle, favoritos y enlace compartible.
  - **Modo pantalla:** tipografía de alta legibilidad, pantalla completa, operación sin interacción, rotación automática y protección contra suspensión del dispositivo.
- Crear configuración por evento: logo, colores, tipografías aprobadas, fondo, encabezado, reloj, zona horaria, idioma, columnas, cantidad de actividades visibles y duración de rotación.
- Permitir activar/desactivar secciones: actividad actual, siguientes actividades, ponentes, escenario, patrocinador de la actividad, anuncios y cintillo inferior.
- Crear un cintillo animado configurable con logos/nombres de patrocinantes, velocidad, orden, separación y pausa; respetar `prefers-reduced-motion` y ofrecer modo estático.
- Publicar el patrocinio específico ya asociado a cada actividad con textos configurables, por ejemplo: **Coffee break patrocinado por Café Madrid**.
- Incluir patrocinantes generales, de escenario y de actividad sin mezclar contratos ni mostrar empresas no aprobadas.
- Actualizar en línea mediante Supabase Realtime o un canal equivalente de publicación: cancelación, retraso, cambio de hora, escenario, ponente, moderador, título y patrocinante.
- Definir estados públicos: programada, próxima, en curso, retrasada, reprogramada, cancelada y finalizada; cada cambio debe conservar historial.
- Mostrar un indicador de última actualización y reconectar automáticamente si se pierde la conexión.
- Mantener en caché la última agenda válida para que una pantalla no quede en blanco durante una interrupción temporal; indicar cuando la información esté desactualizada.
- Crear URL y QR por evento, día, escenario y modo pantalla; permitir un token de visualización revocable si se requiere contenido no totalmente público.
- Añadir vista previa administrativa en resoluciones 16:9, 4K, vertical y móvil antes de publicar.
- Verificar contraste, tamaño de texto a distancia, zonas seguras de pantalla, rendimiento continuo y ausencia de burn-in en elementos fijos.

Métricas recomendadas:

- pantallas conectadas y última señal recibida;
- tiempo desde un cambio administrativo hasta su visualización;
- reconexiones, tiempo fuera de línea y uso de caché;
- aperturas de agenda, sesiones vistas y favoritos guardados;
- impresiones agregadas por patrocinante y actividad, claramente identificadas como exposición en pantalla, no como personas únicas;
- actividades retrasadas, reprogramadas o canceladas y tiempo de comunicación al público.

**Criterio de aceptación:** un cambio autorizado se refleja en todas las agendas y pantallas conectadas en un objetivo inicial menor a cinco segundos; una pantalla sin red conserva la última programación válida y señala su estado sin mostrar información contradictoria.

**Criterio de salida:** organizador y participante reciben información consistente durante todo el ciclo.

## Fase 7 — Plataforma SaaS, observabilidad y continuidad

**Prioridad:** transversal.  
**Resultado:** operación mantenible y escalable.

- Definir ambiente de staging separado de producción.
- Automatizar despliegue y rollback del Worker, frontend y migraciones.
- Incorporar monitoreo de errores, trazas, métricas y alertas.
- Añadir backups verificados y simulacro periódico de restauración.
- Completar RBAC por departamento, evento, zona y operación.
- Revisar planes, límites, suscripciones, facturación y ciclo de clientes.
- Completar dominio personalizado y diagnóstico de aprovisionamiento.
- Auditoría de accesibilidad WCAG 2.1 AA y rendimiento móvil.
- Consolidar documentación vigente y archivar propuestas antiguas que contradicen la arquitectura actual.
- Crear manuales de administración, operación, soporte y recuperación.

**Criterio de salida:** una versión puede desplegarse, observarse y revertirse con evidencia y sin pasos improvisados.

## Orden recomendado

### Orden inmediato derivado de la revisión del cliente

1. Corregir las plantillas según modalidad y eliminar toda referencia indebida a pago en eventos gratuitos.
2. Cerrar la verificación multibandeja y los estados posteriores de entrega del correo.
3. Completar el saneamiento pendiente de reservas históricas después de respaldar y contabilizar los datos.
4. Implementar categorías de reservas institucionales y resumen de aforo.
5. Extender la generación IA para respetar aforo y reservas, con validación previa a aplicar.
6. Construir el MVP de agenda pública con branding, patrocinio por actividad y actualización en vivo.
7. Añadir modo pantalla, cintillo de patrocinantes, caché de contingencia y observabilidad de dispositivos.

Los flujos principales de trazabilidad/reintento de correo y liberación/eliminación segura del plano ya están desplegados; permanecen en Fase 0 hasta completar sus criterios de aceptación y pruebas de regresión.

| Orden | Fase | Motivo |
| --- | --- | --- |
| 1 | Fase 0 | Protege la demostración y la operación inmediata. |
| 2 | Fase 1 | Evita repetir regresiones de datos y permisos. |
| 3 | Fase 2 | Reduce el principal riesgo del día del evento. |
| 4 | Fase 3 | Aprovecha la infraestructura de QR ya desplegada. |
| 5 | Fase 4 | Eleva la calidad de planos e IA después de estabilizar. |
| 6 | Fases 5 y 6 | Amplían valor comercial y comunicaciones. |
| 7 | Fase 7 | Se ejecuta transversalmente y se completa antes de escalar. |

## Registro de ejecución por fase

Para iniciar cualquier fase se debe crear una lista verificable con:

- alcance incluido y excluido;
- migraciones y datos afectados;
- riesgos de aislamiento y privacidad;
- casos de prueba manuales y automáticos;
- responsable y fecha objetivo;
- evidencia de build, lint, despliegue y smoke test;
- procedimiento de rollback.
