# Plan de web compartida y autoservicio del participante

Fecha: 1 de octubre de 2026. Base revisada: commit `0d9f941`.
Estado: implementación local desarrollada y validada. Migración y despliegues pendientes; el incidente productivo aún requiere reproducción con la sesión y datos reales.

## 1. Incidente de QA: constructor de web compartida

Hallazgo humano: los eventos vinculados permiten modificar la web, pero el guardado dirige a otro evento; al cambiar de evento se repite el bloqueo.

Hallazgos comprobados en `frontend/src/pages/admin/EventLandingAdmin.tsx`:

- La capacidad de guardar depende de que el `eventId` de la ruta coincida con `registration_config.web_event_id` del programa.
- Si falta una selección válida, se elige el primer evento vinculado ordenado por UUID; ese valor implícito no se persiste.
- Al navegar entre eventos, la carga anterior no se cancela ni se descartan sus resultados. Tampoco se reinicia inmediatamente el contexto listo. Respuestas antiguas pueden sobrescribir el contexto nuevo.
- Un evento en varios programas necesita `programId` explícito; los accesos generales del centro de control no lo conservan.
- Los campos siguen siendo editables aunque los botones de guardado estén deshabilitados.
- Guardar actualiza primero `events.config` y después `public_sites.landing_config`. No es una operación atómica y la primera actualización no comprueba una fila devuelta.
- Se consulta primero el sitio del programa y luego un sitio heredado del evento administrador. Hay que comprobar la coherencia entre `web_event_id`, `primary_event_id` y el alcance del sitio real.

Estos defectos explican escenarios de bloqueo y pérdida de contexto. No demuestran por sí solos la causa exacta del caso observado. Para cerrarlo hay que reproducir el flujo con sus datos y sesión. El conector disponible sólo muestra otro proyecto de Supabase, por lo que no se consultó la base de EventPass ni se alteró producción.

### Entrega P0 — Un editor canónico de programa

1. Registrar evento de entrada, programa seleccionado, evento administrador y sitio resuelto en la reproducción; capturar el error exacto sin claves ni datos personales.
2. Incorporar una ruta canónica `/admin/programas/:programId/landing`. Todos los eventos asociados abren esa misma web compartida. El evento principal aporta contexto/contenido, pero no determina qué ruta puede guardar.
3. Mantener el editor individual para eventos sin web compartida. Cuando haya varios programas, pedir seleccionar el programa antes de editar, sin inferir uno arbitrariamente.
4. Resolver el contexto completo antes de habilitar edición. Descartar respuestas obsoletas, restablecer carga/errores al cambiar de contexto y avisar antes de abandonar cambios sin guardar.
5. Usar `public_sites.landing_config` como fuente canónica de la web compartida. Validar el evento principal contra los vínculos del programa. Si no existe sitio, crearlo explícitamente antes de guardar contenido compartido.
6. Persistir borrador/publicación mediante una operación de base de datos autorizada y atómica. Si la compatibilidad exige actualizar también `events.config`, hacerlo en esa misma transacción y sobre el evento principal correcto.
7. Mantener borrador, contenido publicado y activación del dominio como estados separados. Leer lo guardado para verificar el resultado; no mostrar éxito ante cero filas actualizadas.
8. Inspeccionar configuraciones heredadas antes de cualquier reconciliación. No sobrescribir automáticamente versiones diferentes; conservarlas y elegir la versión válida con evidencia.

Aceptación: entrar desde cada evento lleva al mismo sitio/programa; guardar y recargar conserva el borrador; publicar cambia la página pública; guardar borrador no la cambia; cambiar rápido de evento no cruza contextos; otro tenant y roles sin permiso no pueden modificar el sitio. Probar además programa con un evento, varios eventos, varios programas, sitio heredado y selección inválida del evento principal.

## 2. Base disponible para las mejoras

- `RegistroEvento.tsx` crea registros y permite selección de asiento cuando está habilitada. Tiene reintento de correo dentro del flujo de alta.
- `RegistroPrograma.tsx` maneja un flujo de programa separado; debe mantener la identidad y los pases existentes.
- `CargarComprobante.tsx` consulta el registro por token, muestra plazo y permite aportar el comprobante.
- `CredencialEvento.tsx` consulta `get_credential_by_token`, genera QR e imprime si el registro está confirmado.
- El Worker ya envía instrucciones y confirmaciones con trazabilidad.
- La interfaz actual distingue `pending_payment`, `payment_submitted`, `confirmed` y `rejected`. El mensaje de credencial agrupa rechazo y vencimiento; hace falta una razón verificable para distinguirlos.

No crear otra identidad de participante ni sustituir los tokens QR vigentes.

## 3. Entrega 1 — Resumen de compra y estado del registro

### Experiencia

Antes de confirmar: evento o programa, horario con zona del evento, sede, modalidad, asiento si aplica, importe y moneda. Para registro gratuito mostrar «Gratuito». Presentar sólo cargos realmente configurados.

Después: página «Mi registro» con referencia, resumen persistido, estado actual, plazo y siguiente acción. Propuesta de ruta `/mi-registro/:accessToken`; el token de acceso del participante debe estar diferenciado del QR de acceso físico.

Acciones por estado:

| Estado | Mensaje y acción |
| --- | --- |
| Pendiente de pago | Importe, instrucciones, plazo y cargar comprobante |
| Comprobante recibido | En revisión; consultar estado sin duplicar el registro |
| Confirmado | Ver/imprimir credencial y consultar agenda |
| Rechazado | Motivo seguro y contactar al organizador; nueva carga sólo si está permitida |
| Vencido/cancelado | Explicación específica y opción válida para continuar |

El estado de correo se presenta aparte del registro y del pago. «Aceptado por proveedor» no equivale a «Entregado».

### Trabajo técnico

- Revisar las RPC de alta, consulta por token y aprobación para obtener el importe real y no deducirlo de la configuración actual.
- Persistir un resumen de las condiciones aceptadas: descripción, precio, moneda y asiento. Los cambios posteriores del evento no reescriben una compra existente.
- Añadir motivo/fecha de transición cuando sea necesario; conservar compatibilidad con estados históricos sin inventar motivos.
- Crear consulta mínima autorizada del registro; el acceso no permite consultar otros registros ni subir de estado desde el navegador.
- Adaptar confirmación, comprobante y credencial para enlazar al mismo centro del participante. En programa mostrar las actividades/pases reales sin contabilizarlos como nuevas compras.

Aceptación: gratuito, pago pendiente, comprobante en revisión, confirmado, rechazo y vencimiento muestran importe/acción coherentes. Cambiar precios no altera el resumen de registros existentes. No se muestra QR habilitado antes de la confirmación. Probar enlaces y responsive en móvil.

## 4. Entrega 2 — Categorías de entradas

### Alcance inicial

Categorías por evento: nombre, descripción, beneficios informativos, precio, moneda, cupo opcional, ventana de venta y publicación. Ejemplos: General, VIP y Estudiante. Una categoría no concede automáticamente acceso a zonas: los permisos requieren una regla explícita.

- Tabla propuesta `event_ticket_categories`, aislada por organización/evento.
- Registro vinculado a categoría y copia de nombre/precio/moneda adquiridos.
- Editor administrativo para crear, editar, publicar y desactivar; impedir borrar categorías usadas por registros.
- Selector público con beneficios, precio final y disponibilidad; resumen integrado con la entrega 1.
- Compatibilidad: eventos existentes siguen registrando con su modalidad/precio actual hasta activar categorías. No asignar categorías históricas sin reglas verificadas.

### Reglas de inventario y precio

- La base de datos calcula y valida precio/cupo; no confía en el importe enviado por el navegador.
- Reserva/consumo de cupos atómicos e idempotencia del alta para evitar sobreventa y registros duplicados.
- Aforo global y cupo de categoría se verifican juntos; las reservas institucionales no se descuentan dos veces.
- Definir cuándo los pendientes consumen cupo, y liberarlo exactamente una vez al vencer/cancelar. El plazo sigue el pago manual configurado; no imponer diez minutos.
- En eventos con asiento, fijar una precedencia explícita: precio de categoría o precio de asiento, sin sumar ambos implícitamente. Documentar y mostrar la política elegida antes de pagar.
- MVP: una categoría por participante. Compras grupales, descuentos, cuotas y cargos de servicio configurables quedan fuera de esta entrega.
- Categorías/paquetes de programa se diseñan como alcance posterior; el registro existente de programa debe seguir funcionando.

Aceptación: dos compradores por el último cupo no generan sobreventa; categoría agotada/despublicada/fuera de ventana no acepta altas; manipular precio no cambia el cobro; vencimiento libera cupo; confirmado no lo libera; editar una categoría no cambia compras anteriores; no se mezclan categorías entre eventos/tenants.

## 5. Entrega 3 — Recuperación autónoma de credenciales

### Experiencia

Enlaces «Consultar mi registro» y «Recuperar mi credencial» desde la web y páginas de comprobante/credencial. Solicitar correo y evento o programa. Responder siempre: «Si hay registros asociados, recibirás un enlace para consultarlos».

El correo de recuperación lleva a «Mi registro». Si está confirmado se puede abrir/imprimir la credencial; si sigue pendiente se muestran instrucciones. Recuperar nunca confirma un pago ni crea un registro nuevo.

### Trabajo técnico

- Endpoint del Worker para solicitud de recuperación, con validación de alcance y límites persistentes por IP, destinatario y evento/programa; respuesta uniforme para evitar enumeración.
- Token aleatorio distinto del QR, almacenado como hash, con caducidad y canje de un solo uso por una sesión limitada al registro o registros autorizados. Una visita automática del escáner de correo no consume el token: el canje se realiza con acción explícita.
- Acceso posterior acotado, revocable y con caducidad; no mantener indefinidamente el token de recuperación en URL/logs/referidores.
- Para varios registros del mismo correo, permitir selección sólo después de verificar el acceso. No mostrar nombres ni estados al solicitar recuperación.
- Reutilizar el envío y `email_log` del Worker, con identificador de plantilla y trazabilidad. El endpoint no devuelve el token ni la credencial al solicitante anónimo.
- No rotar `credential_token` al recuperar: los QR ya emitidos siguen siendo válidos según su estado actual.

Aceptación: correo existente/inexistente responde de forma equivalente; límite de abuso; enlace vencido/usado rechaza el canje; navegación de seguridad del proveedor de correo no invalida el enlace; aislamiento entre eventos/programas/organizaciones; registro pendiente no obtiene credencial activa; varios registros no crean duplicados; móvil permite imprimir/guardar con el flujo existente.

## 6. Orden, validación y publicación

Orden recomendado: P0 web compartida → resumen/estado → categorías → recuperación. Preparar en la entrega 1 el contrato de acceso seguro que reutilizará la recuperación.

Cada entrega se implementa y verifica por separado:

1. Pruebas focalizadas de lógica, RPC/permisos y regresiones del recorrido; incluir concurrencia en inventario y respuestas fuera de orden en el editor.
2. `frontend`: build y lint; `backend`: typecheck cuando cambie; revisión SQL, grants y RLS para migraciones.
3. Validación funcional con datos QA recuperables, dos eventos y dos organizaciones; no basta con que las rutas respondan HTTP 200.
4. Migraciones aditivas e idempotentes, aplicación registrada y despliegues de frontend/Worker coordinados. Mantener los enlaces actuales compatibles.
5. Smoke en producción, evidencia de versión y rollback a despliegue anterior. No eliminar datos/tablas nuevas para revertir frontend.

La autorización se aplica en la base de datos/Worker; deshabilitar controles sólo aporta claridad a la interfaz. Referencia: https://supabase.com/docs/guides/database/postgres/row-level-security

Las tres extensiones y la corrección P0 están implementadas localmente. Los despliegues y cambios de datos productivos requieren una ejecución separada.
