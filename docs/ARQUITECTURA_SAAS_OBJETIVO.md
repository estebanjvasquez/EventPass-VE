# Arquitectura de eventos objetivo — preparación para octubre

**Estado:** propuesta para aprobación · **Fecha objetivo:** 15 de octubre de 2026

## Decisión de alcance

El release de octubre se enfoca en la plataforma para eventos: foro,
exposición, stands, participantes, acreditación y circulación entre áreas. La
jerarquía interna de roles del SaaS (operaciones, soporte, administración,
marketing y ventas) se aplaza a una versión posterior. Se conserva el
superadmin actual para administrar la plataforma.

El cliente define para cada programa fecha, sede, aforo, número de foros,
stands, días, sesiones y reglas de acceso. La fecha del primer evento es el 15
de octubre de 2026.

## Programa de evento: foro + exposición

Un cliente podrá trabajar de dos maneras compatibles:

1. **Programa único:** un evento principal con componentes de foro, exposición,
   sesiones, zonas y stands.
2. **Eventos vinculados:** varios eventos independientes (por ejemplo, Foro
   Anual y Expo Comercial) unidos por un `event_program`.

La persona se identifica una sola vez a nivel de programa. Sus inscripciones,
pases y movimientos se registran por componente/evento. Puede entrar al foro y
luego a la exposición sin duplicar su identidad ni perder trazabilidad.

## Mapas y asignaciones

El mapa actual es una cuadrícula de asientos por evento; no puede representar
stands ni un plano de recinto. Debe evolucionar a un plano con elementos
tipados:

| Elemento | Uso |
| --- | --- |
| `seat` | Butaca/asiento de foro; se reserva a una persona. |
| `stand` | Espacio comercial; se asigna a una empresa o expositor. |
| `zone` | Área general, VIP, seguridad, backstage o exposición. |
| `stage` / `aisle` | Elementos visuales no reservables. |
| `access_point` | Puerta o punto físico de check-in. |

Los stands incluyen tamaño, posición, estado, precio/contrato, empresa
responsable y productos/servicios. Cada plano pertenece a un evento o componente
del programa y no se comparte entre tenants.

La venta y el cobro de stands, productos y servicios se gestionan externamente
por el cliente en octubre. EventPass conserva la empresa, stand u oferta
asignada, estado administrativo y referencia externa, pero no procesa la
transacción comercial.

## Registro online y perfil de participante

El programa tendrá una URL pública de registro. El formulario crea o reutiliza
una única `person` a nivel de programa y después crea la participación/pase
para foro, exposición o ambos según las reglas del cliente.

### Datos base

- Nombre, apellido, correo, teléfono y cédula/documento cuando corresponda.
- Empresa/organización, cargo, ciudad/país y consentimiento de privacidad.
- Tipo de participación y selección de pase/actividades permitidas.

### Perfil por tipo

El cliente podrá habilitar tipos públicos y campos condicionales por programa.

| Perfil | Campos y regla propuesta |
| --- | --- |
| Asistente | Datos base, intereses y pases/sesiones elegibles. |
| Invitado / VIP | Datos base y referencia de invitación; puede requerir aprobación. |
| Ponente | Biografía, empresa, cargo, foto, redes y sesiones asignadas. |
| Expositor | Empresa, contacto, stand asignado y productos/servicios mostrados. |
| Staff / seguridad | Alta por invitación administrativa; no es un perfil público libre. |

El formulario se configura por programa/evento sin código: campos obligatorios,
visibilidad, opciones, cupos y aprobación. Una RPC validará el tipo público,
el pase seleccionado, límites y duplicados antes de crear la participación. Los
perfiles internos se crean por un administrador o invitación de un solo uso.

## Reglas de acceso y movilidad

Cada pase o inscripción tendrá reglas que el cliente elige:

- **evento completo:** acceso a todas las zonas autorizadas durante el programa;
- **día:** acceso a una o más fechas;
- **sesión:** acceso a foros, talleres o actividades concretas;
- **zona/componente:** acceso al foro, exposición, VIP, backstage u otra área.

El escaneo valida evento, día, sesión, zona y punto de acceso. Se registra en
`checkin_records`, por lo que el movimiento foro ↔ exposición queda en el
historial y no sobrescribe el estado anterior. Las transferencias manuales se
permiten a usuarios autorizados y guardan motivo/auditoría.

## Acceso de tenant para octubre

Se mantiene el modelo de tenant y se añade alcance por evento, necesario para
la operación onsite:

- **tenant completo:** acceso a todos sus eventos;
- **eventos específicos:** lista explícita de eventos;
- **operación onsite:** solo evento, zonas o puntos de acceso asignados.

Permisos iniciales: `events.manage`, `participants.read`,
`participants.manage`, `checkin.perform`, `badges.print`, `partners.manage`,
`catalog.manage`, `sales.manage` y `team.manage`.

## Modelo de dominio objetivo

| Dominio | Entidades nuevas o ampliadas | Propósito |
| --- | --- | --- |
| Programa | `event_programs`, `program_events`, `sessions`, `event_zones`, `access_rules`, `passes`, `pass_entitlements` | Vincula foro/exposición y expresa reglas por evento, día, sesión o zona. |
| Personas | `people`, `event_participations`, `participation_types`, `participant_transfers` | Una persona puede ser asistente, invitado, ponente, expositor, staff o seguridad, y moverse entre componentes. |
| Comercial | `companies`, `event_partners`, `booths`, `venue_map_elements`, `catalog_items`, `event_offerings`, `orders`, `order_items` | Gestiona patrocinantes, stands, productos y servicios por tenant, tipo de evento y evento. |
| Onsite | `badge_templates`, `badge_prints`, `checkin_devices`, `checkin_records`, `access_points` | Check-in auditable, dispositivos autorizados, reimpresiones y control por acceso. |

`registrations` se conserva durante la transición, pero se relacionará con
`people` y con la participación/pase del programa. `attendance_status` será
una proyección rápida y no la única evidencia de acceso.

## Entrega por fases

### Fase 0 — Diseño y transición

- Diseñar migraciones idempotentes sin romper el registro actual.
- Definir los tipos de participante, zonas, pases y reglas configurables.
- Inventariar dispositivos, impresoras y puntos de entrada.

### Fase 1 — Programa, accesos y operación onsite (bloqueante)

- Programa que vincule foro y exposición.
- Roles de tenant con alcance por evento/zona y rol mínimo de check-in.
- Pases por evento completo, día, sesión y zona.
- Registro público online por programa con perfil de participante, campos
  configurables y creación de pases elegibles.
- Check-in por evento/punto de acceso e historial de escaneos/denegaciones.
- Gafetes por tipo de participante y reimpresión auditada.
- Prueba de dispositivos, impresora y contingencia de conectividad.

### Fase 2 — Agenda, exposición y planos (necesaria para octubre)

- Directorio de personas y perfiles múltiples.
- Foros, sesiones, exposiciones y capacidad/acceso por actividad.
- Editor de plano con asientos, zonas y stands.
- Asignación de stands a empresas/expositores.

### Fase 3 — Comercial (necesaria si se comercializan stands)

- Empresas, patrocinantes, expositores y compradores de stand.
- Catálogo de productos/servicios por tenant, tipo de evento y evento.
- Estado administrativo, referencia externa, contratos/comprobantes y entrega;
  el cobro se realiza fuera de EventPass.

## Criterios de salida para el 15 de octubre

- Un usuario de check-in no puede consultar ni modificar otro evento o zona.
- Cada acceso y reimpresión contiene usuario, dispositivo, hora y resultado.
- Un participante autorizado puede pasar entre foro y exposición con trazabilidad.
- Los perfiles de participante imprimen el identificativo correcto.
- El registro público crea el perfil y pase correctos sin permitir que una
  persona se autoasigne perfiles internos.
- Los stands, productos y servicios permanecen aislados por tenant y asociados
  al evento correspondiente.
- Existe una contingencia de conectividad probada para el acceso onsite.

## Pendiente de decisión

Definir el conjunto inicial de campos obligatorios y qué perfiles serán públicos
en el formulario del evento.
