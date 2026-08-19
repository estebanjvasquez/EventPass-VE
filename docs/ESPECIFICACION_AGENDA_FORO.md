# Especificación — Agenda / Schedule del Foro (paridad Eventee)

**Autor:** Esteban Vásquez · **Fecha:** 2026-08-19
**Estado:** propuesta lista para implementar — Fase 1.
**Referencia analizada:** Eventee Admin (`admin.eventee.com`), módulo *Content* (Schedule / Sessions / Speakers / Partners), evento de prueba "Expor Petroleo 2026".

Este documento traduce lo encontrado en Eventee al modelo y convenciones **ya existentes** en EventPass VE. **No** parte de cero: la base de datos ya tiene `event_sessions`, `people`, `event_participations` (con rol `speaker`), `companies`, `event_zones` (kind `forum`) y `passes` con `access_mode='session'`. Esta spec **extiende** ese modelo para darle horario visual, escenarios, ponentes y tipos de sesión.

---

## 1. Contexto: qué ya existe vs. qué falta

| Pieza | Estado actual en EventPass | Acción |
|---|---|---|
| Evento tipo **foro** | `events.event_type = 'forum'` (enum ya definido) | Reusar |
| **Sesiones** | Tabla `event_sessions` existe (`name, description, starts_at, ends_at, capacity`), pero la UI (`ProgramaAccesosAdmin`) solo crea el **nombre** para pases de acceso | Extender columnas + UI de horario |
| **Escenarios/foros** ("Stage") | No existe como tabla propia; `venue_map_elements` admite `element_type='stage'` (visual) y `event_zones.kind='forum'` (lógico) | **Nueva tabla `event_stages`** |
| **Ponentes** | `people` + `event_participations.participation_type='speaker'`; sin bio/foto/redes | **Nueva tabla `event_speakers`** (perfil de presentación por evento) |
| Sesión ↔ Ponente | No existe | **Nueva tabla `session_speakers`** (M:N) |
| Tipos de sesión | No existe | Columna `session_type` en `event_sessions` |
| **Coffee breaks** | No existe | `session_type = 'break'` |
| **Partners** (patrocinadores/expositores) | Tabla `companies` (`kind in partner/sponsor/exhibitor/buyer`) | Reusar (ya cubierto) |
| Acceso por sesión (pases) | `passes.access_mode='session'` + `pass_entitlements.session_id` ya existen | Reusar |
| Registro / asistentes | `event_participations`, RPC `register_program_participant` | Reusar |

**Conclusión:** la Fase 1 es una migración incremental + una ruta admin nueva. El grueso del backend de identidad, pases y check-in ya está.

---

## 2. Objetivo funcional (derivado de Eventee)

Dar al organizador de un **foro** la capacidad de:

1. Definir **escenarios/salas** ("foros" = *Stages*), en columnas paralelas.
2. Armar el **horario visual** (grid escenario × hora), con **arrastrar y soltar** (reusando `@dnd-kit`, ya presente en el editor de plano).
3. Crear **sesiones** de tres tipos: **Ponencia** (`lecture`), **Taller** (`workshop`, con cupo), **Receso** (`break`, para coffee breaks/almuerzos).
4. Gestionar **ponentes** con perfil rico (foto, bio, cargo, empresa, redes) y **asignarlos** a sesiones (multi-ponente).
5. (Ya existe) Emitir **pases** que habiliten acceso a sesiones concretas, y controlar el **check-in**.

### 2.1 Hallazgos confirmados en el recorrido de Eventee

El recorrido autenticado del 19-08-2026 confirma estas decisiones de producto, que se incorporan a esta propuesta:

| Área Eventee | Patrón observado | Decisión para EventPass |
|---|---|---|
| Schedule | Selector de día, columnas por *Stage*, zoom, importación y vista temporal desde las 08:00; cada escenario se puede editar desde su cabecera. | Agenda por día y escenario; controles de zoom y duración desde Fase 2. Importación queda para Fase 4. |
| Sessions | Catálogo independiente, con filtros **All / Lectures / Workshops**, búsqueda y columnas de fecha/hora, ponente, nombre y escenario. | Añadir lista accesible de sesiones además del grid; filtros Ponencias, Talleres y Recesos, búsqueda y edición por formulario. |
| Speakers | Perfil reutilizable por evento; Eventee anuncia nombre, empresa, bio y redes, y permite importar. | Mantener `event_speakers` como perfil de presentación reutilizable y no mezclarlo con el registro de asistentes. |
| People | Separación explícita entre registro, asistentes y equipo. El registro puede ser nativo o una importación desde sistema externo; el equipo se invita y recibe rol. | Añadir responsables operativos a sesiones/escenarios en una fase posterior, usando `memberships` y sin convertirlos en ponentes. Mantener importación de asistentes independiente de agenda. |
| Engagement | Preguntas y encuestas se administran por sesión; admite moderación y modo proyector. Newsfeed permite avisos inmediatos o programados para cambios, descansos y próximas sesiones. | Diseñar las entidades de participación y avisos con `session_id` opcional desde el principio; implementar UI en una fase posterior, sin bloquear la agenda base. |

**Regla de experiencia:** el organizador empieza por crear escenario, horario y sesión. Los campos virtuales, adjuntos, aforo, responsables y participación permanecen en secciones secundarias o aparecen solo cuando el tipo de sesión los necesita.

---

## 3. Modelo de datos exacto (Eventee → EventPass)

### 3.1 Sesión (editor de Eventee)

| Campo Eventee | Columna EventPass | Notas |
|---|---|---|
| Name * | `event_sessions.name` | ya existe |
| Lecture / Workshop / Break | `event_sessions.session_type` | **nuevo** enum textual |
| Start / End * | `event_sessions.starts_at` / `ends_at` | ya existen |
| Capacity (solo Workshop) | `event_sessions.capacity` | ya existe (null = sin límite) |
| Speaker name (multi) | `session_speakers` (M:N) | **nuevo** |
| Description | `event_sessions.description` | ya existe |
| Live stream URL | `event_sessions.stream_url` | **nuevo** |
| Limit attendee access to video | `event_sessions.limit_video_access` | **nuevo** |
| Virtual meeting URL | `event_sessions.meeting_url` | **nuevo** |
| Upload file for attendees | `event_sessions.attachment_url` | **nuevo** (Supabase Storage) |
| (posición en columna) | `event_sessions.stage_id` | **nuevo** FK a `event_stages` |
| (orden) | `event_sessions.sort_order` | **nuevo** |

### 3.2 Escenario / "foro" (editor de Stage en Eventee)

| Campo Eventee | Columna EventPass (`event_stages`) |
|---|---|
| Stage name * | `name` |
| Video or live stream URL | `stream_url` |
| Limit attendee access to the video | `limit_video_access` |
| (orden de columnas / "Change order") | `sort_order` |

### 3.3 Ponente (editor de Speaker en Eventee)

Tabla nueva `event_speakers` con paridad 1:1: `full_name*`, `company`, `position`, `bio`, `photo_url`, `email`, `phone`, `web`, `linkedin`, `facebook`, `twitter`, `instagram`, `country`, `language`, `sort_order`. Enlace opcional `person_id → people` para reconciliar identidad y check-in.

---

## 4. Migración SQL (idempotente, para pegar en Supabase SQL Editor)

Archivo: `infra/supabase/migrations/20260819HHMMSS_agenda_foro.sql`

```sql
-- EventPass VE — Agenda del foro: escenarios, tipos de sesión y ponentes.
-- Extiende event_sessions sin romper su uso actual en pases de acceso.

-- 4.1 event_sessions: nuevas columnas (todas opcionales / con default).
alter table public.event_sessions add column if not exists session_type text not null default 'lecture'
  check (session_type in ('lecture','workshop','break'));
alter table public.event_sessions add column if not exists stage_id uuid references public.event_stages(id) on delete set null;
alter table public.event_sessions add column if not exists stream_url text;
alter table public.event_sessions add column if not exists meeting_url text;
alter table public.event_sessions add column if not exists attachment_url text;
alter table public.event_sessions add column if not exists limit_video_access boolean not null default false;
alter table public.event_sessions add column if not exists sort_order int not null default 0;

-- 4.2 Escenarios / "foros" (columnas del horario).
create table if not exists public.event_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  stream_url text,
  limit_video_access boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);
create index if not exists idx_event_stages_event on public.event_stages(event_id, sort_order);

-- (event_sessions.stage_id definido arriba tras crear la tabla; si el editor SQL
--  ejecuta linealmente, mover el bloque 4.2 antes del add column de stage_id.)

-- 4.3 Ponentes (perfil de presentación por evento).
create table if not exists public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  full_name text not null,
  company text,
  position text,
  bio text,
  photo_url text,
  email text,
  phone text,
  web text,
  linkedin text,
  facebook text,
  twitter text,
  instagram text,
  country text,
  language text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_speakers_event on public.event_speakers(event_id, sort_order);

-- 4.4 Sesión ↔ Ponente (M:N).
create table if not exists public.session_speakers (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  speaker_id uuid not null references public.event_speakers(id) on delete cascade,
  sort_order int not null default 0,
  primary key (session_id, speaker_id)
);

-- 4.5 RLS: gestión por miembros de la organización.
alter table public.event_stages enable row level security;
alter table public.event_speakers enable row level security;
alter table public.session_speakers enable row level security;

drop policy if exists stages_member_all on public.event_stages;
drop policy if exists speakers_member_all on public.event_speakers;
drop policy if exists session_speakers_member_all on public.session_speakers;

create policy stages_member_all on public.event_stages for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy speakers_member_all on public.event_speakers for all to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin())
  with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy session_speakers_member_all on public.session_speakers for all to authenticated
  using (exists (select 1 from public.event_sessions s where s.id = session_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())))
  with check (exists (select 1 from public.event_sessions s where s.id = session_id and (public.is_org_member(s.organization_id) or public.is_platform_admin())));
```

> **Nota de orden de ejecución:** como el SQL Editor aplica el archivo de arriba abajo, en el archivo real hay que **crear `event_stages` (4.2) antes** del `alter table ... add column stage_id` (4.1). Aquí se documentó agrupado por entidad para leerse mejor.

> **Decisión de seguridad:** `event_sessions` tendrá URLs de reunión y adjuntos, y `event_speakers` admite email/teléfono. No se concede lectura anónima directa en Fase 1. Fase 6 creará una vista pública de columnas seguras para eventos publicados, sin esos datos privados.

### 4.6 Reglas de negocio a validar (heredadas de Eventee)

- `break` no lleva ponentes ni cupo → la UI oculta esos campos; opcional: `check` para forzar `capacity is null` cuando `session_type <> 'workshop'`.
- `break` puede abarcar todos los escenarios → permitir `stage_id null` = receso global (fila que cruza el grid).
- **Solapes:** dos sesiones en el mismo `stage_id` no deben cruzarse en tiempo → validar en cliente y, si se quiere endurecer, con un `exclusion constraint` (requiere `btree_gist`).
- **Cupo de taller (futuro):** replicar el patrón `reserve_session_seat` como RPC `security definer` (espejo de `register_with_seat`), no aflojar RLS. La Fase 1 deja `capacity` informativo; el acceso ya se puede gatear con `passes.access_mode='session'`.
- **Límite de plan:** si se quiere limitar nº de sesiones/escenarios por plan, seguir el patrón `BEFORE INSERT` de `enforce_event_limit` leyendo `plans`.
- **Responsables operativos:** una sesión puede tener responsables de sala, acreditación, audiovisual o moderación. No son asistentes ni ponentes: en la primera entrega se resuelven con `memberships` del evento; si la operación requiere turnos se añadirá una tabla `session_staff_assignments` en Fase 5.
- **Avisos y participación:** `session_id` debe ser opcional en futuras noticias, preguntas y encuestas para permitir tanto comunicaciones globales (p. ej. apertura del evento) como moderación asociada a una ponencia.

---

## 5. Frontend

### 5.1 Ruta y entrada

- Nueva página **lazy** en `src/App.tsx` (mantener el patrón `React.lazy`):
  ```tsx
  const AgendaAdmin = lazy(() => import('./pages/admin/AgendaAdmin'))
  // <Route path="/admin/agenda/:eventId" element={<RequireAuth><AgendaAdmin /></RequireAuth>} />
  ```
- En `EventosAdmin.tsx` (línea ~230), para `event_type === 'forum'` añadir/cambiar la acción a un enlace **"Agenda" → `/admin/agenda/${ev.id}`** (hoy el foro muestra "Asientos"; la agenda pasa a ser la acción principal del foro, "Asientos" queda como secundaria si se conserva).
- Resolver la org con `resolveActiveOrg()` (soporta impersonación superadmin), igual que `ProgramasAdmin`/`StandsAdmin`.

### 5.2 Estructura de `AgendaAdmin`

Dos pestañas internas, espejo de *Content* en Eventee:

1. **Horario** (default)
   - Barra: selector de **fecha** (evento multi-día ⇒ un grid por día, filtrando por `starts_at::date`), **+ Añadir escenario**, **Duración por defecto** (min), zoom, buscador y filtros por tipo. **Importar** queda para fase posterior.
   - **Grid**: columnas = `event_stages` (orden `sort_order`), filas = horas. Cabecera de columna con lápiz → **editar escenario** (`name`, `stream_url`, `limit_video_access`).
   - Bloques de sesión posicionados por `stage_id` + `starts_at/ends_at`. Arrastrar para mover/redimensionar (persistir con autosave, reusando `useAutosave.ts` del floorplan).
   - Doble-clic en hueco → **modal de sesión**.
2. **Ponentes**
   - Lista + **Crear** (modal con todos los campos de `event_speakers`) + **Importar** (fase posterior). Subida de foto a Supabase Storage.
3. **Lista de sesiones** (vista alternativa del mismo dato)
   - Tabla buscable: fecha y hora, tipo, ponentes, nombre, escenario y cupo. Sirve como alternativa accesible al grid y para correcciones rápidas.

### 5.3 Modal de sesión (paridad exacta con Eventee)

- Toggle **Ponencia / Taller / Receso** (`session_type`).
- `name*`, `starts_at*`/`ends_at*` (respetando "duración por defecto").
- **Ponentes**: multiselect contra `event_speakers` → escribe en `session_speakers`.
- `description`.
- **Evento virtual**: `stream_url` + checkbox `limit_video_access`; `meeting_url`.
- **Avanzado**: `attachment_url` (subida de archivo).
- Solo si **Taller**: `capacity` (stepper +/−).
- Si **Receso**: ocultar ponentes, cupo y virtual (solo nombre, horas, descripción).

### 5.4 Reutilización

- **DnD**: `@dnd-kit/react` ya es dependencia (editor de plano) — reutilizar patrón de `FloorplanCanvas`/`useFloorplanHistory` para el grid del horario.
- **Estilos**: mismos tokens Tailwind (emerald 600/700, tarjetas `rounded-2xl border-zinc-200`), copia **en español**.
- **Storage**: mismo bucket/patrón que comprobantes/branding para fotos de ponentes y adjuntos.

---

## 6. Vista pública (fase posterior, no bloqueante)

La página pública del programa (`/p/:programId/registro` y/o una futura `/p/:programId/agenda`) leerá una vista pública de agenda con columnas seguras de `event_stages`, `event_sessions`, `event_speakers` y `session_speakers`. Esto reproduce el "Program" de la app de Eventee (columnas por escenario, bloques, coffee breaks y ficha de ponente) sin filtrar enlaces privados ni contactos.

---

## 7. Plan de integración por fases

| Fase | Resultado entregable | Alcance y orden | Gate de salida |
|---|---|---|---|
| **0 — Diagnóstico y contrato** | Base segura para empezar | Resolver la carga de un evento foro bajo organización activa; inspeccionar columnas y políticas reales de `event_sessions`; confirmar bucket de Storage reutilizable; acordar límites de plan. | Evento foro de prueba abre para admin y no hay regresión en pases/check-in existentes. |
| **1 — Datos y seguridad** | Esquema desplegable | Migración idempotente: `event_stages`, `event_speakers`, `session_speakers` y extensiones de `event_sessions`; índices, permisos explícitos de Data API y RLS de administración. Corregir el orden SQL: crear `event_stages` antes de añadir `stage_id`. | SQL aplicado una sola vez sin error; CRUD validado como admin y denegado fuera de la organización. |
| **2 — CRUD guiado** | Agenda útil sin arrastre | Ruta lazy `AgendaAdmin`; crear/editar/eliminar escenarios, sesiones y ponentes; vista Horario simple + Lista de sesiones; tipos Ponencia, Taller y Receso con formulario adaptativo; enlace desde Eventos. | Crear un foro completo: escenario, ponente, ponencia, taller y coffee break; recargar y conservar todos los datos. |
| **3 — Horario visual** | Diseño fluido de programa | Grid día × escenario × hora, zoom, duración por defecto, detección de solape, DnD para mover/redimensionar y autosave con historial. Reutilizar patrones del floorplan sin acoplar sus elementos físicos. | Prueba autenticada: mover, redimensionar, deshacer/rehacer y recargar sin cruces ni pérdida de datos. |
| **4 — Contenido masivo y participación** | Preparación operativa rápida | Importador con previsualización/validación para agenda y ponentes; fotos y adjuntos; noticias programadas de agenda; preguntas, encuestas y moderación por sesión. | Archivo de importación con errores recuperables; aviso y encuesta quedan enlazados a la sesión correcta. |
| **5 — Operación presencial y aforo** | Control del día del evento | Responsables por escenario/sesión (`session_staff_assignments`), turnos; RPC de reserva de cupo para talleres; integración con puerta/check-in y alertas de sobrecupo. | Un staff asignado valida una entrada; se respeta el cupo bajo solicitudes simultáneas. |
| **6 — Experiencia pública y vínculo espacial** | Programa publicable y navegable | Agenda pública, ficha de sesión/ponente, “Mi agenda”, acceso a adjuntos según pase; vínculo opcional `event_stages ↔ venue_map_elements` para localizar una sala/escenario en el plano. | Visitante ve solo contenido publicado/autorizado y puede pasar de sesión a ubicación física. |

### Resultado de Fase 0 — 19-08-2026

- **Evento y organización activa:** validado en producción con sesión autenticada. `Foro Energético` abre desde `/admin/eventos` bajo la organización activa y no genera advertencias ni errores de consola. La incidencia anterior de “No se pudo cargar el evento” no se reproduce en esta sesión.
- **Flujo existente:** `/admin/programas` abre correctamente. La actual pantalla `ProgramaAccesosAdmin` puede seguir siendo la compatibilidad de sesiones mínimas y pases mientras se entrega `AgendaAdmin`; no se sustituirá hasta que Fase 2 esté validada.
- **Esquema confirmado:** `event_sessions` ya contiene `organization_id`, `event_id`, `name`, `description`, `starts_at`, `ends_at` y `capacity`; no tiene reglas de solape ni tipos de sesión. Sus políticas miembro/plataforma ya cubren el CRUD de las nuevas columnas.
- **Seguridad confirmada:** `event_sessions`, `event_zones`, mapas y elementos de mapa tienen RLS por organización. A la migración de agenda le falta añadir tablas nuevas y sus políticas de lectura pública condicionadas a `events.status = 'published'`.
- **Storage:** solo existen buckets privados `comprobantes` y `subs`, con límite de 5 MiB y políticas no aptas para contenido público ni reemplazos (`subs` no tiene UPDATE). Fase 1 no reutilizará esos buckets: Fase 4 creará un bucket público restringido para fotos de ponentes y un bucket privado con URL firmada para adjuntos de sesión.
- **Decisión de datos:** responsables operativos se basarán en `memberships`; asistentes y ponentes continuarán siendo entidades separadas. No se requiere migración ni modificación de producción para cerrar Fase 0.

### Resultado de Fase 1 — 19-08-2026

- **Migración aplicada y verificada:** `20260819115720_agenda_forum.sql` creó `event_stages`, `event_speakers` y `session_speakers`.
- **Sesiones extendidas:** existen `session_type`, `stage_id`, `stream_url`, `meeting_url`, `attachment_url`, `limit_video_access` y `sort_order`; las sesiones existentes conservan `session_type = 'lecture'` por defecto.
- **Integridad e índices:** quedaron activas las validaciones de tipo y rango horario, y los índices de agenda, escenario, ponente y relación sesión–ponente.
- **Seguridad:** las tres tablas tienen RLS y políticas `ALL` exclusivas para `authenticated` con comprobación de miembro de organización o superadministrador. No se creó acceso anónimo directo.
- **Advisor:** no hay advertencias asociadas a estas entidades nuevas. El proyecto mantiene advertencias históricas sobre funciones `SECURITY DEFINER` y protección de contraseñas; no se modificaron porque son un alcance independiente de la agenda.

### Resultado de Fase 2 — 19-08-2026

- **Ruta y entrada:** se creó la ruta lazy `/admin/agenda/:eventId`. Para los eventos de tipo foro, `EventosAdmin` muestra **Agenda** como acción principal y mantiene **Asientos** como opción secundaria.
- **CRUD guiado:** `AgendaAdmin` incluye tres vistas del mismo dato: Horario por escenario, Lista de sesiones con búsqueda/filtros y Ponentes. Permite crear, editar y eliminar escenarios, ponencias, talleres, recesos y perfiles de ponente.
- **Reglas de experiencia:** las sesiones nuevas proponen una duración de 60 minutos; los recesos ocultan ponentes, cupo y opciones virtuales; los talleres muestran cupo; se evita el solape entre sesiones no-receso del mismo escenario.
- **Persistencia validada:** se creó temporalmente escenario, ponente y sesión, se confirmó la relación sesión–escenario–ponente tras recarga y se eliminaron los tres registros. La limpieza quedó comprobada en base de datos.
- **Calidad:** `oxlint` y `tsc -b && vite build` pasan. La navegación automatizada local no mostró errores de aplicación.

### Resultado de Fase 3 — 19-08-2026

- **Horario visual:** la pestaña Horario muestra una cuadrícula de 30 minutos, de 07:00 a 22:00, con una columna por escenario. La escala se puede compactar o ampliar sin afectar la programación.
- **Reprogramación segura:** una sesión se arrastra a otra hora o escenario conservando su duración. El cliente rechaza límites fuera del horario y solapes dentro del mismo escenario antes de escribir en Supabase; si la persistencia falla, el bloque permanece en su posición anterior y se informa el motivo.
- **Duración e historial:** al seleccionar una sesión aparecen controles de más/menos 30 minutos. Deshacer y Rehacer guardan cada reversión de horario o duración, manteniendo la base de datos sincronizada.
- **Operación conservada:** el horario mantiene acciones para crear sesiones y crear, editar o eliminar escenarios; la lista alternativa de sesiones continúa disponible para correcciones precisas.
- **Calidad:** `oxlint` y `tsc -b && vite build` pasan sin advertencias ni errores. La verificación final autenticada en navegador queda pendiente de recuperar el controlador de navegador local, que se cerró por un fallo del sandbox ajeno a la aplicación.

### Resultado de Fase 4 — 19-08-2026

- **Contenido administrativo:** la pestaña Contenido concentra importación CSV con previsualización y validación recuperable, carga de fotos de ponentes, adjuntos privados de sesión, avisos, encuestas en borrador y cola de moderación de preguntas.
- **Migración principal aplicada:** `20260819140000_agenda_content_and_engagement.sql` crea las entidades de participación, permisos de Data API y buckets `speaker-photos` (público) y `agenda-attachments` (privado).
- **Refuerzo obligatorio pendiente:** aplicar también `20260819143000_agenda_content_session_integrity.sql`. Este endurece las políticas RLS para exigir que cada aviso, pregunta o encuesta apunte a una sesión del mismo evento y organización.
- **Límites deliberados:** la creación pública de preguntas/votos y la agenda pública no se habilitan aún; se entregarán con la autorización de asistentes de la Fase 6, sin abrir las URLs privadas de reuniones o adjuntos.
- **Calidad:** `oxlint` y `tsc -b && vite build` pasan. La verificación de la Data API desde este entorno no pudo completarse porque el sandbox bloquea las conexiones de salida; no devolvió una respuesta de Supabase.

### Resultado de Fase 5 — 19-08-2026

- **Operación de sesiones:** la pestaña Operación permite asignar miembros reales de la organización como anfitrión, moderador, check-in o apoyo para cada sesión, y retirar asignaciones sin afectar la agenda.
- **Aforo transaccional:** `reserve_workshop_seat` bloquea la sesión antes de contar e insertar, por lo que solicitudes simultáneas no pueden sobrepasar la capacidad. La reserva repetida devuelve el mismo resultado sin duplicar plazas.
- **Check-in de taller:** `validate_session_checkin` exige punto y sesión del mismo evento, un turno operativo apropiado, pase habilitado y reserva confirmada para talleres; además actualiza la reserva a `checked_in`.
- **Migración aplicada:** `20260819150000_forum_operations_and_capacity.sql` creó asignaciones, reservas, RPC de listado de personal, cupo y validación, con RLS por organización y coherencia evento–sesión.
- **Calidad:** `oxlint` y `tsc -b && vite build` pasan. La prueba autenticada de extremo a extremo queda para el próximo despliegue, porque este entorno no puede abrir la conexión remota ni el navegador automatizado.

### Resultado de Fase 6 — 19-08-2026

- **Agenda pública:** se habilitó `/e/:eventId/agenda`, con filtro por día, bloques de sesiones, ficha detallada y perfiles editoriales de ponentes.
- **Mi agenda:** el visitante puede guardar o retirar sesiones en su propio dispositivo; no requiere cuenta ni se persiste información personal.
- **Seguridad:** `get_public_forum_agenda` solo devuelve sesiones de eventos publicados y una lista explícita de columnas aptas para publicación. Excluye URL de reunión/transmisión, adjuntos privados, teléfono, email y redes personales.
- **Vínculo espacial:** `event_stages.venue_element_id` permite relacionar de forma opcional un escenario lógico con un elemento del plano; la agenda informa que existe una ubicación sin abrir el editor administrativo.
- **Migración aplicada:** `20260819160000_public_forum_agenda.sql` aplicada en Supabase. `oxlint` y `tsc -b && vite build` pasan; la prueba visual autenticada queda para el despliegue por las limitaciones del sandbox local.

---

## 8. Diferencias deliberadas con Eventee

- **Floorplan físico:** Eventee **no** tiene editor de plano visual de arrastrar; su "mapa" son los Stages + directorio de Partners. EventPass ya tiene un editor de plano superior (módulo exposición) — se mantiene como diferenciador; los escenarios del horario (`event_stages`) son un concepto **lógico** independiente del plano físico (`venue_map_elements` con `element_type='stage'`), aunque a futuro pueden vincularse.
- **Idioma:** toda la copia en **español** (mercado VE), a diferencia del inglés de Eventee.
- **Pagos/acreditación:** el modelo de pases + check-in de EventPass es más rico (transferencias manuales, puntos de acceso, scopes de staff) y no requiere nada de Eventee.
- **Operación:** Eventee separa asistentes y equipo; EventPass conservará esa separación e irá un paso más allá con responsables por sesión y punto de acceso, una vez estabilizada la agenda.

---

## 9. Precondición operativa (del handoff actual)

`task.md` marca un **bloqueo crítico**: el evento de exposición de prueba dejó de cargar (RLS/organización activa) y muestra "No se pudo cargar el evento". Antes de desplegar la Fase 1, conviene resolver ese diagnóstico para poder validar la agenda con un evento **foro** real bajo sesión autenticada.

---

## 10. Check-in: mejoras a tomar de Eventee

**Contexto:** el recorrido autenticado de Eventee (19-08-2026, `Settings → Features → Check-in`, `People → Attendees/Team`) confirma que su check-in es **más simple** que el de EventPass. EventPass ya supera a Eventee en el **motor**: `credential_token` por participación, escáner web `html5-qrcode` (`CheckinEvento.tsx`), puntos de acceso (`access_points`), check-in por sesión (`validate_session_checkin`), validación de pase/entitlement y bitácora `checkin_records` con anti-duplicado y scopes de staff (`event_staff_scopes`). **No hay que copiar el motor de Eventee.**

Lo único que Eventee resuelve mejor es la **capa de control/reporte para el organizador**. Solo eso se toma:

| # | Mejora de Eventee | Qué falta hoy en EventPass | Dónde encaja |
|---|---|---|---|
| 1 | **Filtros rápidos `Checked-in` / `Not checked-in`** en la lista de asistentes, con conteo en vivo (`0 / 500`). | El foco está en el escáner; falta una vista de control post-escaneo filtrable con conteos. | Nueva vista admin sobre `event_participations` + `checkin_records` (agregado por `participation_id`). |
| 2 | **Check-in manual** desde la fila del asistente (marcar entrada sin escanear QR). | El acceso solo se registra por escaneo. | Botón por fila → inserta en `checkin_records` con `result='validated'` y `scanned_by = auth.uid()` (misma RPC o una `manual_checkin`). |
| 3 | **Toggle "Check-in" a nivel evento** visible, como estado explícito. | El check-in está siempre activo vía tokens; no hay un interruptor que comunique el estado al organizador. | Flag en `events.config` (p. ej. `checkin_enabled`) mostrado como switch en la ficha del evento. |
| 4 | **Export** de la lista con estado de check-in (CSV). | — (conviene un export directo para conciliación). | Reutilizar patrón de export existente; incluir columna `checked_in_at` derivada de `checkin_records`. |

### Resultado — mejoras de control de check-in

- Se creó `/admin/checkin/control`: filtros Todos / Ingresaron / Pendientes, conteos vivos, check-in manual desde la fila y exportación CSV con hora de entrada.
- El escáner enlaza a ese panel y el evento tiene el interruptor visible de check-in en la misma pantalla de control.
- `manual_program_checkin` y `get_event_checkin_report` mantienen el flujo en RPCs autorizadas por organización.
- Las migraciones `20260819170000_checkin_reporting_and_manual.sql` y `20260819171000_enforce_checkin_enabled.sql` están aplicadas. El trigger final impide insertar registros de check-in mientras el evento esté desactivado, incluyendo escáner, RPC y operaciones directas.

**Se descarta** de Eventee: estados `App user` / `Anonymous` (EventPass no tiene app móvil propietaria; su escáner web no los necesita) y el rol global `Moderator` (los scopes finos de `event_staff_scopes` ya son superiores).

**Alcance:** son mejoras de **UX/reporte**, no de arquitectura. Ninguna requiere cambiar el motor de validación ni las RPC de seguridad; encajan como una vista de control de asistentes + un par de acciones sobre `checkin_records`. Prioridad sugerida: junto a la operación presencial (Fase 5) o como iteración independiente de la pantalla de asistentes.
