# Infra — Supabase (EventPass VE)

Base de datos **multi-tenant** (una BD, aislamiento por `organization_id` + RLS).

## Estructura

```
infra/
├── package.json                 # Supabase CLI (dev dependency)
└── supabase/
    ├── config.toml              # configuración del proyecto local
    ├── seed.sql                 # datos demo (solo desarrollo)
    └── migrations/
        └── 20260629120000_init_multitenant.sql
```

## Esquema (resumen)

| Tabla | Rol |
|-------|-----|
| `organizations` | El tenant. `slug` = subdominio; `custom_hostname` = dominio premium |
| `memberships` | Usuario (`auth.users`) ↔ organización + rol (`owner`/`admin`/`staff`) |
| `subscriptions` | Plan contratado |
| `events`, `payment_methods`, `seats`, `registrations` | Dominio del evento |
| `admin_actions`, `email_log` | Auditoría y notificaciones |

**RLS:**
- Público (anon): lee organizaciones activas, eventos publicados, métodos de pago activos y asientos; puede **crear** su registro en eventos publicados.
- Miembros (authenticated): control total de los datos de **su** organización vía `is_org_member()` / `has_org_role()` (funciones `security definer`).
- El backend (Worker) usa el **service-role key** para tareas de sistema (cron de recordatorios, verificación por token) omitiendo RLS.

## Aplicar a un proyecto Supabase (nube)

```bash
cd infra
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push          # aplica las migraciones
```

## Desarrollo local (opcional, requiere Docker)

```bash
cd infra
npx supabase start            # levanta Postgres + estudio local
npx supabase db reset         # aplica migraciones + seed.sql
```

## Crear nuevas migraciones

```bash
cd infra
npx supabase migration new <nombre>     # crea archivo vacío en migrations/
# ...edita el SQL...
npx supabase db push
```
