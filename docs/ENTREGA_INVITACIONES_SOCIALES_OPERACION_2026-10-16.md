# Entrega: invitaciones, eventos sociales y operación del organizador

Fecha: 16 de octubre de 2026. Implementación inicial de las fases 0–6 del [plan](PLAN_DESARROLLO_INVITACIONES_Y_SOCIALES_2026-10-16.md). Las validaciones externas y los ensayos físicos se registran como pendientes hasta recibir evidencia.

## Cobertura por fase

| Fase | Entregado | Validación pendiente externa |
|---|---|---|
| 0 | Reglas explícitas de aforo, privacidad, identidad visible y RSVP; accesos por componente, zona, sesión y fechas. Guiones de demostración y criterios de aceptación. | Revisar lenguaje y políticas con cada empresa. |
| 1 | Asignaciones, lotes seguros, canje individual atómico, reintento privado, vencimiento, revocación, transferencia con reemplazo y auditoría. Registro y credencial existentes. | Ensayo con operadores y dispositivos reales. |
| 2 | Portal de distribuidores; beneficios por stand/paquete versionados; instantánea aprobada por asignación; reportes y exportación. | Revisar paquetes, cantidades y acumulación con el organizador. |
| 3 | Hogares, representante, plazas individuales de acompañantes, importación con vista previa, RSVP individual y personas sin correo. Corrección y reactivación por planner. | Revisar el recorrido con la empresa de bodas. |
| 4 | Mesas, capacidad, asignación y movimientos, listado operativo exportable y mesa en la validación de ingreso. | Revisar protocolo y necesidades de asientos concretos. |
| 5 | Escenarios sintéticos DEMO, reinicio protegido de preparación, observaciones clasificadas y estado pendiente/observado/resuelto. Pruebas automatizadas y guía. | Revisión comercial, condiciones de compra y aceptación de ambas empresas. |
| 6 | Tareas de producción, proveedores/áreas, responsables, fechas, dependencias, avisos visuales de atraso y portal limitado de colaboradores. Presupuesto USD/VES, etapas, tasas históricas, caja pagada, anulación, exportación e historial. | Revisar necesidades contables y de operación con los organizadores. |

## Dónde se utiliza

En **Eventos → Administrar evento → Invitaciones y operación**. También aparece en el menú lateral del evento.

- Organizador: `/admin/eventos/:eventId/operaciones`.
- Distribuidor o proveedor: `/portal/invitaciones/:eventId`.
- Invitado individual: `/invitacion/:eventId/registro#CODIGO`.
- Representante del hogar: `/invitacion/:eventId/hogar#SECRETO`.

El portal permite iniciar sesión o crear una cuenta de colaborador sin crear una organización. La cuenta debe confirmar su correo y el organizador debe asignarla por ese mismo correo. Crear una cuenta no otorga permisos. No se enviaron invitaciones ni mensajes a contactos reales como parte del desarrollo.

## Reglas operativas

1. Configurar el evento como **registro por invitación**. Aprobar si el aforo se reserva al emitir códigos o al registrarse, si el evento será privado y si cada invitador puede ver nombres de sus registrados. Los contactos no se incluyen en su reporte.
2. La política de aforo queda fijada con la primera emisión. Privacidad, nombres visibles y plazo RSVP pueden actualizarse explícitamente, con revisión para evitar sobrescrituras concurrentes.
3. Exposición, foro, VIP y social son derechos independientes. Seleccionar además los otros componentes autorizados; si hay sesiones con reserva, seleccionarlas expresamente. Una etiqueta VIP no concede automáticamente acceso general, foro ni talleres.
4. Los días de acceso se introducen como fechas venezolanas, separados por coma. Los campos con hora se interpretan en la zona del dispositivo y se guardan con zona horaria. Vencimiento del código y días habilitados para entrar son conceptos distintos.
5. El sistema muestra o descarga el secreto al emitir. Conserva su SHA256, no una copia recuperable del código. Si un lote se pierde, revocar y reemitir dentro de una asignación con cupo; para un hogar, renovar el enlace invalida el anterior.
6. Solo el organizador transfiere códigos no usados. La transferencia invalida el secreto anterior y emite otro dentro del cupo aprobado del destino. Cambiar el catálogo de beneficios no modifica asignaciones anteriores.
7. Un canje consume un solo código y lo vincula al registro. Los reintentos requieren el identificador privado de la solicitud original. Conocer únicamente un código usado no permite consultar la credencial ajena.
8. Cancelar un registro anula su credencial y libera su ocupación vigente. El código permanece consumido y el consumo contractual no se elimina. Una sustitución requiere una nueva invitación disponible; no se borra al participante anterior.
9. Cada integrante de un hogar conserva identidad y autorización individuales. El correo del representante se guarda como contacto del hogar; no se copia como identidad de todos. Un integrante puede carecer de correo. No se crean correos ficticios.
10. Declinar después de canjear cancela la participación. Para volver a aceptar interviene el planner, que comprueba aforo. La reactivación de una participación registrada rota la credencial; una autorización no canjeada revocada se reemplaza conservando historia.
11. La impresión de una invitación mantiene el flujo de impresión existente, pero no sustituye la validación de zona/punto. Para ingresar, escanear en un punto autorizado. Las credenciales canceladas y las reservas de sesión no incluidas se rechazan.

Las reservas de invitaciones se consideran en el aforo de los componentes y sesiones. No se añaden licencias ni se cambian precios o contratos: las escrituras operativas pasan por la capacidad contractual `core`, y los registros conservan las cuotas de participantes existentes.

## Guion de revisión B2B

1. Crear un evento independiente llamado `DEMO Foro Expo` y marcar su modalidad de registro por invitación. Publicarlo para probar el canje. No cargar contactos reales.
2. Aprobar reglas y utilizar **Cargar escenario de demostración**. Se crean beneficios, asignaciones, códigos, tareas, presupuesto y observaciones pendientes.
3. Descargar los enlaces, canjear uno con datos ficticios y probar el mismo código desde una sesión distinta. La segunda persona debe ser rechazada.
4. Crear una cuenta de colaborador, confirmar su correo y asignarla a una nueva bolsa. Comprobar que solo ve sus códigos y los datos autorizados, sin presupuesto ni invitados de otros distribuidores.
5. Transferir un código no canjeado; comprobar que el anterior falla y el reemplazo funciona. Crear accesos de exposición, foro y VIP y comprobar la matriz de derechos.
6. Si hay otros eventos o sesiones, autorizarlos de forma explícita y probar sus aforos. El cupo de una sesión se reserva también frente a registros por las rutas anteriores.
7. Conciliar asignados, disponibles, entregados declarados, canjeados y asistencias. «Entregado» es una marca manual, no un acuse de WhatsApp o correo.

## Guion de revisión social

1. Crear otro evento independiente `DEMO Boda`, tipo social, por invitación, y aprobar privacidad. Si el contrato limita eventos, realizar los recorridos en organizaciones de ensayo separadas o archivar la demo anterior conforme al contrato.
2. Cargar el escenario y guardar el enlace del hogar. Cada integrante tiene una plaza; identificar al acompañante al responder si se dejó como plaza pendiente.
3. Aceptar algunos integrantes y declinar otro. Comprobar personas confirmadas, no solo cantidad de hogares. Probar integrantes sin correo y correcciones del planner.
4. Crear una mesa con menos plazas que invitados confirmados. Asignar, mover y comprobar que dos operadores no pueden sobreocuparla.
5. Descargar protocolo, validar una credencial en puerta y comprobar su mesa. Las notas internas y los contactos no se incluyen en ese listado.
6. Registrar cada observación como falla, regla, preferencia o condición de compra. Anotar tarea, tiempo observado, resultado y sugerencia. Mantener pendiente lo que la empresa no haya revisado.

El reinicio de DEMO requiere escribir el nombre exacto y solo elimina preparación si aún no hay registros. Una demo con canjes conserva su historial y consumo: para otro ensayo limpio se crea otro evento. No existe un botón que borre asistentes o restablezca cuotas comerciales para aparentar disponibilidad.

## Producción y presupuesto

- Una tarea puede depender de otra; no se completa mientras la precedente siga pendiente. Se rechazan ciclos y revisiones desactualizadas. El proveedor asignado solo consulta sus tareas y actualiza su estado desde el portal, sin acceso al presupuesto.
- El presupuesto pertenece al organizador del evento y está separado de la caja del superadmin. Cada partida guarda concepto/versión, contraparte, tipo, etapa, importe y moneda originales, tasa y fecha/fuente históricas.
- La equivalencia usa `importe VES / Bs por USD`; para USD la tasa es 1. Las tasas se introducen manualmente y no se sustituyen por una tasa actual al consultar.
- Una partida representa un importe completo en una etapa: previsto, comprometido, devengado o pagado. Las etapas no se suman entre sí. El flujo de caja mostrado resta gastos pagados de ingresos pagados.
- Para pagos parciales se separan partidas con referencias claras. Para cambiar importes o tasas se anula con motivo y se crea la partida corregida. Las repeticiones de una misma operación no duplican importes; no se acepta reutilizar su identificador con otro contenido.
- Esta entrega no constituye contabilidad, cálculo de impuestos, facturación fiscal ni conciliación bancaria automática.

## Verificación y despliegue

Suite principal: `npm run test:operations` desde `infra`. Ejecuta PostgreSQL real temporal y Chrome con las pantallas de producción; el transporte HTTP de pruebas conecta los RPC con esa base de datos aislada. No usa datos ni participantes de producción.

Casos cubiertos: migración repetible; canje concurrente e idempotencia; rollback ante contrato vencido; aislamiento y permisos; transferencia; cancelación y reactivación; privacidad mediante RLS y API pública; beneficios versionados; hogares y personas sin correo; mesas concurrentes; dependencias y revisiones; tasas e importes históricos; aforos de componentes y sesiones; preparación DEMO; recorridos de navegador B2B/social/proveedor; validación y límites del Worker.

Además: compilación frontend, TypeScript backend, lint, regresiones de registro/campañas/credenciales/comercial y navegación de superadmin. La migración se comprobó contra el esquema remoto dentro de una transacción terminada en `ROLLBACK` antes de aplicarla.

Migración: `infra/supabase/migrations/20261016100223_private_invitations_social_operations.sql`. Publicar base de datos antes del Worker y frontend. La reversión de una versión de UI no debe eliminar tablas, canjes ni auditoría; ante un defecto, suspender nuevas emisiones y corregir hacia adelante conservando registros.

## Lo que sigue fuera de esta entrega

Editor avanzado de mesas y asientos concretos, automatización de WhatsApp, acceso offline, portal completo de novios, motor universal de patrocinio, venta pública de tickets, pasarelas, facturación fiscal, contabilidad y conciliación. Ya figuraban como ampliaciones condicionadas en el plan. La aceptación comercial y el ensayo físico de impresoras/red/operadores siguen pendientes de realizar con personas y equipos reales.
