# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

EventPass VE is a multi-tenant SaaS for event registration aimed at the Venezuelan market (manual bank-transfer payments, on-site accreditation). UI copy is in Spanish; keep it that way.

## Commands

Two independent npm packages: `frontend/` and `backend/`. `cd` into the relevant one first.

**Frontend** (`frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (typecheck is part of the build; a TS error fails the build but Vite may still emit a stale `dist`, so always check the `tsc` output)
- `npm run lint` — oxlint (the build gate; see gotchas)
- Deploy: `npx wrangler pages deploy dist --project-name eventpass --branch main --commit-dirty=true` (needs `CLOUDFLARE_API_TOKEN`)

**Backend** (`backend/`):
- `npm run dev` — `wrangler dev`
- `npm run typecheck` — `tsc --noEmit`
- `npm run deploy` — `wrangler deploy` (backend has **no CI**; deploy manually)
- Secrets: `printf '%s' '<value>' | npx wrangler secret put <NAME>` (run from `backend/`)

There is **no automated test suite**. The quality gates are `tsc` (both packages) and `oxlint` (frontend). Run `npx oxlint <files>` to lint specific files.

## Architecture

Three cooperating planes, no traditional server:

1. **Frontend** — React 19 + TypeScript + Tailwind v4 + Vite SPA, hosted on **Cloudflare Pages** (project `eventpass`, prod domain `eventosfacil.net`). Routes are code-split with `React.lazy` in `src/App.tsx` — keep new routes lazy. Talks to Supabase directly for most reads/writes (RLS enforces tenant isolation) and to the Worker only for privileged operations.
2. **Backend** — a single **Cloudflare Worker** (`backend/src/index.ts`, Hono framework, deployed as `eventpass-api`). Holds the Supabase **service-role** key and does what the browser can't: send email, provision subdomains via the Cloudflare API, create clients + invite users, and run scheduled jobs (`backend/src/jobs.ts`, hourly cron). Email uses Cloudflare's native `send_email` binding (`env.EMAIL`), not a third-party API.
3. **Database** — **Supabase Postgres**, multi-tenant via **Row-Level Security**. This is the source of truth for authorization.

### Tenancy and the "active org"
- `frontend/src/lib/tenant.tsx` resolves the **public** tenant from the hostname (`<slug>.eventosfacil.net` or a premium `custom_hostname`), used by the public landing/registration pages.
- `frontend/src/lib/activeOrg.ts` resolves the **admin** org for the dashboard — normally the user's own membership, but a platform superadmin can "manage as client" (impersonation stored in `sessionStorage`), and the admin pages operate on that org instead. `AdminPanel`, `EventosAdmin`, and accreditation call `resolveActiveOrg()`; changing how admin pages pick their org means touching this file.

### Roles (two distinct systems)
- **Org roles** (`memberships.role`: `owner` / `admin` / `staff`) scope a user to one organization.
- **Platform superadmin** (`platform_admins` table + `is_platform_admin()`) is the SaaS owner. Superadmins get cross-tenant read/manage via `*_platform_all` / `*_platform_read` RLS policies and dedicated `admin_*` RPCs. The `/superadmin` console manages clients, plans, subscription-payment approvals, and other superadmins.

### RLS + security-definer RPC pattern (important)
Anonymous visitors and members cannot do certain writes directly (public registration inserts, seat reservation, cross-tenant org creation, etc.). Those go through **`security definer` RPCs** that validate and act with elevated rights (e.g. `register_with_seat`, `create_organization`, `submit_comprobante`, `approve_subscription_payment`). When adding a flow that a role's RLS forbids, add an RPC rather than loosening a policy. Operations that need the service role (creating auth users, calling the Cloudflare API) live in the Worker, not in an RPC.

### Subdomain provisioning
Cloudflare Pages does **not** support wildcard custom domains, so each `<slug>.eventosfacil.net` is registered individually via the Cloudflare API from the Worker (`backend/src/tenants.ts`): it creates the DNS `CNAME → pages.dev` record and the Pages custom domain. This runs automatically when a client is created and can be re-triggered from the admin "Subdomain" section or the superadmin console. Validation is async (~1–2 min → status `active`); a fresh subdomain returns HTTP 522 until it validates.

### Plan limits
Enforced in the DB by `BEFORE INSERT` triggers on `events` and `registrations` (`enforce_event_limit` / `enforce_registration_limit`) reading the `plans` table. Enforcement is server-side and applies to every insert path (admin UI and public RPCs alike).

## Migrations & deployment conventions

- Migrations are timestamped SQL files in `infra/supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`). **They are applied manually in the Supabase SQL Editor** — there is no migration runner in CI or wrangler. When you add one, write it idempotently (`create ... if not exists`, `create or replace`, `drop policy if exists` before `create policy`) and give the user the SQL to paste. New RLS policies for a table can be added alongside existing ones (permissive policies OR together).
- **Frontend deploys via GitHub Actions** on push to `main` touching `frontend/**` (`.github/workflows/deploy-frontend.yml`). **Backend does not** — deploy it manually with `wrangler deploy`.
- Git flow: work on `develop`, then merge to `main` (`git merge develop --no-edit`) and push both. Deploys/DB changes are the user's to trigger unless asked.

## Configuration

- Frontend env: `frontend/.env` (gitignored) with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (the Worker URL). `.env.production` is used for prod builds; `VITE_API_URL` must point at `https://eventpass-api.sisteg.workers.dev` in prod.
- Worker config: `backend/wrangler.toml` holds non-secret vars (Supabase URL, `EMAIL_FROM`, `APP_BASE_URL`, Cloudflare account/zone/project IDs for provisioning). Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CF_API_TOKEN`, `CRON_SECRET`) are set via `wrangler secret put`. The `CF_API_TOKEN` needs Cloudflare **Pages: Edit + Zone DNS: Edit** for subdomain provisioning to work end-to-end.

## Gotchas

- **oxlint is the build gate, not the IDE.** The IDE flags a11y warnings on inputs wrapped in `<label>` (the `Field` component) and inline-`style` warnings on genuinely dynamic styling (branding colors, badge/progress-bar sizes in mm). These are false positives; oxlint passes. Don't rewrite that code to silence the IDE.
- `README.md` is **outdated** — it describes a pre-pivot Node/Express + DigitalOcean + Resend architecture that no longer applies. Trust this file and the code over the README and the `docs/` proposals.
- Supabase Auth requires email confirmation (`mailer_autoconfirm = false`), so self-service signup defers org creation until after the confirmation link (`/bienvenida`, driven by `lib/onboarding.ts` reading org data stashed in user metadata). Invited client admins set their password at `/definir-clave`. Add `https://eventosfacil.net/**` to Supabase Auth redirect URLs for these to work.
