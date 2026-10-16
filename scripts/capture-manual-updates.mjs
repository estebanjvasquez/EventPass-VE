// Capture actual React screens using fictional, intercepted data. No production writes.
import assert from 'node:assert/strict'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js'
import { chromium } from '../frontend/node_modules/@playwright/test/index.mjs'

const root = fileURLToPath(new URL('../frontend/', import.meta.url))
const fixture = root + '.manual-capture.tsx'
const imageDir = root + 'public/manual/images/'
const org = '00000000-0000-4000-8000-000000000001', user = '00000000-0000-4000-8000-000000000002'
const professional = '00000000-0000-4000-8000-000000000010', social = '00000000-0000-4000-8000-000000000020'
const fictionalUser = { id: user, email: 'administracion@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-10-01T10:00:00Z' }
const supabase = 'https://manual-qa.supabase.co', api = 'https://manual-api.invalid'
const household = { id: 'h1', name: 'Grupo de demostración' }
const events = [
  { id: professional, organization_id: org, name: 'Foro de demostración', event_type: 'forum', status: 'published', total_slots: 150, config: { registration_mode: 'invitation', event_subtype: 'conference', event_purpose: 'institutional', guest_management: false } },
  { id: social, organization_id: org, name: 'Boda de demostración', event_type: 'social', status: 'draft', total_slots: 80, config: { registration_mode: 'invitation', event_subtype: 'wedding', event_purpose: 'private', guest_management: true } },
]
function operations(id) {
  const event = events.find(e => e.id === id) ?? events[0]
  return { event: { ...event, registration_mode: 'invitation' }, manager: true, settings: { capacity_policy: 'issue', inviter_identity: false, revision: 1 },
    allocations: [{ id: 'a1', name: event.event_type === 'social' ? 'Familia de demostración' : 'Patrocinante de demostración', kind: 'organizer', quantity: 10, rights: [event.event_type === 'social' ? 'social' : 'forum'], origin: 'Acuerdo aprobado' }],
    invitations: [{ id: 'i1', allocation_id: 'a1', state: 'available' }, { id: 'i2', allocation_id: 'a1', state: 'redeemed', participant_name: 'Invitada de ejemplo', attended: false }],
    households: [household], members: [{ id: 'm1', household_id: 'h1', invitation_id: 'i2', first_name: 'Invitada', last_name: 'de ejemplo', rsvp: 'accepted', table_id: 't1' }], tables: [{ id: 't1', name: 'Mesa principal', capacity: 8 }],
    tasks: [{ id: 'task1', title: 'Verificar montaje y señalización', provider: 'Proveedor de demostración', responsible: 'Coordinación del evento', status: 'open', revision: 1 }],
    budget: [{ id: 'budget1', title: 'Montaje · presupuesto inicial', provider: 'Proveedor de demostración', amount: 250, currency: 'USD', usd: 250, ves_per_usd: 1, rate_source: 'USD nominal', rate_date: '2026-10-16', kind: 'expense', stage: 'planned', revision: 1 }],
    benefits: [], components: [], sessions: [], reviews: [], audit: [],
  }
}
let server, browser
try {
  await mkdir(imageDir, { recursive: true })
  await writeFile(fixture, `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import {AuthProvider} from './src/lib/auth';import AuthenticatedHeader from './src/components/AuthenticatedHeader';import EventAdminWorkspace from './src/components/EventAdminWorkspace';import {EventForm,OrganizationSettings} from './src/pages/admin/EventosAdmin';import EventOperations from './src/pages/admin/EventOperations';import PrivateInvitation from './src/pages/PrivateInvitation';import AcreditacionEvento from './src/pages/admin/AcreditacionEvento';import CommercialCatalog from './src/components/CommercialCatalog';import './src/index.css';const shell=(node)=><><AuthenticatedHeader/><EventAdminWorkspace>{node}</EventAdminWorkspace></>;createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><div className="pointer-events-none fixed bottom-2 right-2 z-[200] rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900">Manual · datos ficticios de demostración</div><Routes><Route path="/admin/manual/nuevo" element={shell(<main className="mx-auto max-w-5xl p-6"><EventForm orgId="${org}" userId="${user}" event={null} onClose={()=>{}} onSaved={()=>{}}/></main>)}/><Route path="/admin/organizacion/configuracion" element={shell(<OrganizationSettings/>)}/><Route path="/admin/eventos/:eventId/operaciones" element={shell(<EventOperations/>)}/><Route path="/admin/impresion" element={shell(<AcreditacionEvento mode="print-center"/>)}/><Route path="/admin/badge-designer" element={shell(<AcreditacionEvento mode="designer"/>)}/><Route path="/invitacion/:eventId/:mode" element={<PrivateInvitation/>}/><Route path="/planes" element={<CommercialCatalog/>}/></Routes></AuthProvider></BrowserRouter>);`)
  server = await createServer({ root, define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('manual-public-key'), 'import.meta.env.VITE_API_URL': JSON.stringify(api) }, server: { host: '127.0.0.1', port: 4190, strictPort: true, hmr: false } })
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user, exp, role: 'authenticated' })).toString('base64url') + '.manual'
  await context.addInitScript(({ token, exp, fictionalUser }) => localStorage.setItem('sb-manual-qa-auth-token', JSON.stringify({ access_token: token, refresh_token: 'manual-only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: fictionalUser })), { token, exp, fictionalUser })
  const unexpected = []
  await context.route(supabase + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1)
    const body = req.postData() ? req.postDataJSON() : {}
    let data = []
    if (url.pathname === '/auth/v1/user') data = fictionalUser
    else if (name === 'memberships') data = { organization_id: org, role: 'owner', organizations: { name: 'Organización de demostración' } }
    else if (name === 'organizations') data = { id: org, name: 'Organización de demostración', slug: 'organizacion-demo', branding: { name: 'Organización de demostración', color: '#059669' } }
    else if (name === 'events') data = events.find(e => url.searchParams.get('id') === 'eq.' + e.id) ?? events[0]
    else if (name === 'is_platform_admin' || name === 'is_support_operator') data = false
    else if (name === 'get_event_operations') data = operations(body.p_event)
    else if (name === 'get_accreditation_event_options') data = [{ id: professional, name: events[0].name, status: 'published', total_participants: 0, ready_participants: 0, can_print: true, can_configure: true }]
    else if (name === 'get_accreditation_metrics') data = [{ initial_prints: 0, reprints: 0, cancellations: 0, walk_ins: 0, delivered: 0, failures: 0, average_service_seconds: null }]
    else if (!['payment_methods', 'badge_templates', 'badge_print_jobs', 'badge_template_versions', 'badge_assets', 'badge_print_batches', 'report_badge_print_station'].includes(name)) unexpected.push(name)
    await route.fulfill({ json: data, headers: { 'content-range': '0-0/0' } })
  })
  await context.route(api + '/**', route => {
    if (route.request().url().includes('/domain-status')) return route.fulfill({ json: { status: 'none' } })
    return route.fulfill({ json: { event_name: events[1].name, household_name: household.name, members: [{ id: 'm1', first_name: 'Invitada', last_name: 'de ejemplo', rsvp: 'pending', table_name: null, credential_token: null }] } })
  })
  // Do not probe a real print station while generating documentation.
  await context.route(/https?:\/\/(localhost|127\.0\.0\.1):(9100|18181)\//, route => route.abort())
  await context.route('http://127.0.0.1:4190/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (/^\/(admin|invitacion|planes)/.test(path)) return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(path, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.manual-capture.tsx"></script></body></html>') })
    return route.continue()
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const capture = async (name, fullPage = false) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: imageDir + name, fullPage }); console.log('CAPTURE', name) }
  await page.goto('http://127.0.0.1:4190/admin/manual/nuevo')
  await page.getByRole('combobox', { name: /^Tipo/ }).selectOption('social')
  await page.getByLabel('Subtipo del evento').selectOption('wedding')
  await page.getByLabel('Nombre del evento').fill(events[1].name)
  await capture('31-nuevo-evento-social.png')
  await page.goto('http://127.0.0.1:4190/admin/organizacion/configuracion')
  await page.getByRole('heading', { name: 'Subdominio', exact: true }).waitFor()
  await capture('32-configuracion-organizacion.png', true)
  await page.goto(`http://127.0.0.1:4190/admin/eventos/${professional}/operaciones`)
  await page.getByRole('heading', { name: events[0].name, exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Grupos y mesas', exact: true }).count(), 0)
  await capture('33-invitaciones-profesionales.png')
  await page.getByRole('button', { name: 'Producción', exact: true }).click()
  await capture('34-produccion-proveedores.png')
  await page.getByRole('button', { name: 'Presupuesto', exact: true }).click()
  await capture('35-presupuesto-organizador.png')
  await page.goto(`http://127.0.0.1:4190/admin/eventos/${social}/operaciones`)
  await page.getByRole('button', { name: 'Grupos y mesas', exact: true }).click()
  await capture('36-grupos-rsvp-mesas.png')
  await page.getByRole('heading', { name: 'Crear mesa', exact: true }).scrollIntoViewIfNeeded()
  await capture('37-asignacion-mesas.png')
  await page.goto(`http://127.0.0.1:4190/invitacion/${social}/hogar`)
  await page.getByLabel('Código de invitación').fill('EJEMPLO-NO-VALIDO')
  await page.getByRole('button', { name: 'Ver mi grupo' }).click()
  await page.getByRole('button', { name: 'Guardar respuesta' }).waitFor()
  await capture('38-respuesta-invitado.png')
  await page.goto('http://127.0.0.1:4190/admin/impresion')
  await page.getByRole('link', { name: 'Descargar conector para Windows' }).waitFor()
  await page.getByRole('combobox', { name: 'Evento de configuración' }).selectOption(professional)
  await capture('39-centro-impresion-conector.png')
  await page.goto('http://127.0.0.1:4190/admin/badge-designer')
  await page.getByRole('button', { name: /Publicar/ }).first().waitFor()
  await capture('40-badge-designer.png')
  await page.goto('http://127.0.0.1:4190/planes')
  await page.getByRole('heading', { name: 'Una opción para cada evento' }).waitFor()
  assert.doesNotMatch(await page.locator('#planes').innerText(), /\$|USD|\/mes|14 días|50 participantes/)
  assert.equal(await page.locator('#planes article').count(), 3)
  await capture('41-opciones-genericas.png')
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
} finally {
  await browser?.close(); await server?.close(); await unlink(fixture).catch(() => {})
}
