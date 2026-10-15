# Gestión comercial: consumo, seguimiento, concurrencia y caja

15 de octubre de 2026. Implementa los cuatro puntos posteriores a soporte y preparación. Acceso: **Superadmin → Comercial y soporte → Control comercial y rentabilidad**. No concede acceso financiero al equipo de soporte ni a organizadores.

## 1. Consumo y costos

Se observan tokens de las dos funciones de IA (entrada sin caché, entrada en caché y salida), correos aceptados y muestras diarias de almacenamiento. No se guardan prompts, archivos ni respuestas generadas en el registro de consumo. Los identificadores de respuesta del proveedor desduplican los tokens. Una respuesta de IA inválida para el plano también cuenta si el proveedor reportó su consumo.

Las tarifas se configuran en USD por millón de tokens, mil correos o GiB-mes. `*` es una tarifa general y un identificador exacto de modelo tiene prioridad. No se cargaron tarifas supuestas: debe configurarlas quien conozca la facturación real. Cada observación conserva su tarifa y costo histórico; publicar una tarifa no recalcula observaciones anteriores. «Sin tarifa» es costo desconocido, no cero. Un precio cero solo es válido cuando se configuró explícitamente.

El presupuesto mensual por organización activa señales visuales al 80% y 95%; no bloquea consumo ni cambia contratos. El panel muestra tokens, correos, última muestra de bytes y costo estimado del mes. Los correos aceptados por Cloudflare no equivalen a entrega confirmada. Se miden los correos registrados en `email_log`, avisos comerciales de la cola y las invitaciones/notificaciones operativas instrumentadas en el Worker. Correos de autenticación o administración global sin organización atribuible y envíos ajenos a esos caminos quedan fuera.

El cron horario toma como máximo una muestra de almacenamiento por organización y día. Atribuye los objetos cuyo primer segmento de ruta coincide con una organización, sumando `metadata.size` válido. Muestra cuántos objetos no tienen organización identificable o tamaño utilizable. La muestra diaria se prorratea entre los días del mes; no sustituye la medición continua de byte-horas del proveedor, tráfico, copias de seguridad ni costos generales. Los importes son estimaciones operativas, no una factura. Fallos de observación se registran en los logs del Worker; no se prometió telemetría completa durante fallos del proveedor o de la base de datos.

## 2. Seguimiento y renovaciones

Acciones vinculadas a una organización o solicitud comercial, responsable superadmin disponible, vencimiento, notas y estados pendiente/completada/cancelada. Las vencidas se resaltan. El guardado exige la revisión vigente y evita sobrescribir una actualización concurrente. El cliente de una tarea existente no puede cambiarse.

La bandeja recoge también próximas acciones del pipeline, contratos vencidos o próximos a vencer en 30 días y condiciones legacy sin fecha final. Una renovación posterior registrada evita volver a presentar el segmento anterior como pendiente de renovación. No convierte ni modifica contratos automáticamente. Las condiciones anteriores sin fecha requieren acuerdo con cada cliente. Los listados operativos tienen límites visibles (300 tareas/contratos y 100 solicitudes); se consulta y actualiza en el panel, sin añadir envíos automáticos al cliente.

## 3. Concurrencia y aislamiento

Nueva suite `infra/npm run test:concurrency`. Requiere Docker en funcionamiento y usa PostgreSQL efímero dentro de un contenedor sin puerto público, con datos sintéticos, eliminándolo al terminar. No ejecuta carga contra clientes de producción. Aplica las migraciones reales sobre el esquema mínimo de prueba y abre conexiones `psql` distintas.

Se cerró además el endpoint de ejemplo `/api/events`, que leía eventos con el cliente de servicio: ahora exige sesión, organización explícita, permisos y ausencia de suspensión; filtra el tenant y devuelve campos limitados. No tenía consumidores en el frontend. Se verifican denegación anónima/ajena/suspendida, fallo cerrado y filtro de organización en el handler real.

Resultado verificado en PostgreSQL 17.11:

| Caso | Resultado |
|---|---|
| Dos conexiones compiten por el último evento permitido | Un solo evento creado |
| Dos cobros de USD 60 contra contrato de USD 100 | Un solo cobro aceptado, total USD 60 |
| Dos cobros con la misma referencia y claves distintas | Un solo movimiento |
| Ocho reintentos de una operación con la misma clave | Un solo movimiento |
| Dos actualizaciones con la misma revisión de seguimiento | Una actualización; la otra recibe conflicto |
| 200 registros desde cuatro conexiones, cuota de 25 | 25 aceptados, sin sobrepasar cuota |
| Otro usuario consulta datos financieros y preparación ajenos | Lecturas vacías o acceso denegado según endpoint |

El caso de 200 intentos se completó en pocos segundos en el entorno local. Esa duración incluye el cliente de prueba y no es una promesa de capacidad ni latencia de producción. Quedan ensayos de infraestructura completa, red del recinto, mezcla de cargas, impresión física y pruebas prolongadas con los volúmenes comerciales acordados.

## 4. Cobros y rentabilidad por evento

Cada contrato por evento admite cobros parciales recibidos, gastos pagados y devoluciones en USD, con fecha, referencia, concepto y autor histórico. Un bloqueo del contrato serializa movimientos simultáneos; no permite cobrar por encima del saldo ni devolver por encima de lo cobrado. Una clave estable de reintento evita duplicar el movimiento tras un error de red. Además, no permite repetir una referencia vigente de cobro o devolución dentro del mismo contrato, incluso con otra clave después de recargar la página.

Los movimientos no se borran desde la aplicación. Anular exige motivo y conserva el historial. Se impide una anulación si deja devoluciones sin cobro de respaldo o cobros netos por encima del contrato.

El panel distingue:

- Contratado: valor del contrato.
- Cobros netos: cobros menos devoluciones vigentes.
- Saldo: contratado menos cobros netos.
- Gastos registrados: egresos pagados registrados.
- Resultado de caja: cobros netos menos gastos registrados.
- Margen de caja: resultado dividido entre cobros netos; no se calcula sin cobros netos positivos.

Los movimientos se registran únicamente contra contratos realmente acordados y dinero real recibido/pagado. No generan transferencias, facturas fiscales ni conciliación bancaria automática. No incluyen costos devengados todavía no pagados, IVA, moneda local, depreciación, costo de personal no registrado ni beneficio contable certificado. Los costos de consumo del punto 1 se muestran separados: para considerarlos en un proyecto deben asignarse como gasto real sin duplicarlos. El historial visible reúne los últimos 300 movimientos y permite filtrar el contrato seleccionado.

## Verificación y despliegue

Migración `20261015155712_commercial_management_stage3.sql`. RLS en todas las tablas nuevas, lectura financiera exclusiva de superadmins y registro de consumo reservado al servicio. Verificación con migración aplicada dos veces en la suite local; ensayo de integración en PostgreSQL real dentro de `BEGIN/ROLLBACK`, sin conservar clientes, cobros o seguimientos sintéticos.

- `infra/npm test`: participantes, campañas, impresión, contratos, soporte y gestión comercial.
- `infra/npm run test:concurrency`: conexiones simultáneas en PostgreSQL de QA.
- `frontend/npm run test:management`: navegador con APIs simuladas y pruebas de medición del Worker.
- `frontend/npm run test:commercial` y `test:support`: regresiones de cobro/onboarding y soporte.
- TypeScript del backend, build y lint del frontend. Se mantiene el aviso previo del hook de `PlanoComercialAdmin.tsx`.
- Advisors: seis avisos nuevos por endpoints administrativos `SECURITY DEFINER` ejecutables por autenticados; son intencionales y comprueban superadmin internamente, con `search_path` vacío y pruebas de denegación. No se añadieron permisos anónimos ni acceso de autenticados al registro reservado al servicio. Persisten los avisos anteriores del proyecto. [Referencia de RLS y privilegios](https://supabase.com/docs/guides/database/postgres/row-level-security).

Para comenzar: configura tarifas y presupuestos; revisa contratos sin fecha; asigna próximas acciones; registra cobros/gastos reales de los contratos por evento. No se alteraron precios, presupuestos ni responsables de clientes existentes automáticamente.

## Pendientes de la revisión original

Fiscalidad y documentación jurídica, entrega real de correo, homologación de impresoras y pilotos en recinto; complementos de capacidad y cuotas de consumo que bloqueen servicio con políticas comerciales acordadas; cohortes/churn, costos generales y contabilidad completa; retención de datos y capacidad a gran escala. Los cuatro puntos implementados aportan herramientas y evidencia, sin sustituir esas validaciones operativas.
