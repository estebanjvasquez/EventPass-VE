import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Real deployed pages, anonymous contexts; no registrations, emails or payments.
// The named QA campaign gains test visits and starts in production metrics.
const origin='https://expo-energia-2026.eventosfacil.net';
const forum='47ad0375-24dd-4f40-80c0-500f4362767c';
const program='8f84c7bf-384c-4756-8b47-bde4306642a3';
const other='5da6c528-f7b2-4fa8-b458-3adb83fbd095';
const campaign='12879085-bfa8-4aed-867e-de14dd8c7ea0';
const output=new URL('../test-results/corrections-production/',import.meta.url);
await mkdir(output,{recursive:true});
const results=[];
const browser=await chromium.launch();
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage(); const visits=[];
    page.on('response',async response=>{
      if(response.url().endsWith('/rpc/track_event_visit')) visits.push({body:response.request().postDataJSON(),status:response.status()});
    });
    await page.goto('https://eventosfacil.net/qa-smoke-ruta-inexistente');
    await expect(page.getByRole('heading',{name:'Página no encontrada'})).toBeVisible();
    results.push({width,case:'QA-05',result:'PASS'});
    await page.goto(`${origin}/?utm_campaign=${campaign}&utm_source=instagram&utm_medium=social&ep_event=${forum}`);
    await expect(page.getByRole('heading',{name:'Eventos del programa'})).toBeVisible();
    await expect.poll(()=>visits.some(v=>v.body.p_stage==='landing'&&v.status>=200&&v.status<300)).toBe(true);
    assert.equal(await page.getByRole('link',{name:'Solicitar información',exact:true}).count(),0);
    results.push({width,case:'QA-02',result:'PASS',detail:'Unavailable contact form CTA hidden'});
    const landing=visits.find(v=>v.body.p_stage==='landing'&&v.status>=200&&v.status<300).body;
    const link=page.getByRole('link',{name:'Foro Energetico de Venezuela',exact:true});
    assert.equal(new URL(await link.getAttribute('href'),origin).searchParams.get('utm_campaign'),campaign);
    await link.click();
    await expect(page.getByRole('heading',{name:'Foro Energetico de Venezuela',exact:true})).toBeVisible();
    await expect.poll(()=>visits.some(v=>v.body.p_stage==='form'&&v.body.p_visit_id===landing.p_visit_id&&v.status>=200&&v.status<300)).toBe(true);
    results.push({width,case:'QA-03',result:'PASS',visit_id:landing.p_visit_id,detail:'Same visit, campaign and program; form RPC accepted'});
    await page.goto(`${origin}/p/${program}/registro`);
    await expect(page.getByRole('heading',{name:'Registro conjunto no disponible'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Ver entradas de Foro Energetico de Venezuela'})).toBeVisible();
    assert.equal(await page.getByLabel('Acceso',{exact:true}).count(),0);
    results.push({width,case:'QA-01',result:'PASS'});
    await page.goto(`${origin}/e/${other}`);
    await expect(page.getByRole('heading',{name:'No hay un evento disponible'})).toBeVisible();
    assert.equal(await page.getByRole('button',{name:'Reservar mi plaza'}).count(),0);
    results.push({width,case:'QA-04',result:'PASS'});
    await context.close();
    console.log(`PASS ${width}px: deployed QA-01, QA-02, QA-03, QA-04, QA-05; no registrations sent.`);
  }
  // Real public room screen: preference at load and changes during the session.
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.goto(`https://eventosfacil.net/e/${forum}/agenda`);
  const footer=page.locator('.agenda-sponsor-footer');
  await expect(footer).toBeVisible();
  const states=()=>footer.locator('.agenda-marquee-track').evaluate(el=>el.getAnimations().map(a=>a.playState));
  await expect.poll(async()=> (await states()).includes('running')).toBe(false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect.poll(async()=> (await states()).includes('running')).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(async()=> (await states()).includes('running')).toBe(false);
  results.push({case:'QA-06',result:'PASS',detail:'Real public ticker stops/resumes/stops with media preference'});
  console.log('PASS deployed QA-06: initial reduced motion and runtime changes.');
  await writeFile(new URL('results.json',output),JSON.stringify({date:new Date().toISOString(),results},null,2));
} finally { await browser.close(); }

