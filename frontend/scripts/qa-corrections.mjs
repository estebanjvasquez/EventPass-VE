import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5173';
const eventId = '00000000-0000-0000-0000-000000000010';
const programId = '00000000-0000-0000-0000-000000000020';
const campaign = '00000000-0000-0000-0000-000000000030';
const event = { id: eventId, organization_id:'qa-org', name:'Foro QA', status:'published', config:{ registration_mode:'free' }, organizations:{name:'QA'} };
const browser = await chromium.launch();
try {
  for (const width of [1440,390]) {
    const page = await browser.newPage({ viewport:{width,height:900} });
    const visits = []; let available = false; let accessError = false;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      const path = url.pathname;
      let data = null; let status = 200;
      if (path.endsWith('/events')) data = event;
      if (path.endsWith('/organizations')) data = {id:'qa-org',name:'QA',branding:{}};
      if (path.endsWith('/event_programs')) data = {id:programId,name:'Programa QA',registration_config:{web_event_id:eventId}};
      if (path.endsWith('/passes')) { data = []; if (accessError) { status = 500; data = {message:'Access query failed'}; } }
      if (path.endsWith('/program_events')) data = [{event_id:eventId,events:event}];
      if (path.endsWith('/get_public_event_lead_form')) data = available ? [{id:'qa-form'}] : [];
      if (path.endsWith('/track_event_visit')) { visits.push(route.request().postDataJSON()); data = null; }
      await route.fulfill({ status, contentType:'application/json',body:JSON.stringify(data),headers:{'Access-Control-Allow-Origin':origin} });
    });
    await page.goto(`${origin}/p/${programId}/registro`);
    await expect(page.getByRole('heading',{name:'Registro conjunto no disponible'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Ver entradas de Foro QA'})).toBeVisible();
    assert.equal(await page.getByLabel('Acceso',{exact:true}).count(),0);
    accessError = true;
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('No pudimos consultar');
    accessError = false;
    await page.goto(`${origin}/qa-smoke-ruta-inexistente`);
    await expect(page.getByRole('heading',{name:'Página no encontrada'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Volver al inicio'})).toHaveAttribute('href','/');
    // Mount the actual shared landing; all remote services remain mocked.
    const mount = async () => page.evaluate(async ({event,programId}) => {
      const loaded = name => performance.getEntriesByType('resource').map(e=>e.name).find(url=>url.includes(`/deps/${name}?`));
      const {default:React} = await import(loaded('react.js'));
      const {default:{createRoot}} = await import(loaded('react-dom_client.js'));
      const {MemoryRouter} = await import(loaded('react-router-dom.js'));
      const {default:Landing} = await import('/src/components/EventPublicLanding.tsx');
      document.getElementById('root').style.display='none';
      const host=document.createElement('div');document.body.append(host);
      createRoot(host).render(React.createElement(MemoryRouter,null,React.createElement(Landing,{event,registrationUrl:`/p/${programId}/registro`,linkedEvents:[{id:event.id,name:event.name}]})));
    }, {event,programId});
    await page.goto(`${origin}/?utm_campaign=${campaign}&utm_source=instagram&utm_medium=social&ep_event=${eventId}`);
    await expect(page.getByRole('heading',{name:'Tu evento, en primer plano.'})).toBeVisible();
    await mount();
    await expect(page.getByRole('heading',{name:'Eventos del programa'})).toBeVisible();
    await expect.poll(()=>visits.filter(v=>v.p_stage==='landing').length).toBeGreaterThan(0);
    const landing = visits.find(v=>v.p_stage==='landing');
    assert.equal(await page.getByRole('link',{name:'Solicitar información',exact:true}).count(),0);
    const href = await page.getByRole('link',{name:'Foro QA',exact:true}).getAttribute('href');
    assert.equal(new URL(href,origin).searchParams.get('utm_campaign'),campaign);
    await page.goto(origin+href);
    await expect(page.getByRole('heading',{name:'Foro QA',exact:true})).toBeVisible();
    await expect.poll(()=>visits.some(v=>v.p_stage==='form' && v.p_visit_id===landing.p_visit_id)).toBe(true);
    const form = visits.find(v=>v.p_stage==='form' && v.p_visit_id===landing.p_visit_id);
    assert.equal(form.p_program_id,programId);
    // A published contact form enables its CTA.
    available=true;
    await page.goto(origin);
    await expect(page.getByRole('heading',{name:'Tu evento, en primer plano.'})).toBeVisible();
    await mount();
    await expect(page.getByRole('link',{name:'Solicitar información',exact:true})).toBeVisible();
    await page.close();
    console.log(`PASS ${width}px: no-pass fallback, access errors, 404, contact CTA availability, shared landing -> individual visit continuity.`);
  }
} finally { await browser.close(); }
