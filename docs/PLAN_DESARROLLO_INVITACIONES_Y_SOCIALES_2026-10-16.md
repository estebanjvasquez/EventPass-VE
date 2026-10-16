# Plan de desarrollo: invitaciones privadas y eventos sociales

Fecha: 16 de octubre de 2026. Base: análisis comercial revisado y respuestas del usuario. Es un plan de trabajo; no implementa módulos ni modifica contratos, precios o datos de clientes.

Estado posterior: se desarrolló la versión inicial de las fases 0–6. Consultar [entrega, cobertura y guía de pruebas](ENTREGA_INVITACIONES_SOCIALES_OPERACION_2026-10-16.md) para distinguir funcionalidades implementadas, ampliaciones excluidas y validación comercial todavía pendiente.

## 1. Objetivo y criterio de prioridad

Incorporar un motor común de invitaciones privadas y dos recorridos operativos: **foros/exposiciones por invitación** y **bodas/eventos sociales de alto nivel**.

El objetivo inicial es que las dos empresas puedan revisar un sistema demostrable, detectar mejoras y evaluar una adquisición. Ninguna ha comprometido fecha, compra, presupuesto ni piloto en un evento real. Por ello, las primeras validaciones serán demostraciones guiadas con datos sintéticos; no se condiciona el desarrollo a conseguir una fecha de evento, ni se contabilizan esas revisiones como ventas.

Orden propuesto: núcleo y recorrido B2B acotado, donde las reglas previas están más definidas; después recorrido social mínimo, sin relegarlo al final del producto. Validar diseño y lenguaje social desde el comienzo. Producción/proveedores y finanzas del organizador se desarrollan después de las primeras revisiones; ticketing público queda fuera de esta entrega.

## 2. Reglas confirmadas por el usuario

| Regla | Consecuencia de producto |
|---|---|
| Cada código admite un único registro | Un código no es una bolsa reutilizable ni un código promocional. |
| Al registrarse queda bloqueado y asociado al participante | Canje y alta se confirman en una sola transacción; no se reutiliza el código consumido. |
| El organizador decide transferencias de códigos disponibles | Solo el organizador autorizado puede reasignar inventario no canjeado; queda historial. El invitador no transfiere cupos por su cuenta. |
| Expositores, patrocinantes y ponentes distribuyen sus códigos | Portal o sección de invitaciones con permisos propios y contadores por invitador. |
| Las cantidades dependían del stand y del patrocinio | Asignaciones con origen y beneficios explícitos; primero manuales, después reglas configurables. No inferir cantidades desde el dibujo del plano. |
| Los códigos diferenciaban exposición, foro y VIP | Derechos explícitos por alcance. «VIP» no implica acceso universal automáticamente. |
| La empresa social puede revisar y dar feedback | Preparar una demostración de hogares, acompañantes, RSVP y mesas; no anunciar un evento real comprometido. |
| Ambas oportunidades son evaluaciones previas a una compra | Registrar observaciones y señales de intención de compra sin inventar resultados comerciales. |

Que el evento no sea de registro público libre no significa que el invitado necesariamente pague. Este flujo habilita el registro mediante autorización; no añade un cobro ni una pasarela.

## 3. Base existente y brechas que condicionan el trabajo

- Reutilizar organizaciones, eventos/programas, participantes, credenciales, impresión, accesos, expositores, patrocinio y permisos actuales.
- `registration_mode='invitation'` bloquea el registro público, pero falta el motor de emisión y canje de códigos de asistentes. No reutilizar invitaciones de cuentas o del portal como invitaciones para participantes.
- Hay zonas y derechos por evento/sesión/fecha en programas. Integrarlos sin crear un segundo sistema incompatible de permisos ni confiar en el tipo VIP enviado desde el navegador.
- La identidad y las cuotas existentes usan correo en varios caminos. Hogares, menores y acompañantes sin correo propio requieren un diseño explícito; no asignar el mismo email como identidad de todos ni generar correos ficticios.
- Los mapas/asientos actuales no acreditan un flujo completo de mesas, hogares y protocolo de bodas. Reutilizar componentes visuales donde encajen, sin renombrar sillas de foro y dar el problema por resuelto.
- La caja comercial actual es del superadmin y contratos de la plataforma. No sirve como presupuesto privado del organizador: esa ampliación tendrá dominio y permisos separados.
- No se promete acceso offline, WhatsApp automatizado, facturación fiscal ni conciliación bancaria como resultado de estas fases.

## 4. Entregas y dependencias

Las fases expresan orden y criterios de salida, no fechas comprometidas. Estimar esfuerzo al cerrar la primera fase; las revisiones externas dependen de disponibilidad de las empresas. Se puede avanzar con pruebas internas cuando no estén disponibles, sin marcar su aceptación como recibida.

| Fase | Entrega | Depende de | Criterio de salida |
|---|---|---|---|
| 0 | Reglas operativas, matriz de acceso y prototipos B2B/social | Respuestas actuales y revisión del código | Reglas confirmadas separadas de decisiones abiertas; casos de demostración y backlog priorizado. |
| 1 | Motor de códigos individuales, asignaciones y canje privado | 0 | Código válido produce un solo participante autorizado; transacciones, reintentos y permisos probados. |
| 2 | Portal del invitador y beneficios B2B | 1 | Organizador asigna; invitador distribuye; asistente canjea; accesos y reporte concilian. Primera demostración B2B. |
| 3 | Hogares, acompañantes y RSVP social | 1; integración con identidad existente | Confirmación individual sin exceder cupo, incluso sin correo por integrante. Primera demostración social. |
| 4 | Mesas, protocolo y listado operativo | 3 | Asignaciones con capacidad, cambios auditados y permisos; revisión por la empresa social. |
| 5 | Validación conjunta, correcciones y preparación comercial | 2–4 | Escenarios reproducibles, observaciones clasificadas, pruebas completas y alcance vendible documentado. |
| 6 | Producción/proveedores y presupuesto del organizador | Evidencia de 5 | Alcance seleccionado por necesidad observada; permisos y métricas separados de la plataforma. |

La fase 3 no espera a terminar la fase 6. El diseño social se presenta en fase 0 y su primera versión navegable llega antes de un ERP de producción o finanzas.

## 5. Backlog funcional y técnico por fase

### Fase 0 — Cerrar reglas y preparar la demostración

- **P0-01.** Documentar el recorrido organizador → invitador → invitado → registro → credencial → acceso y el recorrido planner → hogar → respuestas → mesas → ingreso.
- **P0-02.** Definir una matriz de exposición, foro, sesiones, fechas y zona VIP. Una invitación podrá autorizar una combinación explícita; ningún permiso se deduce de la etiqueta VIP.
- **P0-03.** Resolver reserva de aforo, cancelaciones y visibilidad de datos. Las preguntas pendientes están al final; no se exige repetir las respuestas ya confirmadas.
- **P0-04.** Preparar dos juegos de datos sintéticos: exposición con foro y tres clases de acceso; boda con hogares, integrantes y acompañantes. No usar listas reales sin autorización.
- **P0-05.** Revisar todos los caminos de alta, importación, registro conjunto, recuperación, credencial y check-in. Identificar puntos donde se debe exigir la autorización privada y evitar que una ruta pública o una importación eluda el código.
- **P0-06.** Definir el perfil operativo social sin romper los tipos, rutas y contratos de eventos actuales. Un perfil social no debe cambiar silenciosamente un evento ya configurado como foro/exposición.

### Fase 1 — Núcleo de invitaciones privadas

- **INV-01. Asignaciones.** Crear asignaciones por edición y responsable, con cantidad, derechos, vigencia, origen y autor. Separar cupo asignado, códigos vigentes y canjes; generar más códigos no incrementa la asignación.
- **INV-02. Emisión segura.** Generar códigos impredecibles y enlaces privados. Guardar hash del secreto y mostrar/descargar el lote de forma controlada al emitirlo. Definir recuperación o revocación/reemisión de un lote perdido, sin prometer recuperar texto original desde su hash. Evitar secretos en logs, analítica y reportes generales.
- **INV-03. Canje transaccional.** Validar organización, edición, estado, vigencia, alcance, capacidad y cuota SaaS; crear o enlazar la identidad/participación; asociar el código al participante y marcarlo consumido en una única operación. Un fallo no consume código ni aforo. Dos personas compitiendo por el mismo código no pueden registrarse ambas.
- **INV-04. Reintentos y recuperación.** La misma solicitud autorizada repetida no duplica registro. Conocer un código ya usado no concede acceso al perfil ni a la credencial de otra persona. Reutilizar recuperación verificada cuando aplique y diseñar recuperación por representante para el flujo social.
- **INV-05. Transferencias.** El organizador puede mover solo códigos/asignaciones disponibles. Cuando un secreto ya salió del sistema, la transferencia debe invalidar el código anterior y emitir otro para el nuevo responsable, conservando la cadena de auditoría. El código canjeado permanece ligado a su participante.
- **INV-06. Revocación y vencimiento.** Revocar códigos no usados con motivo y reporte. Cambiar o cancelar una participación registrada requiere una operación distinta, con política de liberación de aforo y anulación de credencial; nunca reabrir automáticamente el código consumido.
- **INV-07. Derechos.** Persistir la autorización efectiva y conectarla con los controles actuales de exposición, foro y zona VIP, incluyendo credencial digital, impresa y escaneo. Canjear una invitación para exposición no debe habilitar el foro.
- **INV-08. Privacidad del evento.** Revisar catálogo, landing, búsquedas, archivos públicos y enlaces: cerrar el registro no garantiza ocultar un evento social privado. Separar visibilidad del evento de modalidad de registro.
- **INV-09. Permisos y auditoría.** Organizador administra; invitador solo opera su asignación; puerta solo verifica lo operativo; superadmin conserva su contexto global; soporte no recibe permisos nuevos implícitamente. Todos los endpoints y tablas deben aislar organización y edición.

Estados mínimos propuestos del código: **disponible, canjeado, revocado o vencido**. Destinatario, distribución y RSVP son datos/estados separados: enviar un enlace no significa confirmación ni asistencia. Una transferencia revoca el secreto anterior y relaciona su reemplazo; no borra la historia.

### Fase 2 — Recorrido de foros y exposiciones

- **B2B-01. Panel organizador.** Crear asignaciones para expositor, patrocinante, ponente u organizador; configurar exposición/foro/VIP y vigencia. Primera versión con aprobación manual, aunque exista un paquete que sugiera cantidad.
- **B2B-02. Portal del invitador.** Integrar con el portal de expositores donde corresponda. Patrocinantes y ponentes tienen acceso limitado propio, sin convertirlos en administradores de la organización. Mostrar cantidad asignada, disponible, distribuida declarada, canjeada, revocada y asistencia autorizada.
- **B2B-03. Distribución.** Compartir enlace/código o descargar lote de manera autorizada. Distinguir «marcado como entregado» de entrega acreditada por un proveedor. No enviar mensajes ni campañas a terceros como parte de las pruebas.
- **B2B-04. Beneficios por stand/paquete.** Después de comprobar el flujo manual, configurar reglas por categoría/tamaño de stand o paquete, con una instantánea aprobada de la cantidad. Un cambio de paquete no aumenta, reduce ni cancela invitaciones existentes sin revisión del organizador.
- **B2B-05. Evitar doble asignación.** Definir si stand y patrocinio acumulan beneficios y cómo se separan pases de personal e invitaciones a visitantes. Prohibir bajar una asignación por debajo de lo ya comprometido sin resolver antes los códigos no canjeados afectados.
- **B2B-06. Reportes.** Conciliar asignación → códigos → canjes → participantes → asistencia, con filtros por invitador, origen y acceso. La atribución al invitador no es consentimiento de marketing ni permiso para exportar toda la base.

**Demostración revisable B2B:** organizador asigna a un expositor y un patrocinante, ambos distribuyen códigos; un invitado se registra; otro intenta repetir el código y se rechaza; el organizador transfiere un disponible; se valida exposición/foro/VIP por separado y se revisa el reporte.

### Fase 3 — Hogares, acompañantes y RSVP social

- **SOC-01. Lista privada.** Crear hogares/grupos con contacto representante y personas integrantes. Importación con vista previa y tratamiento de duplicados; no unir automáticamente personas porque compartan correo, apellido o teléfono.
- **SOC-02. Identidad sin correo individual.** Utilizar identidad interna estable por persona y separar sus medios de contacto. Revisar deduplicación, recuperación y contadores actuales sin debilitar las reglas de los registros públicos existentes.
- **SOC-03. Invitaciones por integrante.** Mantener un derecho individual por persona. Un enlace de hogar puede permitir gestionar varias respuestas, pero no es un código de registro reutilizable: cada integrante conserva su invitación/canje individual y su historial.
- **SOC-04. Acompañantes.** Cupo máximo decidido por planner/organizador; identificar después al acompañante si se permite. No crear plazas adicionales al responder ni requerir correos ficticios para niños o personas sin email.
- **SOC-05. RSVP.** Aceptar/declinar por integrante; distinguir no respondió, aceptó, declinó, registrado y asistió. La respuesta de un hogar no confirma automáticamente a todos. Registrar quién cambió la respuesta y cuándo.
- **SOC-06. Operación del planner.** Fecha límite, seguimiento de pendientes y correcciones autorizadas. Definir qué puede cambiar el representante y qué queda reservado al planner. Alergias, accesibilidad o datos de menores solo si son necesarios y con acceso restringido.
- **SOC-07. Experiencia móvil.** Página de invitación con lenguaje social y marca del evento, privacidad de listas y recuperación del contacto. Correo y enlaces compartibles primero; integración automatizada de WhatsApp queda sujeta a canal y autorización específicos.

**Demostración revisable social:** el planner configura hogares de una, dos y varias personas; el representante confirma algunos integrantes, declina otro e identifica un acompañante dentro del cupo. Se corrige una respuesta y se verifica que identidad, cantidades y permisos permanecen coherentes.

### Fase 4 — Mesas y protocolo mínimo

- **MES-01.** Mesas con nombre, capacidad y estado; asignación de personas y visualización del hogar, sin obligar a sentar junto a todo el grupo.
- **MES-02.** Cambios auditados y bloqueo de sobreocupación, incluso con dos operadores simultáneos. Separar persona confirmada, plaza reservada y asiento efectivamente asignado según la política acordada.
- **MES-03.** Listado operativo de búsqueda e ingreso, con mesa y asiento opcional; acceso del personal a los datos estrictamente necesarios.
- **MES-04.** Primera versión mediante lista y distribución asistida. Editor visual avanzado, plantillas complejas, precedencias y automatización de protocolo se priorizan con feedback de la empresa, no por similitud aparente con un plano de foro.
- **MES-05.** Vista de pareja/anfitrión únicamente si la empresa la necesita, con permisos delimitados; el acceso de un anfitrión no equivale al de planner ni proveedor.

**Demostración revisable de mesas:** asignar invitados confirmados, mover una persona, resolver una cancelación y mostrar que no se sobrepasan capacidades ni se exponen notas privadas en puerta.

### Fase 5 — Revisión por las empresas y preparación comercial

- Publicar una versión de demostración separada de la operación real, con reinicio de datos de ensayo y cuentas por rol. Sin contactos reales ni envíos masivos.
- Entregar un guion de tareas, no solo una presentación. Registrar: tarea completada, error, tiempo observado, necesidad faltante y sugerencia. Distinguir defecto, regla de negocio y preferencia visual.
- Hacer una revisión B2B y otra social cuando sus responsables estén disponibles. Si no participan, registrar «revisión pendiente», no «validado por el cliente».
- Corregir bloqueos comunes primero y después necesidades específicas. Revisar con cada empresa qué alcance probaría, quién lo operaría y bajo qué condiciones compraría.
- Preparar manual, soporte, restauración, consentimiento/retención, contingencia y ensayo físico. Una demostración aceptada no habilita por sí sola el uso en un evento real.
- Mantener las ofertas versionadas existentes. Definir módulos, límites y precio cuando el alcance esté probado; no alterar automáticamente los contratos actuales ni tratar un cupo de invitación como otra licencia SaaS.

### Fase 6 — Ampliaciones posteriores condicionadas a demanda

1. **Producción/proveedores:** tareas, responsables, fechas, dependencias, confirmaciones y cambios de montaje; vistas por área y proveedor. No confundir agenda pública con cronograma de producción.
2. **Presupuesto del organizador:** partidas/versiones, comprometido/devengado/pagado, proveedores y caja; moneda original, tasa histórica, fuente, fecha y revisión. Dominio aislado de la caja comercial del superadmin.
3. **Otros módulos:** certificados, resiliencia/offline, pasarelas o ticketing solo después de precisar necesidad, proveedor, riesgos y validación. No forman parte del MVP de invitaciones/sociales.

## 6. Modelo conceptual e integración propuesta

Los nombres siguientes son orientativos; no son migraciones aprobadas ni tablas que se afirme que ya existen.

| Entidad | Responsabilidad |
|---|---|
| Invitador y sus usuarios autorizados | Identificar quién distribuye, separado de la identidad del participante y de la membresía global de organización. |
| Asignación | Cantidad, vigencia, origen stand/paquete/acuerdo, responsable y derechos aprobados. |
| Invitación/código | Secreto seguro, estado individual, asignación de origen y relación con reemplazos. |
| Canje | Unicidad del código, participante asociado, solicitud idempotente y fecha. |
| Autorización de acceso | Evento/componente/zona/fecha efectivos; adaptar a derechos actuales y validación en puerta. |
| Hogar/grupo e integrante | Relación social y contacto representante; no sustituye la identidad individual. |
| Respuesta RSVP | Estado por persona y registro de cambios, separado de canje y asistencia. |
| Mesa/asignación | Capacidad, persona y asiento opcional, separado del estado RSVP. |
| Historial de operaciones | Emisión, distribución declarada, canje, transferencia/reemplazo, revocación y cambios de derechos. |

Todo dato debe incluir o resolver de forma inequívoca organización y edición. En programas vinculados, una invitación se consume una sola vez y produce los derechos explícitos; no se recanjea el mismo código para cada componente. La proyección a registros/participaciones debe conservar una persona coherente y respetar el conteo vigente.

La nueva emisión, canje y transferencia necesitan controles en servidor, RLS y pruebas de permisos: las pantallas no son la barrera de seguridad. Los módulos comerciales nuevos requieren permisos y límites explícitos; no basta crear tablas y asumir que los guards instalados en migraciones anteriores las cubrirán automáticamente.

## 7. Pruebas y criterios de aceptación transversales

| Caso | Resultado exigido |
|---|---|
| Dos solicitudes distintas canjean simultáneamente un código | Un único participante asociado; la otra solicitud no obtiene datos privados. |
| La misma solicitud reintenta tras perder respuesta | No duplica persona, registro, consumo ni credencial. |
| Falla una parte del alta o no hay aforo/cuota | Transacción revertida; no deja código consumido ni reserva huérfana. |
| Invitador intenta aumentar, transferir o consultar otra bolsa | Denegación y sin cambio de datos. |
| Organizador transfiere un código disponible ya distribuido | El secreto anterior queda inválido; reemplazo y origen trazables. |
| Código usado, revocado o vencido | No genera otro registro ni habilita recuperación de otra persona. |
| Exposición, foro y VIP | Se aplican solo los derechos configurados en enlace, credencial digital/impresa y check-in. |
| Cambia el catálogo de patrocinio/stand | No altera asignaciones y canjes previos silenciosamente. |
| Varios integrantes comparten correo o no tienen correo | Personas distintas, respuestas correctas y sin colisiones artificiales. |
| Hogar intenta agregar más acompañantes | No sobrepasa el cupo autorizado, incluso con respuestas simultáneas. |
| Dos planners completan una mesa a la vez | Capacidad respetada y conflicto visible. |
| Usuario, organización o evento ajenos | Sin lecturas ni escrituras cruzadas; se mantiene separación de superadmin y cliente. |
| Evento social privado y enlaces compartidos | No se publica la lista de invitados ni se filtran datos mediante catálogo, archivos o recuperación. |
| Registro público gratuito o pago existente | Conserva su comportamiento; el nuevo flujo no lo convierte accidentalmente en privado ni lo elude. |

Verificar en base de datos y navegador, incluida concurrencia con PostgreSQL real, móviles y recuperación. Para un evento real añadir impresión, dispositivos, red y aforo del recinto. El software no puede marcar un ensayo físico como completado por aceptar un trabajo en la cola de Windows.

## 8. Decisiones todavía abiertas y propuestas de trabajo

No repetir como duda lo ya confirmado: el código es individual y el canje lo bloquea. Faltan estas políticas:

| Decisión | Propuesta inicial para evaluar, no regla confirmada |
|---|---|
| ¿La asignación/emisión reserva aforo o solo el canje? | Distinguir reserva de inventario de invitaciones y reserva física; elegir una política visible antes de emitir lotes reales. El MVP debe comprobar capacidad al canjear en cualquier caso. |
| ¿Puede el invitador ver identidad y contactos del canjeado? | Contadores y trazabilidad propia por defecto; datos personales mínimos según autorización del organizador. Sin exportación de marketing implícita. |
| ¿Cómo se cancelan/sustituyen registros ya canjeados? | Código consumido no reutilizable; sustitución administrativa con historia e invalidación de credencial anterior, según política de aforo aprobada. |
| ¿VIP incluye exposición, foro o ambos? | Matriz explícita de derechos por evento; nada se hereda solo por el nombre. |
| ¿Se suman beneficios de stand y patrocinio? | Asignaciones separadas y aprobación del organizador hasta acordar la regla comercial. |
| ¿Quién responde por un hogar y hasta cuándo? | Representante autorizado y planner; respuesta por integrante y fecha límite configurable. Revisar con la empresa social. |
| ¿Se necesitan asientos individuales o basta mesa? | Mesa con capacidad como primera entrega; asiento y editor avanzado solo si la revisión los exige. |

Estas decisiones se pueden cerrar con escenarios escritos y datos sintéticos aunque todavía no exista fecha de evento. Las que afecten seguridad, aforo o quién puede modificar registros deben quedar resueltas antes de usar el flujo con participantes reales.

## 9. Primera iteración recomendada

Construir **asignación manual + códigos individuales + canje atómico + acceso diferenciado + reporte por invitador**. En paralelo de diseño —sin abrir un segundo producto completo— preparar y revisar el prototipo de hogares/RSVP con la empresa social. Después implementar el recorrido social sobre el mismo motor y mesas mínimas.

No añadir aún motor universal de reglas de patrocinio, ERP de boda, venta de entradas, pasarela, editor complejo ni envío automático por WhatsApp. La primera entrega debe poder demostrarse de extremo a extremo y sus pendientes quedar identificados, sin depender de una supuesta compra o fecha de piloto.

## 10. Trazabilidad documental

- [Estrategia comercial actualizada](ESTRATEGIA_B2B_VENEZUELA_2026-10-16.md).
- [Cobertura de la revisión comercial](COBERTURA_REVISION_COMERCIAL_2026-10-14.md).
- [Gestión comercial de plataforma y caja](GESTION_COMERCIAL_ETAPA3_2026-10-15.md).

Este plan incorpora las respuestas del usuario y reemplaza, para este alcance, las preguntas sobre códigos multicanje y las suposiciones de pilotos o fechas comprometidas del análisis previo.
