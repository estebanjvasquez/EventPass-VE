import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Local UI/API-contract checks only. Supabase is mocked; no production writes.
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:5174';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch();
const output = new URL('../test-results/agenda-design/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  let saved, reject = false;
  const config = { other_module: { keep: true }, public_agenda: { refresh_seconds: 60, custom_future_field: 'preserved' } };
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path.endsWith('/organizations')) body = { branding: {} };
    if (path.endsWith('/events')) {
      body = { id: 'qa-event', config };
      if (route.request().method() === 'PATCH') {
        saved = route.request().postDataJSON();
        body = reject ? null : { id: 'qa-event' };
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Tu evento, en primer plano.' }).waitFor();
  await page.evaluate(async config => {
    const loaded = (name) => performance.getEntriesByType('resource').map(e=>e.name).find(url=>url.includes(`/deps/${name}?`));
    const { default: React } = await import(loaded('react.js'));
    const { default: { createRoot } } = await import(loaded('react-dom_client.js'));
    const { MemoryRouter } = await import(loaded('react-router-dom.js'));
    const { PublicAgendaDesigner } = await import('/src/pages/admin/agenda/PublicAgendaDesigner.tsx');
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    host.style.padding = '16px';
    const now = Date.now();
    const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><rect width="160" height="60" fill="white"/><text x="10" y="40" fill="#006b54" font-size="30">ENERGÍA</text></svg>');
    const item = { event_name: 'Foro energético de prueba', session_id: 's1', session_name: 'Operaciones seguras y transición energética', session_type: 'lecture', session_status: 'scheduled', starts_at: new Date(now-60000).toISOString(), ends_at: new Date(now+3600000).toISOString(), stage_name: 'Auditorio', speakers: [{id:'p1',full_name:'María Rivas'}], sponsors: [{name:'Energía QA',logo_url:logo}], event_sponsors: [{name:'Energía QA',logo_url:logo},{name:'Sin logo QA'}] };
    createRoot(host).render(React.createElement(MemoryRouter, null, React.createElement(PublicAgendaDesigner, { event: {id:'qa-event',organization_id:'qa-org',name:item.event_name,config},items:[item],onSaved:async()=>{} })));
  }, config);
  await page.getByRole('heading', {name:'Diseña la pantalla de tu evento'}).waitFor();
  console.log('Designer mounted');
  const preview = page.locator('.agenda-preview');
  await page.getByLabel('En cada actividad', {exact:true}).selectOption('logos');
  assert.equal(await preview.locator('.agenda-sponsors img').count(), 2);
  await page.getByLabel('En cada actividad', {exact:true}).selectOption('names');
  assert.equal(await preview.locator('.agenda-sponsors img').count(), 0);
  await page.getByLabel('En cada actividad', {exact:true}).selectOption('none');
  assert.equal(await preview.locator('.agenda-sponsors').count(), 0);
  assert(await preview.locator('footer').isVisible(), 'Activity and general sponsors independent');
  await page.getByRole('button',{name:'Pausar cintillo'}).click();
  assert.equal(await preview.locator('.agenda-marquee-track').evaluate(el=>getComputedStyle(el).animationPlayState), 'paused');
  await page.getByRole('button',{name:'Reanudar cintillo'}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await preview.locator('.agenda-marquee-track').evaluate(el=>getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  for (const layout of ['cards','timeline','split']) {
    await page.getByLabel('Distribución',{exact:true}).selectOption(layout);
    assert(await page.locator(`.agenda-layout-${layout}`).isVisible());
  }
  await page.getByRole('button',{name:/Corporativo claro/}).click();
  console.log('Sponsor, motion and layout checks passed');
  await page.getByLabel('Título de la pantalla',{exact:true}).fill('Programa de prueba actualizado');
  await page.getByRole('button',{name:'Guardar configuración',exact:true}).click();
  await page.getByText('Diseño guardado.',{exact:false}).waitFor();
  assert.equal(saved.config.public_agenda.refresh_seconds,60);
  assert.equal(saved.config.public_agenda.custom_future_field,'preserved');
  assert.equal(saved.config.other_module.keep,true);
  assert.equal(saved.config.public_agenda.title,'Programa de prueba actualizado');
  reject = true;
  await page.getByRole('button',{name:'Guardar configuración',exact:true}).click();
  await page.getByText(/La configuración cambió en otra ventana/).waitFor();
  await page.getByText('Colores personalizados',{exact:true}).click();
  await page.getByLabel('Texto',{exact:true}).fill('#f3f5f7');
  assert(await page.getByRole('button',{name:'Guardar configuración',exact:true}).isDisabled(), 'Reject unreadable contrast');
  await page.getByRole('button',{name:/Corporativo claro/}).click();
  for (const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    assert(await page.locator('body').evaluate(el=>el.scrollWidth <= innerWidth), `No overflow at ${width}`);
    await page.screenshot({path:new URL(`designer-${width}.png`,output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: sponsor modes, independent ticker, pause, reduced motion, layouts, saved fields, preserved config, zero-row guard, 3 responsive widths. No production writes.');
} finally { await browser.close(); }
