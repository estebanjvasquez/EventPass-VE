# EventPass VE

Plataforma SaaS multi-tenant de registro y acreditación de eventos, diseñada para el mercado venezolano (pagos por transferencia manual, acreditación en sitio, resiliencia offline en el check-in).

> **Estado:** en producción — `https://eventosfacil.net`

## Qué hace

Cubre el ciclo completo de un evento:

- **Registro online** por organización, con selección de asiento opcional (mapa de asientos).
- **Carga y verificación manual de comprobante** de pago (Zelle, Pago Móvil, Binance…). El administrador confirma o rechaza desde el panel.
- **Recordatorios automáticos** (días 3/7/9) y **liberación de plazas** vencidas, vía cron horario.
- **Credencial con código QR** al confirmar el pago.
- **Check-in por QR** el día del evento, ingreso manual, búsqueda operativa e incidencias auditables.
- **Acreditación e impresión de gafetes** con tamaños configurables; las impresiones iniciales y reimpresiones con motivo quedan auditadas.
- **Multi-tenant por subdominio** (`<cliente>.eventosfacil.net`) con branding propio, y dominio propio en el plan superior.
- **Alta self-service** de organizaciones y **consola de superadmin** para gestionar clientes, planes, cobros y equipo (incluida la gestión "como cliente").
- **Suscripciones con cobro manual**: la organización paga su plan y sube comprobante; el superadmin lo aprueba. Los **límites de plan se aplican en la base de datos**.

## Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Vite, desplegado en **Cloudflare Pages** (proyecto `eventpass`).
- **Backend:** un **Cloudflare Worker** (Hono) — `eventpass-api`. Ejecuta lo que el navegador no puede: envío de correo, aprovisionamiento de subdominios vía la API de Cloudflare, alta de clientes con invitaciones y tareas programadas (Cron Triggers).
- **Base de datos:** **Supabase Postgres**, multi-tenant con **Row-Level Security**; fuente de verdad de la autorización. Lógica sensible en funciones `security definer`.
- **Auth:** Supabase Auth (JWT). Roles por organización (`owner`/`admin`/`staff`) y superadmins de plataforma.
- **Correo:** binding nativo de **Cloudflare Email Sending** (sin API de terceros).
- **Storage:** Supabase Storage (comprobantes de pago y de suscripción, en buckets privados).

## Planes

| Plan | Precio | Eventos | Registros por evento |
|------|--------|---------|----------------------|
| Arranque | $49/mes | 1 | 200 |
| Profesional | $99/mes | Ilimitados | 1.000 |
| Asociación | $179/mes | Ilimitados | Ilimitados |

## Estructura del repositorio

```
EventPass-VE/
├── frontend/                  ← SPA React (Cloudflare Pages)
├── backend/                   ← Worker Hono (Cloudflare Workers)
├── infra/supabase/migrations/ ← Migraciones SQL (aplicadas a mano en el SQL Editor)
├── docs/                      ← Propuestas y análisis (arquitectura previa; ver nota)
└── CLAUDE.md                  ← Guía de arquitectura y convenciones para el desarrollo
```

## Desarrollo

Dos paquetes npm independientes; entra a cada uno según lo que trabajes.

```bash
# Frontend
cd frontend && npm install
npm run dev        # servidor de desarrollo (Vite)
npm run build      # tsc -b && vite build
npm run lint       # oxlint

# Backend
cd backend && npm install
npm run dev        # wrangler dev
npm run typecheck  # tsc --noEmit
```

No hay suite de tests automatizados; los gates de calidad son `tsc` (ambos paquetes) y `oxlint` (frontend).

## Estado operativo actual

- Check-in: QR, ingreso manual, selección de punto/sesión, búsqueda por nombre/correo, filtros, incidencias y exportación CSV.
- Acreditación: búsqueda por nombre/apellido/cédula, escaneo QR, selección de tamaño y auditoría de impresión/reimpresión.
- Pendiente para operación de octubre: asignación visual de staff/seguridad por evento y puerta, historial visible de impresiones, pruebas con impresoras reales y modo offline/PWA con cola de sincronización.
- Último despliegue validado: `https://33ca4632.eventpass-d7d.pages.dev`.

## Fases pendientes de operación onsite

1. **Permisos operativos:** interfaz para asignar miembros a evento, punto de acceso y permisos `checkin.perform`, `badges.print` y `participants.manage`.
2. **Check-in asistido:** búsqueda por documento, incidencias desde el escáner, reingresos/salidas e incidencias denegadas.
3. **Acreditación:** historial visible de impresiones, reimpresiones auditadas y plantillas probadas con impresoras térmicas.
4. **Resiliencia:** PWA/offline, cache de credenciales autorizadas, cola local y sincronización con resolución de conflictos.
5. **QA presencial:** dispositivos, permisos de cámara, conectividad intermitente, impresora, doble escaneo y recuperación ante errores.

**Configuración:** el frontend usa `frontend/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`). El Worker usa `backend/wrangler.toml` para variables no secretas y `wrangler secret put` para los secretos (service role de Supabase, token de Cloudflare, etc.).

## Despliegue

- **Frontend:** automático vía GitHub Actions al hacer push a `main` que toque `frontend/**` (`.github/workflows/deploy-frontend.yml`).
- **Backend:** manual con `npm run deploy` (`wrangler deploy`) desde `backend/`.
- **Migraciones:** se aplican manualmente en el **SQL Editor de Supabase** (se escriben idempotentes).
- **Flujo Git:** desarrollo en `develop`, luego merge a `main`.

Ver [`CLAUDE.md`](CLAUDE.md) para el detalle de la arquitectura (tenancy, RLS, aprovisionamiento de subdominios, convenciones y gotchas).

## Nota sobre `docs/`

Los documentos de `docs/` son propuestas y análisis de una etapa previa y describen una arquitectura anterior (Node/Express + DigitalOcean). La arquitectura vigente es la de este README y de `CLAUDE.md`.
