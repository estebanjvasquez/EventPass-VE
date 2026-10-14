# Soporte independiente y preparación de eventos

Implementación de los puntos 1 y 2 de la siguiente etapa comercial, 14 de octubre de 2026.

## Equipo de soporte

En **Superadmin → Comercial y soporte → Equipo de soporte**, selecciona una cuenta existente y habilita soporte. Para revocar, selecciona la cuenta y desmarca la opción. No se concedieron permisos a personas nuevas automáticamente.

El operador inicia sesión normalmente y accede a `/soporte`. El permiso se consulta en la base de datos en cada operación: una revocación o suspensión bloquea las siguientes solicitudes sin esperar a renovar el token.

Puede consultar tickets de organizaciones, asignarlos al equipo disponible, responder, resolverlos y documentar preparación. El permiso no concede membresías de organizaciones, acceso a registros de participantes, comprobantes de pago, conciliación, precios, contratos, solicitudes comerciales ni administración de usuarios. Los permisos que la cuenta ya tuviera por otros roles siguen siendo independientes; usar cuentas dedicadas a soporte facilita la separación.

La bandeja muestra hasta 100 tickets, priorizando pendientes y críticos. Incluye filtros por pendientes, asignados al operador, críticos, resueltos y todos. Los responsables disponibles son operadores habilitados y superadmins no suspendidos. Resolver exige una solución escrita. La conversación conserva mensajes, fecha, procedencia e identidad histórica del autor; una respuesta del cliente reabre un ticket resuelto. El cliente consulta y responde en **Preparación y soporte**. Las respuestas se consultan en la aplicación; este cambio no añade envío de correos para tickets ni promete atención 24/7.

## Asistente de preparación

El organizador abre **Preparación y soporte**, selecciona un evento y configura el escenario. También aparece en el checklist de lanzamiento del evento. Soporte puede abrirlo desde un ticket o un evento con preparación iniciada.

Escenarios disponibles:

- Jornada sencilla: registro, privacidad/cobro, responsables y contingencia.
- Foro: añade agenda y accesos.
- Exposición: añade expositores y captación con consentimiento.
- Programa vinculado: añade inscripción al programa y accesos.
- Con impresión: añade conector, prueba física de impresora, lote y recuperación de cola.

Cada paso registra evidencia de hasta 2.000 caracteres, resultado, autor y fecha. No basta con marcar una casilla sin describir el resultado. El escenario organiza pruebas; no habilita funcionalidades ni modifica el contrato. Los pasos se almacenan por evento, con aislamiento de organización y control de revisión para impedir sobreescrituras simultáneas inadvertidas.

Cambiar escenario o impresión reinicia los pasos. Cambios en la configuración cubierta del evento invalidan las pruebas y la aceptación anterior. El fingerprint cubre el evento y las tablas presentes de categorías, plantillas, perfiles de impresión, accesos, sesiones/agenda, escenarios, planos y empresas que tengan `event_id`. No cubre todos los recursos relacionados indirectamente, datos de participantes ni cambios físicos de equipo: estos deben registrarse repitiendo sus pruebas. Añadir una nueva configuración requiere ampliar esa cobertura.

Solo el propietario o administrador de la organización puede aceptar, después de completar todos los pasos y confirmar explícitamente la declaración. Soporte no puede aceptar en nombre del cliente. El acta conserva una instantánea de evidencias, revisión, fecha e identidad y puede descargarse como texto. Un acta invalidada se conserva como historial. No es una firma electrónica certificada ni una certificación jurídica o de hardware.

La aceptación opera independientemente del checklist automático que controla la publicación existente: no se bloqueó la publicación de eventos ya operativos por añadir este asistente.

## Verificación

- `infra/npm test`: regresiones previas y permisos de soporte, aislamiento, revocación/suspensión, bloqueo financiero, evidencias, revisiones, aceptación e identidad histórica.
- `frontend/npm run test:support`: navegador Chrome con API simulada; guardado, conflicto/reintento, aceptación explícita, descarga, invalidación, asignación, conversación, acceso denegado y vista móvil. Requiere Chrome instalado; no usa credenciales ni datos reales.
- TypeScript, build y lint del frontend; permanece el aviso previo del hook en `PlanoComercialAdmin.tsx`.
- Migración idempotente verificada dos veces localmente y ensayo sobre PostgreSQL real dentro de `BEGIN/ROLLBACK`, sin persistir usuarios, tickets, actas o mensajes sintéticos.
- Migraciones `20261014174913_support_preparation` y `20261014181211_support_configuration_fingerprint`; la segunda permite que el validador SQL analice el recorrido del catálogo sin interpretar el array de tablas como un nombre único.
- Advisors: nueve avisos nuevos por RPCs `SECURITY DEFINER` ejecutables por usuarios autenticados. Son endpoints intencionales, con autorización interna, `search_path` vacío, acceso anónimo revocado y casos de denegación probados. No aparecieron avisos nuevos de ejecución anónima ni de `search_path`; las advertencias anteriores del proyecto siguen fuera del alcance de esta entrega. [Referencia de privilegios y RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Siguiente etapa recomendada

1. Medición de consumo y costos por organización: IA, correo y almacenamiento; alertas y base para presupuestar límites.
2. Seguimiento de próximas acciones y renovaciones: pendientes, responsables, vencimientos y contratos legacy sin fecha final.
3. Concurrencia y aislamiento en QA con varias conexiones PostgreSQL y volúmenes realistas.
4. Cobros parciales y costos de contratos por evento, distinguiendo valor contratado, cobrado y margen.

En paralelo, completar formalización jurídica/fiscal, comprobar entrega real de correos, homologar impresoras y ejecutar pilotos pagados con datos de operación autorizados.
