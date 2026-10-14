# Revisión comercial y gerencial — EventosFácil / EventPass VE

Fecha: 14 de octubre de 2026. Evaluación para decidir ajustes y preparar lanzamiento; no constituye implementación ni autorización de cambios comerciales.

## Dictamen ejecutivo

El producto tiene una propuesta comercial defendible: unir registro, pagos manuales locales, agenda, exposición, portal del expositor y acreditación con impresión. El segmento inicial más coherente es el organizador de foros y exposiciones gremiales que necesita operación acompañada. Recomiendo empezar mediante pilotos pagados y licencia por evento. El autoservicio mensual masivo debe esperar a cerrar los bloqueos de cobro, vigencia, contratación y operación física.

La capacidad funcional está más avanzada que el control comercial. Hoy una organización creada por autoservicio se activa sin contratar una suscripción, el plan actual no se puede comprar/renovar desde su propia tarjeta y el vencimiento no gobierna los permisos. Por tanto, publicar una tabla de precios sin arreglar estos puntos no produce un SaaS comercialmente controlado.

Decisiones recomendadas: una marca pública consistente; catálogo único de contratos y derechos; dos modalidades (software mensual y servicio por evento); capacidades finitas; soporte con horario contratado; impresión vendida sólo tras homologación física. No vender procesamiento bancario automático, operación totalmente offline, CRM completo ni incremento de ventas garantizado.

## Alcance, evidencia y límites

Se inspeccionaron código frontend/backend, migraciones y documentación del repositorio. Los hallazgos verificados describen la implementación versionada, no una prueba destructiva o transaccional en producción. No se consultaron datos personales, credenciales, facturación real ni métricas reales de clientes. No se implementó ni desplegó nada. Los precios sembrados pueden haber sido editados mediante SuperAdmin: antes de publicar una oferta se debe contrastar el catálogo activo de producción.

Se distingue **verificado** (comportamiento identificable en código), **inferencia** (efecto comercial probable) y **propuesta** (decisión pendiente). No se hizo investigación de mercado externa; los precios sugeridos usan únicamente el catálogo y la propuesta comercial interna. No deben presentarse como precios de mercado validados. Esta revisión comercial no sustituye asesoría jurídica sobre contratos y datos.

Se buscó en toda la cadena versionada de migraciones, backend y frontend la redefinición de `request_subscription`, `approve_subscription_payment`, `enforce_event_limit`, `enforce_registration_limit` y uso de `current_period_end`: no se encontraron reemplazos posteriores de esas RPC/triggers que solucionen los hallazgos. Sí se contrastó la autorización vigente de octubre, en vez de asumir que las políticas iniciales seguían siendo las últimas. Esto no demuestra identidad exacta del esquema remoto con el repositorio.

Impresión: se toma como antecedente la corrección y publicación del commit 29620f6 y conector 0.3.0. `docs/CORRECCIONES_CREDENCIALES_2026-10-14.md` y `print-bridge/README.md` documentan recuperación de cola y límites del conector. La prueba física sigue pendiente; el workflow adicional no se publicó por falta del permiso correspondiente.

## Fallas verificadas y consecuencias comerciales

| ID / prioridad | Evidencia verificable | Problema y consecuencia | Ajuste y criterio de aceptación |
|---|---|---|---|
| C01 / P0 | `infra/supabase/migrations/20260703120000_onboarding.sql`, `create_organization`: inserta `status='active'`; plan por defecto Arranque en `20260629120000_init_multitenant.sql`. `frontend/src/pages/CrearCuenta.tsx:120`: “Empieza gratis”. | Alta gratuita indistinguible de cuenta pagada; no hay duración de prueba en este flujo. Inferencia: uso continuado sin conversión ni fecha límite. | Crear prueba de 14 días con `trial_ends_at`, derechos propios y CTA de compra. Aceptación: cuenta recién creada muestra vencimiento, no aparece como cliente pagado y no publica eventos comerciales tras vencimiento sin contrato válido. |
| C02 / P0 | `frontend/src/pages/admin/SuscripcionAdmin.tsx:181`: `disabled={isCurrent}`. | Arranque es plan inicial: el cliente no puede comprarlo desde su tarjeta; tampoco renovar su plan vigente. | Separar “Contratar”, “Renovar” y “Cambiar”. Aceptación: cuenta sin pago compra Arranque y una cuenta vigente renueva mismo plan sin cambiar artificialmente de plan. |
| C03 / P0 | `20261006120000_platform_operations_and_public_catalog.sql`: `is_org_member`, `has_org_role`, `current_platform_access` sólo excluyen suspensión. Triggers `enforce_*_limit` no consultan vencimiento. Búsqueda de `current_period_end` en migraciones sólo encuentra almacenamiento/listado/extensión. | Fecha de vencimiento informativa; no se encontró control automático de suscripción vencida. Inferencia: ingreso recurrente y acceso se desacoplan. | Política `trial/active/grace/past_due/read_only`; avisos y renovación. Aceptación: vencimiento cambia derechos según contrato, preserva consulta/exportación y nunca interrumpe un evento cuya ventana operativa siga cubierta. Suspensión por seguridad se trata aparte. |
| C04 / P0 | `20260703170000_subscriptions_billing.sql:123-145`: RPC almacena `p_amount`, `p_months` del cliente y no contrasta precio ni `is_active`. | Solicitud puede declarar importe arbitrario, plan retirado y períodos ajenos a los ofrecidos. Aprobación manual mitiga, pero no asegura consistencia. | Cotización calculada en servidor y snapshot de tarifa, impuestos aplicables y moneda; período permitido; recibo perteneciente a organización. Aceptación: monto manipulado/plan inactivo/período inválido se rechazan o recalculan; aprobación exige conciliación por importe esperado. |
| C05 / P0 | `request_subscription` elige primera membresía owner/admin; `SuscripcionAdmin.tsx:55` primera membresía. Dashboard sí usa `resolveActiveOrg`. | Facturación puede apuntar a otra organización en usuarios con varias membresías, incluidas operaciones de soporte. | Organización activa explícita y validada en servidor. Aceptación: usuario de dos organizaciones ve y paga exactamente la seleccionada; ninguna URL/cambio de selección traslada comprobante o pago al otro cliente. |
| C06 / P0 | `approve_subscription_payment` extiende desde vencimiento actual pero sustituye inmediatamente `plan`; no hay prorrateo ni fecha futura de cambio. Sólo rechaza estado ya aprobado. | Una compra corta del plan superior puede transformar también meses pendientes del inferior. Pago rechazado puede aprobarse mediante llamada directa. | Snapshot de contrato y segmentos temporales; política de upgrade y downgrade. Aceptación: renovación misma tarifa conserva plazo; upgrade cotiza diferencia; downgrade empieza al vencer; sólo pending pasa a approved, con auditoría. |
| C07 / P0 | `20260831093254_exhibitor_visits_without_live_consent.sql:54,67,133-136` comparte perfil/correo tras escaneo y listado con `profile_shared=true`; eliminó condición de consentimiento del flujo anterior. | Compartir datos con expositores no está sujeto al consentimiento previo que sí existía. Riesgo contractual/reputacional verificable; no se afirma infracción legal sin determinar jurisdicción/base legítima. | Definir base y aviso con asesoría; si corresponde consentimiento, separación clara y evidencia versionada; revocación y minimización. Aceptación: negativa no comparte correo; sí permitido muestra alcance y destinatario; exportación aplica misma regla. Bloquear venta de captación de leads hasta resolver. |
| C08 / P1 | `plans.features` existe (`20260703170000_subscriptions_billing.sql:13`) pero no se encontró consumo para derechos comerciales; dashboard módulos en `OrganizadorDashboard.tsx` sólo distingue algunos por rol. | Los planes se diferencian por dos cuotas, no por módulos. No vender módulos exclusivos que no se controlan. | Catálogo de capacidades por plan y complemento validado en RPC/API, además del menú. Aceptación: cliente sin módulo recibe denegación también llamando API; historial/exportación conservan reglas de contrato. |
| C09 / P1 | Triggers de cuota sólo `BEFORE INSERT`; cuentan eventos no archivados y `registrations`. Dominio también contiene `event_participations`. | Reactivar eventos archivados puede eludir cuota por update; el conteo no demuestra cobertura de participaciones de programas. Count sin bloqueo explícito plantea riesgo en concurrencia entre eventos. | Una definición de consumo y enforcement transaccional para todas las vías. Aceptación: reactivación valida cuota; programas y walk-ins cuentan correctamente; dos altas concurrentes no exceden último cupo. La concurrencia es riesgo a reproducir, no prueba ejecutada aquí. |
| C10 / P1 | Profesional tiene `max_events=null`, Asociación ambas cuotas null en semilla. No hay cuotas comerciales por email, IA, almacenamiento, operadores o estaciones en el catálogo. | Exposición a costos y soporte ilimitados bajo precio fijo. | Límites finitos y complementos; avisos 80/95%; reserva previa del volumen de evento. Aceptación: uso visible, costo atribuible, exceso contratado y ninguna sorpresa de bloqueo en acreditación. |
| C11 / P1 | Suscripción muestra “Te avisaremos” (`SuscripcionAdmin.tsx:162`); aprobación en `SuperAdmin.tsx` llama RPC. No se encontró notificación de suscripción en este recorrido. | Promesa sin mecanismo demostrado; cliente espera sin SLA ni seguimiento de activación. | Bandeja de pagos con responsable/plazo, aviso de resolución y nota de rechazo visible. Aceptación: pago llega, se concilia, se notifica y queda auditado; prueba real de correo y fallback en panel. |
| C12 / P1 | `SuscripcionAdmin.tsx:308-309,343`: sin medios activos se muestra “Contáctanos”, pero se permite enviar; método es texto libre y referencia opcional. | Compra sin instrucciones utilizables y conciliación débil. | Medio activo seleccionado por ID; referencia según medio; enlace de ayuda; impedir pago nuevo sin medios. Aceptación: formulario no acepta medio inexistente; rechazo explica corrección y nuevo envío conserva historial. |
| C13 / P1 | `CrearCuenta.tsx:75-76` ignora resultado de onboarding en rama con sesión; `lib/onboarding.ts` provisiona dominio en segundo plano sin verificar HTTP. | Se puede comunicar cuenta lista aunque falle creación o dominio. Inferencia: abandono y soporte evitable. | Estado de organización/dominio visible y reintento con error útil; asistente por tipo de evento. Aceptación: falla simulada no termina en éxito; se recupera sin duplicar organización; primer evento tiene ruta guiada. |
| C14 / P1 | Landing marca EventPass VE, dominio comercial EventosFácil; CTA demo abre correo; footer no enlaza términos/privacidad; alta no contiene aceptación contractual. | Marca fragmentada, ausencia de condiciones accesibles y captación comercial sin pipeline estructurado. | Marca pública EventosFácil (nombre técnico puede seguir); planes y exclusiones; formulario demo propio, no reutilizar tabla de leads de un cliente. Aceptación: términos y privacidad enlazados, versión aceptada guardada, lead con responsable/origen/próxima acción. |
| C15 / P1 | `admin_dashboard_stats` reporta cantidades y pagos pendientes, sin MRR, ingresos cobrados, renovación, churn, margen o pipeline. | Dirección carece de tablero de negocio. No hay evidencia aquí de que existan esos informes fuera de la aplicación. | Reporte financiero/comercial conciliado; separar ingreso mensual de proyecto. Aceptación: cifras reconciliadas con pagos aprobados/recibos, descuentos y devoluciones; ninguna trial incluida en MRR. |
| C16 / P0 servicio de impresión | Documentación conector 0.3.0: vínculo dura ocho horas, Windows acepta cola pero no cancela trabajos ya aceptados; QA física pendiente. Landing dice operación “desde cualquier dispositivo”. | Riesgo de vender impresión como universal/garantizada sin compatibilidad ni capacidad medida. | Publicar requisitos de Windows, controlador, formato y PC local; homologación y runbook. Aceptación: impresión física y recuperación firmadas para modelo contratado; renovación de vínculo antes de turno; cancelación comunicada correctamente. |
| C17 / P1 | `docs/ESPECIFICACION_VIGENTE.md` declara ausencia de suite, mientras documentos de octubre ya describen pruebas; `PLAN_COMERCIAL_EVENTO_ASOCIACION.md` vende licencia por evento y aplicación sólo mensual. | Documentos y producto contradicen oferta, alcance y preparación. | Fuente única de versión vendible, catálogo y ficha de alcance. Aceptación: demo/propuesta/panel/precio/contrato coinciden; capacidades pendientes no aparecen como incluidas. |

Además, `docs/PROPUESTA_EJECUTIVA_CLIENTE.md` (junio) promete reducción del 80% de carga administrativa, validación automática de pagos y check-in sin conexión, mientras describe también verificación manual. Es una propuesta histórica de desarrollo por USD 29.826, con arquitectura anterior; no es tarifa vigente de licencia SaaS ni de servicio por evento. No existe evidencia medida en esta revisión que respalde el 80% o certifique offline. El plan comercial de agosto explícitamente excluye operación completamente offline no validada. Antes de venta, marcar esta propuesta como histórica/no vendible o sustituirla por una versión coherente; retirar esas promesas de materiales enviados a clientes hasta demostrarlas.

## Planes y módulos propuestos

Todos los límites siguientes son **propuesta comercial**, no capacidad técnica certificada. El catálogo actual sembrado es Arranque USD 49/mes, 1 evento y 200 registros/evento; Profesional USD 99/mes, eventos ilimitados y 1.000 registros/evento; Asociación USD 179/mes, ambas cuotas ilimitadas. Mantener precios actuales como hipótesis inicial y cambiar alcance sólo para nuevos contratos/versiones, respetando clientes existentes.

| Capacidad | Demo 14 días | Arranque — 49/mes | Profesional — 99/mes | Organización — 179/mes |
|---|---|---|---|---|
| Cliente objetivo | Evaluación | Jornada sencilla | Organizador recurrente | Asociación/agencia con exposición |
| Eventos operativos simultáneos | 1 de prueba | 1 | 3 | 6 |
| Participantes únicos por evento | 50 | 200 | 1.000 | 2.500 |
| Participantes nuevos totales/mes | 50 | 200 | 2.000 | 5.000 |
| Usuarios internos activos | 2 | 3 | 8 | 15 |
| Puntos de acceso / estaciones | 1 / 1 prueba | 2 / 1 | 5 / 3 | 10 / 6 |
| Registro, categorías y pago manual | Prueba | Sí | Sí | Sí |
| Landing, QR, Mi registro y recuperación | Prueba | Sí | Sí | Sí |
| Check-in, acreditación, Badge Designer, cola | Prueba homologada | Básico | Lotes/versionado | Lotes/versionado |
| Agenda, salas, plano de asientos | Prueba | Agenda básica | Completo | Completo |
| Programas vinculados y pases por zona/sesión | Prueba | No | Sí | Sí |
| Plano de exposición, portal, stands | Demo | No | Complemento | Hasta 75 empresas/stands |
| Captación de visitantes del expositor | Demo anonimizada | No | Complemento validado | Sí, tras C07 |
| Patrocinantes, entregables, proveedores | Demo | No | Complemento | Sí |
| Campañas/conversiones y formularios leads evento | Demo | Resumen | Sí | Sí |
| Reportes y exportación de datos propios | Sí | Básicos | Operativos | Operativos y comercial del evento |
| Dominio | Temporal | Subdominio | Subdominio | Un dominio propio, sujeto a provisión |
| Soporte | Guía y demo | Horario laboral | Horario laboral prioritario | Responsable y revisión de preparación |
| Operación presencial/equipos/consumibles | No | Cotización | Cotización | Cotización |

“Organización” evita que el nombre Asociación excluya agencias/corporaciones. Una exposición con 200 personas puede necesitar el plan superior por módulos aunque tenga poco volumen; la asignación se decide por capacidad y flujo, no por forma jurídica del cliente.

Regla de asignación: elegir el plan mínimo que cubra **cada** dimensión necesaria y módulos obligatorios; cotizar un complemento o contrato por evento si excede una dimensión. Nunca sumar cupos de participantes a partir de planes diferentes sin contrato. Un programa con foro y expo cuenta una persona única para capacidad comercial; se conservan participaciones y accesos por componente. Un “evento operativo” incluye preparación/publicación/operación dentro de la ventana contractual; archivar no permite volver a publicar sin consumir capacidad. Cancelados legítimos liberan reserva operativa según política; registros históricos no se borran para ahorrar cuota. Diferenciar almacenamiento histórico y nueva capacidad.

Complementos concretos: Exposición (stands, portal, directorio), Captación profesional (visitas consentidas/exportación), Patrocinio (acuerdos/entregables), Operación ampliada (estaciones/accesos), volumen de participantes, soporte en horario del evento, importación y capacitación. No fijar precios de estos complementos hasta medir horas/costo unitario; ofrecer cotización con snapshot y límites.

## Modalidad recomendada para lanzamiento

Ofrecer **Evento Acompañado**, separado de la suscripción. Reutilizar como propuesta interna la licencia de lista de USD 1.500 / oferta fundadora de USD 1.200 descrita en `docs/PLAN_COMERCIAL_EVENTO_ASOCIACION.md`: un evento/edición, 1.500 participantes, 75 expositores/stands, cinco administradores, tres puntos de impresión y cuatro horas de capacitación. Equipos, consumibles y soporte presencial fuera de licencia. La propuesta ya existe; no se afirma que sea precio vigente, validado por mercado o contrato cerrado.

Esta licencia puede cubrir 90 días de preparación, días de evento pactados y 30 días posteriores de cierre/exportación; después, archivo de sólo lectura durante la retención acordada. Si requiere varias ediciones, hacer contrato recurrente específico. Registrar este contrato en la aplicación, evitando activar “Asociación ilimitado” como sustituto administrativo.

Antes de confirmar precio, dimensionar accesos, llegada pico, duración, formato/material, impresoras, aforo, stands, tareas de carga y horario de soporte. Validar margen: precio neto menos infraestructura incremental, correos/IA, horas de preparación/soporte, terceros, consumibles incluidos, incidencias y comisiones. Objetivo inicial propuesto: contribución positiva en cada piloto; fijar mínimo de margen después de medir dos eventos. No comparar USD 179 de software con USD 1.200 de servicio sin explicar responsabilidades.

## Ajustes específicos que debe soportar la aplicación

1. **Contratos y derechos:** `offer_versions`, contrato por organización/evento, modalidad, fechas, módulos, cuotas, complementos y snapshot de condiciones. Registro de excepción temporal con motivo y aprobador. Catálogo comercial separado de rol de usuario: un operador autorizado también requiere derecho de módulo vigente.
2. **Cobro y conciliación:** orden/cotización calculada en servidor, comprobante asociado, importe esperado/recibido, moneda, estado, rechazo, reverso y auditoría; recibo descargable. Requisitos fiscales definidos con asesoría antes de llamarlo factura fiscal. Pagos manuales son suficientes para primeros pilotos si se cumple SLA; pasarela automática es P2.
3. **Uso y vigencia:** contadores consistentes de programas/eventos, participantes, estaciones y usuarios; alertas; transición de contrato; ventana operativa protegida; lectura y exportación al terminar.
4. **Activación y preparación:** asistente “registro sencillo / foro / exposición / programa”, progreso, requisitos de impresión, responsables, capacitación y acta de aceptación. Extender checklist técnico con preparación contractual/operativa sin confundir “configurado” con “probado”.
5. **Gestión comercial de plataforma:** solicitudes demo/cotización, etapa, responsable, fecha de próxima acción, volumen, necesidad de impresión y fuente; conversión a cliente sin mezclar leads captados por organizaciones.
6. **Éxito del cliente y soporte:** tickets con cliente/evento/severidad, estados, turno y registro de intervenciones; operaciones de soporte con acceso temporal y auditado. Separar permiso de soporte de aprobar pagos y editar precios al incorporar personal.

## Hoja de ruta y condiciones de lanzamiento

| Etapa propuesta | Entregable | Condición verificable de salida | Responsable funcional |
|---|---|---|---|
| P0, antes de nueva venta | C01–C07, coherencia de compra/renovación y contrato por evento | Dos organizaciones, dos roles y pruebas de vencimiento, manipulación de importe y cambio de plan pasan; cliente puede pagar el plan inicial | Producto + desarrollo + finanzas |
| P0, antes de vender impresión | C16, homologación del recinto y política de datos | Prueba física del modelo real, lote >20, reinicio/cierre de página, vínculo renovado, comprobación Windows y contingencia documentados | Operaciones + cliente |
| P1, preparación del piloto | C08–C15/C17, términos, catálogo y seguimiento | Propuesta y UI coinciden; cliente termina alta guiada; tablero pagos y responsable de soporte disponibles | Comercial + producto |
| Pilotos pagados | 2–3 eventos de alcance controlado | Sin incidente crítico pendiente; acta de aceptación, costo real, tiempo de cola y encuesta; permiso para usar caso comercial | Gerencia + operaciones |
| Lanzamiento segmentado | Landing con ofertas verificadas, demo y proceso de cotización | Canal de demo produce leads trazables; equipo puede atender capacidad comprometida; rollback/restore ensayados y publicación reproducible | Comercial + desarrollo |
| P2, después de datos del piloto | Pasarela, integraciones, CRM avanzado, automatización de onboarding y reporte ejecutivo | Inversión priorizada por demanda pagada, ahorro de soporte y margen; no por número de funciones | Gerencia |

Los plazos dependen de estimación técnica y disponibilidad de hardware. No comprometer una fecha pública automática. El evento del 15 de octubre citado en documentos requiere confirmar calendario real y preparación; esta evaluación no certifica que esté listo.

## Preparación operativa mínima

- Ficha de compatibilidad por modelo de impresora/controlador, PDF/material/tamaño, Windows y navegador; instalación del conector desde Centro de impresión y prueba supervisada.
- Ensayo de llegada pico: medir tiempo completo búsqueda/walk-in, impresión, entrega y cola, no sólo velocidad anunciada de impresora. Estaciones necesarias = llegadas por minuto × tiempo medio de servicio en minutos / utilización objetivo; probar el resultado con margen para variabilidad y fallas.
- Conectividad principal y respaldo, equipo/impresora de reemplazo y credenciales preimpresas o listado mínimo acordado. No prometer offline sin recorrido probado. Definir custodia y eliminación de copias de contingencia.
- Congelamiento de plantilla/plano/formulario y cierre de importaciones; responsables cliente/plataforma, entrenamiento, turno de soporte y canal único.
- Severidad crítica: acceso/registro/impresión detenidos o datos expuestos. Ventana y tiempo de respuesta se pactan por contrato; propuesta piloto: atención en 15 minutos durante turno reservado, solución/restauración sin tiempo garantizado hasta demostrar capacidad. Otros incidentes: un día laboral. No ofrecer 24/7 sin cobertura real.
- Publicación coordinada frontend/Worker/migraciones/conector; checklist y rollback; resolver permiso del workflow pendiente. Ensayo restauración y pruebas con esquema completo de QA, no sólo dependencias simuladas.

## Métricas gerenciales y comerciales

| Métrica | Definición y acción |
|---|---|
| Conversión comercial | Demos realizadas → propuestas → contratos → pagos; segmentar por tipo/tamaño de evento. Medir por cohorte, sin inventar objetivo hasta obtener base. |
| Tiempo de activación | Confirmación de cuenta hasta primer evento publicable y primer registro real. Meta propuesta: configuración sencilla guiada en menos de 30 minutos, validada con usuarios nuevos. |
| Cobro | Tiempo solicitud→conciliación; pendientes >SLA; pagos rechazados por causa. Objetivo propuesto: resolver 95% en un día laboral fuera de turno especial. |
| MRR / ingresos proyecto | MRR sólo contratos recurrentes activos; separar efectivo cobrado y licencias por evento. Nunca annualizar pilotos como si fueran recurrencia. |
| Renovación y churn | Contratos elegibles que renuevan; organizaciones e ingreso recurrente perdido. Para evento: repetición de siguiente edición, no “churn mensual”. |
| Margen por evento/cliente | Ingreso neto menos costo incremental y horas reales; identificar soporte que debe cotizarse. |
| Calidad operacional | Fallas de registro/acceso, impresiones físicas válidas, duplicados, minutos de cola, reimpresiones por causa y tiempo de recuperación. |
| Valor expositor | Expositores activados, perfiles publicados, visitantes únicos con permiso para compartir y exportaciones; nunca equiparar escaneos con ventas o ROI. |
| Soporte | Tickets/100 participantes y horas por cliente, repetición de causa y cumplimiento del turno. |
| Satisfacción | Encuesta de organizador y expositores, incidencias y disposición a renovar; testimonio sólo autorizado. |

## Recomendación comercial final

Vender un resultado delimitado: “registro y acreditación conectados con la exposición, con operación acompañada y alcance contratado”. Demostrar el recorrido completo organizador–asistente–expositor usando datos sintéticos. Construir tres demos por escenario y un caso real autorizado antes de invertir en publicidad amplia.

El siguiente trabajo debe empezar por C01–C07 y C16, convertir la matriz propuesta en catálogo aprobado y desarrollar derechos/cobro. Después, ejecutar el piloto físico y documentar costos. Las demás funciones ya existentes aportan diferenciación, pero añadir módulos sin resolver contratación y servicio aumentaría la complejidad de venta.
