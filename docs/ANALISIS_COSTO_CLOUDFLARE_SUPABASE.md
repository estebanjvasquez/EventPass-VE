# Análisis de Costo y Viabilidad — EventPass VE

## Arquitectura Cloudflare + Supabase (SaaS multi-tenant)

**Fecha:** Junio 2026
**Tipo:** Documento interno (no enviar al cliente — ver `COTIZACION_CLIENTE.md` para la versión comercial)
**Modelo:** Producto SaaS multi-cliente. El desarrollador-fundador absorbe el grueso del desarrollo como inversión; cada cliente paga setup + suscripción.

> Precios verificados en las páginas oficiales de Cloudflare y Supabase a junio 2026. Revisar antes de cada cotización porque cambian.

---

## 1. Resumen Ejecutivo

| Concepto | Monto | Quién lo asume |
|----------|-------|----------------|
| Desarrollo del sistema (one-time) | **~$12,600 – $14,000** | **Tú** (inversión del producto) |
| Operación de la plataforma (inicio) | **~$1.50 – $6.50 / mes** | **Tú** (free-tier, sirve a varios clientes) |
| Operación de la plataforma (producción) | **~$30 – $55 / mes** | **Tú** (sirve a decenas de clientes) |
| Setup/implementación por cliente | **$800 – $1,500** (one-time) | **El cliente** |
| Suscripción mensual por cliente | **$49 / $99 / $179** según plan | **El cliente** |

**Idea central:** se construye el sistema **una vez** y se alquila a muchos clientes. El stack serverless (Cloudflare + Supabase) reemplaza el costo fijo de DigitalOcean (~$44–89/mes por una sola instancia) por **~$30/mes que sirven a decenas de tenants** y escalan por uso. El cliente ancla cubre el despliegue y una porción del desarrollo vía un cargo de setup + su mensualidad; el resto del desarrollo se recupera con los siguientes clientes.

---

## 2. Arquitectura de Referencia

| Capa | Tecnología | Rol multi-tenant |
|------|-----------|------------------|
| Frontend | React 18 + Vite + Tailwind + Shadcn/ui en **Cloudflare Pages** | App única; resuelve el tenant por hostname |
| API / backend | **Cloudflare Workers** (Hono) + **Supabase Edge Functions** | Serverless; sin servidor que mantener |
| Base de datos | **Supabase Postgres** + **RLS** por `organization_id` | Una BD, aislamiento lógico por cliente |
| Autenticación | **Supabase Auth** (JWT) | Roles por organización (owner / admin / staff) |
| Storage | **Supabase Storage** o **Cloudflare R2** | Buckets/prefijos por tenant |
| Jobs (recordatorios, timeout de plazas) | **Cloudflare Cron Triggers** + **pg_cron** | Reemplaza Bull/Redis |
| Email | **Resend** | Free → $20/mes al escalar |
| WhatsApp (propuesto) | WhatsApp Cloud API | Diferenciador clave en Venezuela |
| Subdominios (clientes normales) | Wildcard DNS `*.DOMINIO` en Cloudflare | **Gratis** |
| Dominio propio / embed (premium) | **Cloudflare for SaaS** (custom hostnames) + widget iframe | 100 hostnames gratis, luego $0.10 c/u |

**Por qué este stack vs. el anterior (DigitalOcean + Node/Express/Prisma/Redis/Bull):**
- Sin servidor que administrar, parchear ni escalar manualmente.
- Auth, base de datos, storage y backups gestionados (Supabase) → menos código y menos riesgo operativo.
- Cron Triggers de Cloudflare reemplazan Redis + Bull para recordatorios/timeouts.
- Cloudflare for SaaS resuelve nativamente los requisitos de subdominios y dominios propios.
- Red global de Cloudflare → buena latencia desde Venezuela sin elegir región.

---

## 3. Costo de Desarrollo (one-time — tu inversión)

Base: el desglose de `ANÁLISIS_MERCADO_VENEZUELA.md §4.1`, ajustado al nuevo stack. Tarifa de referencia **$35/h** (freelancer senior Venezuela, ver `PRESUPUESTO_VENEZUELA_FREELANCER.md §1.1`).

| Tarea | Horas | Tarifa | Subtotal |
|-------|-------|--------|----------|
| Arquitectura, diseño y setup multi-tenant (RLS, resolución por hostname) | 40 | $35 | $1,400 |
| Frontend público (formularios dinámicos, portal de pago, página de evento con branding) | 80 | $35 | $2,800 |
| Panel administrativo (config de evento, verificación de comprobantes, reportes) | 70 | $35 | $2,450 |
| Backend / Workers + Edge Functions (APIs, auth, RLS, jobs) | 80 | $35 | $2,800 |
| Sistema de notificaciones (email + WhatsApp, plantillas por tenant) | 30 | $35 | $1,050 |
| Generación de credenciales / QR + check-in offline (PWA) | 30 | $35 | $1,050 |
| Cloudflare for SaaS (subdominios, custom hostnames, widget embebible) | 25 | $35 | $875 |
| Testing y QA | 30 | $35 | $1,050 |
| Despliegue, CI/CD, documentación y onboarding | 20 | $35 | $700 |
| **TOTAL** | **405** | | **$14,175** |

**Rango realista:** **$12,600 – $14,000** según eficiencia y alcance del MVP (algunos módulos como mapa de asientos o WhatsApp pueden diferirse a una segunda fase). Los servicios gestionados reducen el backend frente al stack Node anterior, pero el trabajo multi-tenant + routing por hostname + panel configurable lo compensa.

---

## 4. Costo Operativo de la Plataforma (lo que TÚ absorbes)

| Servicio | Inicio (free-tier) | En producción / escala | Notas |
|----------|--------------------|------------------------|-------|
| **Supabase** | $0 — Free: 500 MB BD, 1 GB storage, 50K MAU, 5 GB egress, **sin backups** | **$25/mes Pro**: 8 GB BD, 100 GB storage, 100K MAU, 250 GB egress, **backups diarios (7 días)**, +$10 créditos de compute | Pro es obligatorio en producción por los backups |
| **Cloudflare Workers Paid** | $0 (plan Free, 100K req/día) | **$5/mes**: 10M req/mes + Cron Triggers + KV + Queues | Necesario para Cron Triggers fiables |
| **Cloudflare Pages** | $0 | $0 | Hosting del frontend, builds incluidos |
| **Cloudflare R2** (opcional, si no usas Supabase Storage) | $0 (10 GB-mes, sin cargo de egreso) | $0.015/GB-mes, **egreso gratis** | Bueno para comprobantes/credenciales |
| **Cloudflare for SaaS** | $0 (primeros 100 hostnames) | $0.10/hostname/mes sobre 100 (cap 50,000) | Cubre dominios propios premium |
| **Dominio** (Cloudflare Registrar, al costo) | — | ~$1.50/mes (~$18/año) | Subdominios de clientes = gratis |
| **Email (Resend)** | $0 (3,000 emails/mes) | $20/mes (50,000 emails) | Subir solo al exceder free |
| **TOTAL** | **~$1.50/mes** | **~$30 – $55/mes** | Sirve a **decenas** de clientes |

### Costos de Cloudflare en detalle
- **Pages:** hosting estático del frontend, gratis con builds incluidos.
- **Workers Paid ($5/mes):** 10M requests/mes incluidos ($0.30/M extra), 30M ms de CPU incluidos, **Cron Triggers incluidos** (reemplazan Bull/Redis para recordatorios y liberación de plazas vencidas).
- **Cloudflare for SaaS:** **100 custom hostnames gratis**; luego **$0.10/hostname/mes** (cap 50,000 en PAYG). Los **subdominios** de clientes normales (`cliente.DOMINIO`) se sirven con **wildcard DNS gratis** y no consumen este cupo; solo los **dominios propios** de clientes premium usan custom hostnames.
- **R2:** 10 GB gratis, $0.015/GB después, **sin cargos de egreso** (ventaja frente a S3 para servir credenciales/comprobantes).
- **Cloudflare Registrar:** dominios al costo del registro (sin markup), p.ej. `.com` ~$10.44/año.
- **Email Routing:** gratis (reenvío de correos del dominio).

### Costos de Supabase en detalle
- **Free ($0):** ideal para desarrollo y los primeros 1–2 clientes piloto. Sin backups → no apto para producción seria.
- **Pro ($25/mes):** plan base de producción. 8 GB de BD y 100 GB de storage soportan **decenas de clientes** (los datos de registro son ligeros; el peso está en comprobantes/credenciales → conviene moverlos a R2). Overages: BD $0.125/GB, storage $0.0213/GB, MAU $0.00325, egreso $0.09/GB.
- **Team ($599/mes):** solo cuando haya volumen alto o se requiera SOC2/ISO 27001. No necesario en el horizonte previsible.

---

## 5. Diseño Multi-Tenant Configurable (Supabase)

Una sola base de datos Postgres con **Row-Level Security (RLS)**: cada fila lleva `organization_id` y las políticas garantizan que un cliente solo ve sus datos.

**Tablas núcleo de plataforma:**
- `organizations` — el cliente/tenant (nombre, slug de subdominio, custom hostname, plan, estado).
- `memberships` — relación usuario ↔ organización + rol (`owner` / `admin` / `staff`).
- `subscriptions` / `plans` — plan contratado, ciclo de cobro, estado de pago.

**Tablas de dominio (todas con `organization_id` + RLS):**
- `events`, `registrations`, `seats`, `payment_methods`, `admin_actions` (auditoría), `email_log` — reutilizan el modelo de `ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md §Arquitectura de Datos`.

**Configuración por cliente (columnas JSONB):** esto es lo que hace el sistema "configurable para diferentes clientes" sin tocar código:
- `branding` — logo, colores, nombre comercial.
- `payment_methods` — bancos/cuentas, Zelle, Binance/USDT, Pago Móvil.
- `email_templates` / `whatsapp_templates` — plantillas de preconfirmación, recordatorios, confirmación.
- `form_fields` — campos del formulario de registro según tipo de evento.
- `event_types` — foro/taller/social y sus reglas.

**Resolución de tenant:** un Worker de entrada toma el hostname (subdominio `cliente.DOMINIO` o custom hostname del premium), lo mapea a `organization_id`, y todas las consultas siguientes operan bajo el contexto RLS de ese tenant.

**Aislamiento de archivos:** buckets/prefijos por `organization_id` en Supabase Storage o R2.

---

## 6. Niveles de Cliente y Despliegue (puntos 6 y 7)

| Plan | Despliegue del frontend | Panel admin | Branding | Precio |
|------|------------------------|-------------|----------|--------|
| **Arranque ($49/mes)** | Subdominio `cliente.DOMINIO` | Sí (básico) | Logo | Subdominio |
| **Profesional ($99/mes)** | Subdominio `cliente.DOMINIO` | Sí (completo) | Logo + colores | Subdominio |
| **Asociación / Premium ($179/mes)** | **Dominio propio** o **embed (iframe)** en su sitio | Sí (completo + roles) | White-label | Custom hostname |

- **Todos los clientes afiliados** obtienen al darse de alta un **panel administrativo** para configurar su organización y crear/administrar eventos (punto 6): tipos de evento, métodos de pago, plantillas, campos del formulario, verificación de comprobantes, reportes y check-in.
- **Clientes normales (Arranque/Profesional):** el evento se publica en un **subdominio** automático (`cliente.DOMINIO`) servido por wildcard DNS — costo cero adicional (punto 7).
- **Clientes premium (Asociación):** pueden conectar su **dominio propio** vía Cloudflare for SaaS, o **embeber** el formulario/evento en su sitio web mediante un **widget iframe** (punto 7).

---

## 7. Estrategia de Cobro al Cliente Ancla

Decisión: **setup único + suscripción mensual** (no recuperar todo el desarrollo de golpe).

- **Setup / implementación (one-time): $800 – $1,500.** Cubre tu costo real de **despliegue** (configurar su organización, branding, subdominio/dominio, carga del primer evento, onboarding/training) más una porción del desarrollo.
- **Suscripción mensual:** plan Profesional (~$99/mes) recomendado, o tarifa ancla con descuento de lanzamiento.
- El **grueso del desarrollo** (~$13K) se trata como inversión del producto y se recupera con los **clientes siguientes** (ver proyecciones §8).

Detalle comercial completo en `COTIZACION_CLIENTE.md`.

---

## 8. Break-Even y Proyecciones

Recalculado con el costo operativo nuevo (~$30/mes vs. ~$44–89/mes del stack DigitalOcean). Escenarios base de `ANÁLISIS_MERCADO_VENEZUELA.md §5`.

**Inversión inicial:**
- Desarrollo: ~$13,300 (tu tiempo)
- Operación año 1: **~$360** (mezcla de free-tier los primeros meses + Pro ~$30/mes al final)
- **Total invertido: ~$13,660** (mejor que los $13,828 del análisis previo)

**Con ingresos de cliente ancla (setup $1,200 + Profesional $99/mes):**

| Período | Ingresos | Gastos | Balance acumulado |
|---------|---------|--------|-------------------|
| Año 1 (ancla + ~8 clientes, escenario conservador) | ~$8,400 + $1,200 setup = **~$9,600** | ~$13,660 | **-$4,060** |
| Año 2 (~22 clientes) | ~$26,400 | ~$1,500 (infra + soporte) | **+$20,840** |
| Año 3 (~35 clientes) | ~$48,000 | ~$2,000 | **+$66,840** |

El menor costo operativo **acorta el break-even** frente al análisis anterior (que proyectaba -$5,428 en Año 1). Con el cargo de setup del ancla, el déficit del Año 1 baja a ~$4,000 y se recupera en el Año 2.

---

## 9. Features Adicionales Propuestas

De sistemas similares (Eventbrite, Cvent, RegFox, Luma, Whova), priorizadas para Venezuela:

**Alta prioridad / diferenciadores:**
- **Notificaciones por WhatsApp** (Cloud API) — el canal #1 en Venezuela; mayor tasa de apertura que email.
- **Verificación de comprobante con multi-método local** (Zelle, Binance/USDT, Pago Móvil) — ya en el flujo actual.
- **Check-in offline (PWA)** — sobrevive a cortes de internet en el evento (ver `ANÁLISIS_MERCADO_VENEZUELA.md §7.3`).
- **Widget embebible (iframe)** y **API/webhooks** — para clientes premium.

**Media prioridad:**
- Constructor self-service de página de evento con branding por tenant.
- Lista de espera (waitlist), códigos promo/descuento, early-bird, múltiples tiers de entrada.
- Pase digital Apple/Google Wallet; impresión de credenciales batch.
- Roles de equipo por organización (owner/admin/staff).

**Baja prioridad / fase posterior:**
- Encuestas post-evento, agenda y networking entre asistentes.
- Mapa interactivo de asientos (ya contemplado en el análisis original).
- Reportes financieros avanzados (plan Asociación).

---

## 10. Nombres de Dominio Propuestos

> Disponibilidad por confirmar con el usuario (verificar en Cloudflare Registrar / Namecheap).

| Dominio | TLD | Precio aprox./año | Comentario |
|---------|-----|-------------------|------------|
| `eventpass.app` | .app | ~$14–20 | Moderno, fuerza HTTPS, ideal SaaS |
| `eventpass.events` | .events | ~$18–25 | Descriptivo del rubro |
| `eventpass.com.ve` | .com.ve | ~$15–50 | Confianza local Venezuela |
| `eventpass.ve` | .ve | ~$30–60 | Premium local, corto |
| `eventpassve.com` | .com | ~$10–12 | Económico, global |
| `pase.events` | .events | ~$18–25 | Corto, en español |
| `entradas.ve` | .ve | ~$30–60 | Genérico atractivo |
| `mievento.app` | .app | ~$14–20 | En español, memorable |

**Recomendación:** registrar un **`.app` o `.events` global** como dominio principal del SaaS (subdominios `cliente.eventpass.app`) + opcionalmente un **`.com.ve`** que redirija al principal para reforzar confianza local. Usar **Cloudflare Registrar** (precio al costo, sin markup).

---

## 11. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Acceso a servicios desde Venezuela | Cloudflare y Supabase son accesibles desde VE; sin región fija (red global de Cloudflare) |
| Cobro internacional | Zelle / Binance-USDT / PayPal (ver `ANÁLISIS_MERCADO_VENEZUELA.md §6.3`) |
| Cortes de luz/internet en eventos | Check-in offline-first (PWA), auto-save en formularios |
| Internet lento | Assets comprimidos, lazy loading, credenciales PDF <500 KB |
| Resistencia al cambio (WhatsApp+Excel) | Onboarding de 30 min, WhatsApp nativo, prueba gratuita 14 días |
| Crecimiento de storage (comprobantes) | Mover archivos a R2 (egreso gratis) en lugar de Supabase Storage |

---

## 12. Conclusión

- **Construir una vez (~$13K), alquilar a muchos.** El stack Cloudflare + Supabase baja la operación a **~$30/mes para decenas de clientes**.
- **El cliente ancla** cubre despliegue + una porción del desarrollo vía **setup ($800–1,500) + suscripción**, sin cargar el costo completo del producto.
- **Subdominios gratis** para clientes normales; **dominio propio/embed** para premium vía Cloudflare for SaaS.
- **Multi-tenant configurable** con RLS + JSONB en Supabase — cada cliente personaliza su evento desde su panel admin sin tocar código.
- **Break-even en Año 2** (~22 clientes), mejor que el análisis anterior gracias al menor costo operativo.

---

*Documento interno. Para la propuesta comercial ver `COTIZACION_CLIENTE.md`.*
