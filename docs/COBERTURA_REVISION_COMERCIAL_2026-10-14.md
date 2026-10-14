# Cobertura de la revisión comercial

Fecha: 14 de octubre de 2026. Cambios técnicos implementados en frontend, Worker y migraciones `20261014144953_commercial_readiness.sql`, `20261014161318_commercial_actor_history.sql`, `20261014174913_support_preparation.sql` y `20261014181211_support_configuration_fingerprint.sql`. Las pruebas físicas, contratos de clientes y validaciones jurídicas no se sustituyen con desarrollo. La segunda etapa incorpora soporte independiente y asistente: [guía de uso](SOPORTE_Y_PREPARACION_2026-10-14.md).

## Matriz de cobertura

| Hallazgo | Cobertura implementada | Pendiente / límite |
|---|---|---|
| C01 | Prueba de 14 días, cuotas propias, fechas y estado, también en alta manual. Condiciones existentes preservadas por contrato legacy. | Revisar los contratos legacy indefinidos con sus clientes; no se convirtió silenciosamente a clientes existentes en pruebas vencidas. |
| C02 | Contratar plan inicial, renovar mismo plan y cambiar de plan; bloqueo sólo por revisión pendiente, suspensión o falta de medios. | Ensayo comercial con cuenta nueva y transferencia real. |
| C03 | Vigencia en servidor, sólo lectura al vencer, aviso de vencimiento, ventana específica de evento protegida. | No hay gracia automática ni segmentación configurable de gracia. El contrato por evento necesita fechas reales acordadas. |
| C04 | Cotización en servidor, períodos permitidos, oferta versionada, comprobante del tenant, aceptación y conciliación por monto; recibo no fiscal descargable. | Política fiscal, conversión de moneda local, impuestos y devoluciones/reversos formales. |
| C05 | Organización activa explícita, selección entre membresías propias, validación de organización y solicitante en servidor. | Ensayo integral de soporte con varios tenants en QA completo. |
| C06 | Segmentos de contrato, renovación y descenso futuros, ascenso con diferencia proporcional, estados pending→approved/rejected, auditoría. | No se implementó devolución/prorrateo fiscal ni compra de complementos; cambios materiales durante revisión requieren nueva cotización. |
| C07 | Scan/listado/exportación ocultan perfil sin permiso; preferencias mediante sesión recuperada por correo; revocación y evidencia versionada privadas. | Revisión jurídica y contractual, responsables/retención y gestión de copias previamente exportadas. No certifica cumplimiento legal. |
| C08 | Derechos de módulos en escrituras de 78 tablas del esquema actual, padres evento/programa/plano, panel y APIs de IA/carga de planos; versiones de oferta administrables. | Granularidad avanzada de agenda/reportes y compra de complementos; revisar cobertura ante cada nueva tabla/API. Lecturas propias históricas se conservan. |
| C09 | Cuotas transaccionales con bloqueo por organización; reactivación de eventos y conteo conjunto de registros/participaciones, cuotas de usuarios, estaciones, puntos y empresas. | Ensayo con PostgreSQL completo de alta concurrencia y volúmenes reales. PGlite no certifica rendimiento ni concurrencia entre conexiones de producción. |
| C10 | Cuotas finitas nuevas, uso visible y alertas 80/95%, conservación de condiciones anteriores. | Medición y cuotas de correos, IA y almacenamiento; reservas comerciales de volumen y complementos de exceso. |
| C11 | Avisos en panel y cola transaccional de correo con reclamación/reintentos; motivo de rechazo, pendientes >24 horas y auditoría. | Prueba real de entrega de correo y operación de revisión en días laborales; el objetivo no constituye SLA garantizado. |
| C12 | Medio activo por ID, referencia requerida, comprobante válido, bloqueo sin medios, consulta comercial y errores recuperables. | Validar instrucciones y conciliación reales de cada medio de pago. |
| C13 | Fallos de alta/dominio visibles, reintento sin otra organización, aceptación idempotente, disponibilidad sin respuestas antiguas; asistente por escenario con evidencias y progreso persistente, conflictos de revisión y acta exclusiva del organizador. Cambiar configuración cubierta invalida las pruebas. | Comprobar DNS de un tenant nuevo; ensayar preparación con el cliente real. La aceptación no sustituye pruebas físicas ni cubre automáticamente toda relación de configuración nueva. |
| C14 | Marca pública EventosFácil, catálogo, demo con permiso/rate limit/pipeline separado, condiciones/privacidad y aceptación versionada con identidad histórica conservada. | Formalización de entidad legal, retención y textos jurídicos; asignación y seguimiento comercial real. |
| C15 | MRR sólo mensual contratado, efectivo de suscripciones conciliado, valor por evento separado, vencimientos, pruebas, pipeline y tickets. | Margen con costos reales, churn por cohortes, devoluciones/descuentos contables e ingresos cobrados de proyectos. No confundir valor contratado por evento con cobro. |
| C16 | Requisitos publicados, descarga del conector, guía de homologación y preparación, límites de vínculo/cancelación comunicados. | Impresión física con modelo y consumibles reales, medición de cola, recinto y contingencia firmados. |
| C17 | Oferta vigente, catálogo versionado y contratos por evento; propuesta antigua marcada histórica; especificación y suites actualizadas. | Validar consistencia de materiales enviados y condiciones de cada contrato real; workflow adicional sigue local por permiso GitHub pendiente. |

## Verificación

- `infra/npm test`: participantes, campañas, acreditación y contratos comerciales en PostgreSQL local PGlite. La migración comercial se aplica dos veces para comprobar idempotencia.
- `frontend/npm run test:commercial`: ejecuta handlers reales de cobro y signup con dependencias controladas; monto del servidor, aceptación, medios, comprobantes, locks y errores de onboarding.
- `frontend/npm run test:badges`, TypeScript, build y oxlint; backend TypeScript. La advertencia preexistente de hook en `PlanoComercialAdmin.tsx` permanece.
- Preflight sobre el esquema real: ejecutar la migración dentro de BEGIN/ROLLBACK, contar contratos legacy/ofertas/guards y comprobar esquema privado. No crea clientes ni pagos reales.
- Verificación transaccional en PostgreSQL real: prueba, cuota, cotización, aceptación, comprobante, conciliación, renovación, doble aprobación, vencimiento, contrato por evento, borrado de actor con historial y rechazo de cotización huérfana. Todo termina en ROLLBACK: no quedan usuarios, contratos ni pagos sintéticos, ni se envían correos.
- Tras desplegar: comprobar historial de migración, privilegios/RLS, linter y rutas públicas/admin. Nunca utilizar un pago real para probar una aprobación ficticia.
- Soporte/preparación: suite de permisos y RLS, sin escalación a finanzas, revocación/suspensión, evidencia, revisión y acta; navegador con servicios simulados para guardado, conflictos, descarga y vista móvil. Ensayo en PostgreSQL real con rollback de usuarios/tickets/actas de prueba.

Las pruebas de DB locales comprueban compra inicial, importe manipulado, organización ajena, comprobante ajeno, período inválido, rechazo no aprobable, renovación, diferencia de ascenso, cuotas, módulos, expiración, ventana de evento, privacidad y cola de avisos. La delegación del escaneo conserva su función original; el listado/permiso se prueba con SQL real. Las pruebas adicionales mantienen la eliminación autorizada de usuarios sin perder aceptación, solicitante ni auditoría, y niegan reutilizar la cotización del usuario eliminado. No constituyen homologación física ni QA integral de todos los módulos del producto.

## Uso y siguientes pasos

1. **SuperAdmin → Comercial y soporte:** revisar las tres ofertas; publicar otra versión si corresponde. No cambiar contratos existentes para aplicar precios nuevos.
2. **SuperAdmin → Pagos:** revisar comprobante, conciliar el monto en USD y aprobar o rechazar con motivo.
3. **Organizador → Suscripción:** verificar organización, estado, cuotas y medios. Contratar o renovar desde una cotización.
4. **Demo pública `/demo`:** las solicitudes aparecen en pipeline; asignar responsable, etapa y próxima acción.
5. **Superadmin → Comercial y soporte → Equipo de soporte:** habilitar cuentas existentes. **Bandeja `/soporte`:** asignar, responder y resolver tickets sin conceder finanzas ni acceso a participantes. El organizador responde desde su panel y un nuevo mensaje reabre un ticket resuelto.
6. **Organizador → Preparación y soporte:** seleccionar evento, definir escenario e impresión, registrar evidencias y aceptar el acta cuando estén completas. Soporte ayuda a documentar; la aceptación corresponde al cliente.
7. **Evento Acompañado:** registrar únicamente un contrato realmente acordado, con fechas, importe, referencia, responsables y horario. No simula conciliación ni factura.
8. Antes de venta general: completar jurídico/fiscal, entrega real de avisos, homologación, ensayo de concurrencia, restauración y capacidad de soporte. Ejecutar 2–3 pilotos pagados y registrar costos, cola y satisfacción con autorización de sus clientes.

Pasarela, CRM avanzado, integraciones y automatización adicional se priorizan después de pilotos medidos. La aplicación permite ejecutar y seguir parte de esa operación; no inventa costos, testimonios, acuerdos ni métricas comerciales que todavía no existen.
