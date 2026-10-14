import assert from 'node:assert/strict';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from '../frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '../frontend/node_modules/@playwright/test/index.mjs';

const root=fileURLToPath(new URL('../frontend/',import.meta.url));
const fixture=root+'.support-qa.tsx',html=root+'.support-qa.html';
const event='00000000-0000-4000-8000-000000000010',user='00000000-0000-4000-8000-000000000001';
let server,browser;
const supabaseUrl='https://support-qa.supabase.co';
try {
 await writeFile(fixture,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {AuthProvider} from './src/lib/auth';import EventPreparation from './src/components/EventPreparation';import SupportDesk from './src/pages/admin/SupportDesk';import './src/index.css';createRoot(document.getElementById('root')!).render(<MemoryRouter><AuthProvider>{location.search.includes('desk')?<SupportDesk/>:<div className="mx-auto max-w-4xl p-5"><EventPreparation eventId="${event}"/></div>}</AuthProvider></MemoryRouter>);`);
 await writeFile(html,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.support-qa.tsx"></script></body></html>');
 server=await createServer({root,define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(supabaseUrl),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('qa-public-key')},server:{host:'127.0.0.1',port:4183,strictPort:true}});await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const exp=Math.floor(Date.now()/1000)+3600;
 const jwt=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user,exp,role:'authenticated'})).toString('base64url')+'.test';
 const key='sb-'+new URL(supabaseUrl).hostname.split('.')[0]+'-auth-token';
 await context.addInitScript(({key,jwt,exp,user})=>localStorage.setItem(key,JSON.stringify({access_token:jwt,refresh_token:'qa-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id:user,email:'qa@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()}})),{key,jwt,exp,user});
 let prep={event_id:event,event_name:'Evento de prueba',scenario:'simple',needs_printing:false,checks:{},revision:1,required_steps:['registration','privacy','responsibles','contingency'],configuration_fingerprint:'qa',configuration_changed:false,can_edit:true,can_accept:true,acceptance:null};
 let conflict=false;let denied=false;let saved=0;let replies=0;
 const ticket={id:'qa-ticket',title:'Impresora sin conexión',description:'La estación necesita revisar el conector.',organization_name:'Organización QA',event_name:'Evento de prueba',event_id:event,status:'open',severity:'critical',assigned_to:null,response_note:null,updated_at:new Date().toISOString()};
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;const rpc=path.split('/').at(-1);const body=route.request().postDataJSON();let data;
  if(rpc==='get_event_preparation')data=prep;
  else if(rpc==='save_event_preparation'){
   if(conflict){conflict=false;return route.fulfill({status:409,json:{message:'La preparación cambió. Actualiza antes de guardar',code:'40001'}})}
   saved++;prep={...prep,revision:prep.revision+1};if(body.p_scenario!==prep.scenario||body.p_print!==prep.needs_printing)prep.checks={};
   prep.scenario=body.p_scenario;prep.needs_printing=body.p_print;
   if(body.p_step)prep.checks={...prep.checks,[body.p_step]:{done:body.p_done,note:body.p_note,at:new Date().toISOString(),actor_id:user}};
   data=prep;
  }else if(rpc==='accept_event_preparation'){assert.equal(body.p_fingerprint,'qa');prep={...prep,acceptance:{id:'qa-acta',revision:prep.revision,valid:true,accepted_at:new Date().toISOString(),statement:body.p_statement,actor_identity:{user_id:user},snapshot:{checks:prep.checks}}};data=prep}
  else if(rpc==='is_support_operator')data=!denied;
  else if(rpc==='is_platform_admin')data=false;
  else if(rpc==='support_workspace')data={tickets:[ticket],events:[{id:event,name:'Evento de prueba',organization_name:'Organización QA'}]};
  else if(rpc==='support_team')data=[{user_id:user,email:'qa@example.invalid'}];
  else if(rpc==='support_ticket_messages')data=[];
  else if(rpc==='support_update_ticket'){assert.equal(body.p_ticket,ticket.id);ticket.status=body.p_status;ticket.response_note=body.p_response;data=null}
  else if(rpc==='support_reply'){replies++;data='qa-message'}
  else throw new Error('Unexpected API request '+path);
  await route.fulfill({json:data});
 });
 const page=await context.newPage();await page.goto('http://127.0.0.1:4183/.support-qa.html');
 await page.getByText('0 de 4 pruebas registradas',{exact:false}).waitFor();
 let form=page.locator('form').filter({has:page.getByRole('heading',{name:'Registro de principio a fin'})});
 await form.getByLabel('Evidencia o resultado').fill('Registro y recuperación comprobados');await form.getByLabel('Prueba completada').check();await form.getByRole('button',{name:'Guardar paso'}).click();
 await page.getByText('1 de 4 pruebas registradas',{exact:false}).waitFor();assert.equal(saved,1);
 conflict=true;form=page.locator('form').filter({has:page.getByRole('heading',{name:'Privacidad y cobro'})});
 await form.getByLabel('Evidencia o resultado').fill('Textos revisados para el evento');await form.getByLabel('Prueba completada').check();await form.getByRole('button',{name:'Guardar paso'}).click();await page.getByRole('alert').filter({hasText:'cambió'}).waitFor();
 await form.getByRole('button',{name:'Guardar paso'}).click();await page.getByText('2 de 4 pruebas registradas',{exact:false}).waitFor();
 for(const title of ['Responsables y horario','Contingencia']){form=page.locator('form').filter({has:page.getByRole('heading',{name:title,exact:true})});await form.getByLabel('Evidencia o resultado').fill('Responsables y respaldo comprobados');await form.getByLabel('Prueba completada').check();await form.getByRole('button',{name:'Guardar paso'}).click();await page.getByText('Guardado correctamente.').waitFor();}
 await page.getByText('4 de 4 pruebas registradas',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Registrar aceptación'}).isDisabled(),true);
 await page.getByLabel('He revisado las evidencias').check();await page.getByRole('button',{name:'Registrar aceptación'}).click();await page.getByText('Acta vigente para esta preparación y configuración.').waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar acta',exact:false}).click();const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.txt'));
 await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../artifacts/support-preparation-desktop.png',import.meta.url)),fullPage:true});
 console.log('PASS browser: persistent steps, visible revision conflict, unlocked retry, explicit acceptance and acta download');
 prep={...prep,configuration_changed:true,checks:{},acceptance:{...prep.acceptance,valid:false}};await page.reload();await page.getByText('La configuración del evento cambió.',{exact:false}).waitFor();await page.getByText('0 de 4 pruebas registradas',{exact:false}).waitFor();
 await page.goto('http://127.0.0.1:4183/.support-qa.html?desk');await page.getByRole('heading',{name:'Bandeja de soporte'}).waitFor();await page.getByRole('heading',{name:ticket.title}).waitFor();
 await page.locator('select[name="assigned"]').selectOption(user);await page.getByLabel('Respuesta o solución').fill('Conector revisado y vinculado');await page.getByRole('button',{name:'Guardar atención'}).click();
 await page.getByText('Conversación y seguimiento',{exact:false}).click();await page.getByLabel('Añadir mensaje').fill('Confirmamos la solución del conector');await page.getByRole('button',{name:'Enviar mensaje'}).click();await page.waitForFunction(()=>document.querySelector('textarea[name="body"]').value==='');assert.equal(replies,1);
 await page.getByRole('button',{name:'Revisar preparación del evento'}).click();await page.getByRole('heading',{name:'Asistente de preparación'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('../artifacts/support-desk-mobile.png',import.meta.url)),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 denied=true;await page.reload();await page.getByText('Tu cuenta no tiene permiso de soporte.',{exact:false}).waitFor();assert.equal(await page.getByRole('heading',{name:ticket.title}).count(),0);
 console.log('PASS browser: invalidation warning, support assignment/reply, preparation navigation, mobile layout and access denial');
}finally{await browser?.close();await server?.close();await unlink(fixture).catch(()=>{});await unlink(html).catch(()=>{});}
