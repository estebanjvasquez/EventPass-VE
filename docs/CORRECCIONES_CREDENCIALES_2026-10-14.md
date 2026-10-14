# Correcciones de registro e impresión de credenciales

Los 17 hallazgos de la revisión del 14 de octubre se corrigieron en código. La versión del conector para Windows es **0.3.0**. El resultado de producción se debe probar con ese conector actualizado, el controlador instalado y el tamaño de papel correcto.

| Hallazgo | Corrección | Comprobación |
|---|---|---|
| F01 | Políticas con referencias explícitas a la fila y organización del evento; publicación de versiones reservada a owner/admin. | Inserciones ajenas rechazadas y propias permitidas bajo RLS. |
| F02 | Confirmación, walk-in, identidad, cancelación y atención comprueban `badges.print` y el evento del registro. | Todas las mutaciones niegan usuarios sin alcance; programas requieren órdenes confirmadas. |
| F03 | Reintentos conservan lote, secuencia, modalidad, perfil y diseño. El resumen cuenta el último intento de cada credencial. | Lote recuperado termina completado y no registra check-in. |
| F04 | Bloqueo por persona e índices únicos parciales para un único trabajo pendiente. | Segundo trabajo pendiente rechazado. |
| F05 | Reserva del `cloudJobId` durante creación del PDF; contenido diferente con la misma clave se rechaza. | Envíos HTTP simultáneos producen un solo trabajo. |
| F06 | Se confirma la cancelación local antes de cambiar la nube; errores visibles. Se exige la estación original. | Rechazo de Windows deja intacto el estado de la nube. |
| F07 | RPC de impresión comprobados y recuperación por `cloudJobId` si el envío o guardado quedan inciertos. | Error RPC no muestra impresión exitosa. |
| F08 | Render del diálogo del sistema dentro de `try/catch/finally`; fallo auditado y bloqueo liberado. | Error de render deja interfaz utilizable y trabajo fallido. |
| F09 | Transiciones explícitas, estados terminales protegidos y confirmaciones de transporte idempotentes. | `queued → delivered` y reapertura de entregada rechazadas. |
| F10 | QR de reimpresión provisional hasta que Windows acepta el trabajo; fallo previo conserva el anterior. | Prueba de fallo y activación posterior del QR de reemplazo. |
| F11 | Reconciliación paginada independiente de la tabla, por identificador de estación; conector confirma en segundo plano. Cola visible paginada y botón para enviar trabajos preparados que quedaron sin enviar. | 125 pendientes reconciliados en navegador y 30 trabajos HTTP/PDF sincronizados sin confirmación del navegador. |
| F12 | Timeout o pérdida de conexión conservan estado pendiente; no habilitan reenvío ni entrega prematura. | Envío incierto recuperado por clave y espera vencida conserva estado. |
| F13 | Búsqueda de QR específica del evento, incluyendo asistencia del evento correcto. | Token ajeno no devuelve participante. |
| F14 | Prueba del diseñador disponible con datos de demostración sin seleccionar participante. | Handler con `selected=null` envía prueba sin auditoría. |
| F15 | Historial y trabajo pendiente se recargan al imprimir y periódicamente mientras se atiende; entrega idempotente. | Flujo con actualización de auditoría y protección contra respuesta antigua. |
| F16 | Sesión de atención y entrega/fallo se guardan en la misma transacción, también desde kiosco. | Entrega genera exactamente una sesión y no cuenta dos veces. |
| F17 | Tildes corregidas y descarga identificada como 0.3.0. | Texto UTF-8 y ZIP del build. |

La sincronización usa una credencial específica del evento y estación, expira en ocho horas y solo puede informar transporte. No puede consultar participantes, preparar trabajos, confirmar pagos ni marcar entrega. Se almacena su hash en un esquema privado sin acceso de clientes; el conector conserva la credencial limitada en el perfil local de Windows. Las llamadas de la aplicación al conector se restringen a loopback. El conector solo acepta el proyecto Supabase de esta aplicación como destino de sincronización. Los trabajos pendientes y las confirmaciones sin enviar sobreviven a la retención de los últimos 500 finalizados; el archivo se escribe de forma serializada y atómica.

**Verificaciones automatizadas.** `npm test` en `infra` cubre las pruebas existentes de registro, recuperación, inventario y campañas, junto con 10 grupos de regresiones de credenciales. `npm run test:badges` en `frontend` cubre errores de render/RPC/cancelación, prueba del diseñador, timeout, envíos ambiguos, paginación y restricción de credenciales a loopback. `npm run typecheck` y `npm test` en `print-bridge` comprueban contrato HTTP, idempotencia y sincronización completa con PDF real y transporte físico simulado. Compilación y lint se ejecutan antes de publicar; permanece una advertencia anterior en `PlanoComercialAdmin.tsx`, fuera de este módulo. El workflow de regresiones quedó preparado localmente: la credencial de GitHub disponible rechazó publicar cambios de workflows por carecer de ese permiso. Los scripts de pruebas sí se publican en el repositorio.

**Despliegue de base de datos.** La migración es `20261014110132_badge_workflow_integrity.sql`, generada por el CLI. El historial remoto anterior contiene versiones ausentes en el repositorio, por lo que el despliegue aplica exclusivamente este SQL y registra esta versión dentro de una transacción. No se repara ni se reaplica el historial previo. Los cambios incluyen funciones con parámetros finales opcionales para conservar las llamadas de los clientes existentes durante el despliegue; la aplicación actual confirma entrega directamente a través del trabajo.

**Siguientes pasos para probar en producción.**

1. En cada ordenador de impresión, espera a que termine la cola y detén el conector anterior. Descarga el ZIP desde **Centro de impresión → Descargar conector para Windows**, extrae en una carpeta permanente y ejecuta `instalar-windows.ps1`. Mantén Node.js LTS y el controlador de la impresora instalados. El instalador conserva el código y registra inicio automático oculto.
2. Introduce el código, pulsa **Probar conexión** y verifica **Bridge 0.3.0**, impresora correcta y ausencia de impresoras offline. Si el navegador solicita acceso a la red local, autorízalo para esta aplicación.
3. En **Badge Designer**, carga el diseño publicado y usa **Prueba sin auditoría**. Comprueba ancho/alto con una regla, orientación, márgenes y ambas caras. Selecciona el tamaño de papel correcto en Windows; el PDF se envía sin escalado automático.
4. Con un participante destinado a QA, registra un walk-in, corrige sus datos y comprueba que un pendiente de pago no se imprime antes de confirmarlo. Imprime, verifica físicamente la credencial y marca entrega. El historial y métricas deben mostrar una sola entrega. Repite la entrega desde el kiosco.
5. Reimprime indicando motivo. El QR anterior debe seguir válido si el render o envío falla; el nuevo se activa cuando Windows acepta el trabajo. Comprueba que el QR anterior queda invalidado tras la aceptación del reemplazo.
6. Prepara un lote de **más de 20** credenciales de QA. Espera su aceptación, cierra la página y vuelve a abrirla: todos los enviados deben actualizarse. Los trabajos que quedaron preparados pero sin enviar se continúan desde **Enviar pendiente**. Ninguna preimpresión debe crear check-in.
7. Provoca un fallo controlado con la impresora de QA y reintenta desde su estación. El lote debe conservar su modalidad y secuencia. Comprueba que una cancelación rechazada no aparece como exitosa y que un timeout no crea un segundo trabajo.
8. Repite con una segunda estación y un usuario sin permiso de impresión. Confirma separación de colas, denegación de cambios fuera del evento y actualización de métricas. Vuelve a abrir el Centro de impresión para renovar la autorización si pasan ocho horas.

Estas pruebas físicas y de instalación en un Windows limpio requieren el equipo y controlador reales. La verificación automatizada usa transporte simulado y no acredita por sí sola la salida física, el dúplex ni la lectura de cámara. `spooled` significa que Windows aceptó el trabajo; la entrega se confirma después de comprobar la credencial.
