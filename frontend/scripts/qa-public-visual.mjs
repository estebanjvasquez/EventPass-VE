import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Local UI regression checks. All Supabase requests are intercepted; no production writes.
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local server');
const output = new URL('../test-results/public-visual/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const now = Date.now();
const session = {
  event_name: 'Encuentro Energético · QA', event_branding: { color: '#34d399' },
  session_id: 'session-1', session_name: 'Innovación y operaciones responsables',
  session_type: 'lecture', session_status: 'scheduled',
  starts_at: new Date(now - 600000).toISOString(), ends_at: new Date(now + 3600000).toISOString(),
  stage_name: 'Auditorio principal', speakers: [{ id: 'speaker-1', full_name: 'María Rivas' }],
  sponsors: [{ name: 'Patrocinante de prueba' }], event_sponsors: [],
};
const elements = [
  { id: 'stand-1', label: 'A-01', element_type: 'stand', x: 4, y: 3, width: 4, height: 3 },
  { id: 'stand-2', label: 'A-02', element_type: 'stand', x: 10, y: 3, width: 4, height: 3 },
  { id: 'aisle-1', label: 'Pasillo central', element_type: 'aisle', x: 2, y: 8, width: 18, height: 2 },
].map(item => ({ ...item, status: 'available', metadata: {}, visible: true }));

try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${width}: ${error.message}`));
    let lightAgenda = false;
    let brokenBlueprint = false;
    await page.route('**/*.supabase.co/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/rpc/get_public_forum_agenda')) body = [
        { ...session, public_agenda_config: lightAgenda ? { background_color: '#fafafa', text_color: '#18181b', accent_color: '#047857', text_scale: 'large' } : {} },
        { ...session, session_id: 'session-2', session_name: 'Coffee break', session_type: 'break', session_status: 'cancelled' },
      ];
      else if (path.endsWith('/events')) body = { config: { public_floorplan_visible: !route.request().url().includes('qa-unpublished') } };
      else if (path.endsWith('/venue_maps')) body = [{ id: 'map-1', organization_id: 'org-1', published: true, metadata: { width_units: 24, height_units: 14, ...(brokenBlueprint ? { background_path: 'org-1/missing.pdf', background_mime: 'application/pdf' } : {}) } }];
      else if (path.endsWith('/venue_map_elements')) body = elements;
      else if (path.endsWith('/published_exhibition_directory')) body = [{ element_id: 'stand-1', company_name: 'Energía de Prueba', category: 'Servicios petroleros', description: 'Soluciones para la industria energética.', social_links: { website: 'https://example.com' } }];
      else if (path.endsWith('/organizations')) body = { name: 'Organizador QA', branding: { name: 'Encuentro Energético', color: '#047857' } };
      if (path.startsWith('/storage/')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Object not found' }) });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Tu evento, en primer plano.' }).waitFor();
    await page.locator('img[fetchpriority="high"]').evaluate(image => image.decode());
    const cta = await page.getByRole('link', { name: 'Crear mi organización' }).boundingBox();
    assert(cta && cta.y + cta.height < 900, `Hero CTA visible at ${width}`);
    await page.screenshot({ path: new URL(`landing-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.goto(`${origin}/expo/qa-event/plano`);
    await page.getByRole('button', { name: /Energía de Prueba/ }).waitFor();
    await page.locator('canvas').first().waitFor();
    const before = await page.locator('canvas').first().evaluate(canvas => canvas.toDataURL());
    await page.getByPlaceholder('Buscar empresa, stand o categoría').fill('petroleros');
    assert.equal(await page.getByRole('button', { name: /Energía de Prueba/ }).count(), 1);
    const after = await page.locator('canvas').first().evaluate(canvas => canvas.toDataURL());
    assert.equal(before, after, 'Filtering must not remove venue geometry');
    await page.getByRole('button', { name: /Energía de Prueba/ }).click();
    const detail = page.getByRole('region', { name: 'Detalle del elemento seleccionado' });
    await detail.waitFor();
    assert(await detail.getByText('Soluciones para la industria energética.').isVisible());
    const bounds = await detail.boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y < 900, `Detail visible at ${width}`);
    await page.screenshot({ path: new URL(`floorplan-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.keyboard.press('Escape');
    await detail.waitFor({ state: 'detached' });
    await page.emulateMedia({ media: 'print' });
    assert(await page.locator('#root').isVisible(), 'Public plan must not print a blank page');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => localStorage.setItem('floorplan-favorites-qa-event', '{invalid'));
    await page.reload();
    await page.getByRole('button', { name: /Energía de Prueba/ }).click();
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
    await detail.getByRole('button', { name: 'Guardar', exact: true }).click();
    assert(await detail.getByRole('button', { name: 'Guardado', exact: true }).isVisible(), 'Blocked storage retains favorite for current visit');
    brokenBlueprint = true;
    await page.reload();
    await page.getByText(/El fondo del recinto no está disponible/).waitFor();
    assert(await page.locator('canvas').first().isVisible(), 'A missing blueprint must not hide stands');
    await page.evaluate(() => {
      history.pushState({}, '', '/expo/qa-unpublished/plano');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByText('El organizador no ha publicado el plano de este evento.').waitFor();
    assert.equal(await page.locator('canvas').count(), 0, 'Do not retain the previous event canvas');
    brokenBlueprint = false;
    for (const light of [false, true]) {
      lightAgenda = light;
      await page.goto(`${origin}/e/qa-event/agenda`);
      await page.getByText('Programa del día').waitFor();
      assert(await page.getByText(/CANCELADA/).isVisible());
      assert(await page.getByText(/EN CURSO/).isVisible());
      assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), `No agenda overflow at ${width}`);
      await page.screenshot({ path: new URL(`agenda-${light ? 'light' : 'dark'}-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    }
    await context.close();
    console.log(`PASS ${width}px: landing, filters, detail, Escape, print, blocked storage, missing blueprint, event switch, agenda light/dark`);
  }
  assert.deepEqual(failures, [], 'No uncaught browser errors');
} finally { await browser.close(); }
