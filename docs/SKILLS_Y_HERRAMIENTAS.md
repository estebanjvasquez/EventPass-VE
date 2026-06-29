# Skills, Herramientas y Dependencias Necesarias

> **Stack vigente: Cloudflare + Supabase.** Este documento fue actualizado desde el
> stack anterior (Node/Express/Prisma/Bull/Redis/AWS/SendGrid) para alinearse con
> [`ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md`](ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md).
> El andamiaje ya está creado en `frontend/`, `backend/` e `infra/`.

---

## PARTE 1: SKILLS A USAR EN CLAUDE CODE

> Las skills de Claude Code no se "instalan": ya están disponibles y se invocan con `/<nombre>`.

### Skills Críticas (Usar Regularmente)

#### 1. `/design-taste-frontend`
UI/UX con reglas de diseño consistentes. Úsalo al crear componentes, revisar páginas o mejorar accesibilidad (formularios de registro, panel admin con Shadcn/ui + Tailwind).

#### 2. `/code-review`
Revisa PRs (bugs, seguridad, performance, reutilización). Niveles: `low`, `medium`, `high`, `ultra` (cloud multi-agente). Flags: `--comment`, `--fix`.

#### 3. `/verify`
Ejecuta la app y valida flujos end-to-end (registro, email, confirmación de pago, credencial QR).

### Skills de Referencia

#### 4. `/claude-api`
Referencia de Claude API: modelos, precios, caching, tool use. Útil si se agregan validaciones o reportes con IA.

#### 5. `/security-review`
Auditoría de seguridad antes de producción: RLS de Supabase, JWT, rate limiting, validación de inputs, manejo de comprobantes.

#### 6. `/schedule` y `/update-config`
Tareas recurrentes y configuración de settings/hooks/permisos del entorno.

---

## PARTE 2: HERRAMIENTAS DE DESARROLLO (CLI/Local)

### Estado actual (verificado)

| Herramienta | Requerido | Cómo se usa |
|-------------|-----------|-------------|
| **Node.js** v20+ | ✅ instalado (v24) | Runtime de build y tooling |
| **npm** v10+ | ✅ instalado (v11) | Gestor de paquetes |
| **Git** v2.40+ | ✅ instalado | Control de versiones |
| **Wrangler** (Cloudflare) | ✅ dev-dependency en `backend/` | `npx wrangler ...` (dev/deploy del Worker) |
| **Supabase CLI** | ✅ dev-dependency en `infra/` | `npx supabase ...` (migraciones, db local) |
| ~~Docker~~ | ❌ no requerido | El stack serverless no lo necesita |

> **No se requiere Docker, Redis ni PostgreSQL local.** La base de datos vive en
> Supabase (nube). Para desarrollo local de la BD puede usarse `supabase start`
> (que sí usa Docker internamente) — opcional.

### Instalación / arranque

```bash
# Frontend (Cloudflare Pages)
cd frontend
npm install        # ya ejecutado
npm run dev        # http://localhost:5173

# Backend (Cloudflare Worker)
cd ../backend
npm install        # ya ejecutado
npm run dev        # http://localhost:8787  (requiere backend/.dev.vars)

# Infra (Supabase CLI)
cd ../infra
npm install        # ya ejecutado
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

---

## PARTE 3: DEPENDENCIAS NPM (instaladas)

### Frontend (`frontend/package.json`)

```jsonc
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^6",
    "@tanstack/react-query": "^5",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^5",
    "zod": "^3",
    "@supabase/supabase-js": "^2",   // auth + datos + storage
    "qrcode.react": "^4",            // credenciales QR
    "recharts": "^2",                // reportes/dashboards
    "zustand": "^5",                 // estado
    "class-variance-authority", "clsx", "tailwind-merge", "lucide-react" // base Shadcn/ui
  },
  "devDependencies": {
    "vite": "^8", "@vitejs/plugin-react": "^6",
    "tailwindcss": "^4", "@tailwindcss/vite": "^4",
    "typescript", "oxlint", "@types/react", "@types/react-dom", "@types/node"
  }
}
```

> Shadcn/ui se agrega con su CLI (`npx shadcn@latest init`) cuando se necesiten
> componentes; copia el código al proyecto (no es un paquete npm).
> Para mapa de asientos: agregar `konva` + `react-konva` cuando se implemente.

### Backend (`backend/package.json`)

```jsonc
{
  "dependencies": {
    "hono": "^4",                  // framework para Workers
    "@supabase/supabase-js": "^2", // cliente service-role
    "zod": "^3"
  },
  "devDependencies": {
    "wrangler": "^4",
    "@cloudflare/workers-types": "^4",
    "typescript": "^5"
  }
}
```

### Infra (`infra/package.json`)

```jsonc
{ "devDependencies": { "supabase": "^2" } }   // Supabase CLI local
```

---

## PARTE 4: VARIABLES DE ENTORNO

### Frontend — `frontend/.env` (copiar de `.env.example`)

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:8787
VITE_APP_NAME="EventPass VE"
VITE_ENVIRONMENT=development
```

### Backend — `backend/.dev.vars` (copiar de `.dev.vars.example`)

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # SECRETO — nunca en el frontend
ENVIRONMENT=development
```

En producción los secretos se cargan con:

```bash
cd backend && npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Variables no secretas viven en `backend/wrangler.toml` (`[vars]`).

---

## PARTE 5: SERVICIOS EXTERNOS

| Servicio | Rol | Plan |
|----------|-----|------|
| **Supabase** | Postgres (multi-tenant + RLS), Auth, Storage | Free → **Pro $25/mes** |
| **Cloudflare Pages** | Hosting del frontend | Gratis |
| **Cloudflare Workers** | API/backend serverless + Cron Triggers | **$5/mes** (Paid) |
| **Cloudflare for SaaS** | Dominios propios premium / subdominios | 100 hostnames gratis, luego $0.10 c/u |
| **Cloudflare R2** | Comprobantes/credenciales (opcional) | 10 GB gratis, egreso gratis |
| **Resend** | Email transaccional | Free 3K/mes → $20/mes |
| **WhatsApp Cloud API** | Notificaciones (diferenciador VE) | Por conversación |

> Ver costos completos en [`ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md`](ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md).

---

## PARTE 6: DESPLIEGUE

```bash
# Backend (Worker)
cd backend
npx wrangler deploy

# Frontend (Pages) — vía dashboard de Cloudflare (build: npm run build, output: dist)
# o manual:
cd ../frontend && npm run build
npx wrangler pages deploy dist --project-name eventpass

# Base de datos (migraciones)
cd ../infra
npx supabase db push
```

- **Subdominios** de clientes normales: wildcard DNS `*.DOMINIO` (gratis).
- **Dominios propios** de clientes premium: Cloudflare for SaaS (custom hostnames).

---

## PARTE 7: CHECKLIST PRE-DESARROLLO

- [x] Node.js v20+ / npm / Git instalados
- [x] Frontend, backend e infra andamiados con dependencias instaladas
- [x] Wrangler y Supabase CLI disponibles vía `npx`
- [ ] Proyecto Supabase creado (obtener URL + anon key + service role key)
- [ ] `frontend/.env` y `backend/.dev.vars` completados
- [ ] Esquema multi-tenant diseñado (organizations, memberships, RLS) → ver `ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md`
- [ ] Cuenta Cloudflare + dominio elegido
- [ ] Cuenta Resend (API key)

---

## PARTE 8: TROUBLESHOOTING RÁPIDO

**Worker no levanta:** verificar que exista `backend/.dev.vars` y que `wrangler.toml` tenga `main = "src/index.ts"`.

**Frontend sin estilos:** Tailwind v4 se carga vía `@tailwindcss/vite` en `vite.config.ts` y `@import "tailwindcss";` en `src/index.css`.

**Error de conexión a Supabase:** revisar `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (frontend) y `SUPABASE_SERVICE_ROLE_KEY` (backend). El service role **nunca** va en el frontend.

**RLS bloquea consultas:** confirmar políticas por `organization_id` y que el JWT incluya el tenant correcto.

---

## CONTACTO & REFERENCIAS

- **Costos y arquitectura:** `ANALISIS_COSTO_CLOUDFLARE_SUPABASE.md`
- **Features y modelo de datos:** `ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md`
- **Mercado y modelo de negocio:** `ANÁLISIS_MERCADO_VENEZUELA.md`
- **Cotización al cliente:** `COTIZACION_CLIENTE.md`
