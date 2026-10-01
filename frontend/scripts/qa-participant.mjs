import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const origin='http://127.0.0.1:5173';
const output=new URL('../test-results/participant/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const eventId='00000000-0000-0000-0000-000000000010',siblingId='00000000-0000-0000-0000-000000000011',programId='00000000-0000-0000-0000-000000000020',orgId='00000000-0000-0000-0000-000000000001';
const event={id:eventId,name:'Foro QA',organization_id:orgId,status:'published',config:{registration_mode:'paid',ticket_categories_enabled:true},start_date:'2026-10-14T12:00:00Z',organizations:{name:'QA'}};
const program={id:programId,name:'Programa QA',registration_config:{web_event_id:eventId}};
const requests=[];
let site={id:'site-qa',status:'draft',slug:null,custom_hostname:null,landing_config:{headline:'Web QA',blocks:[]}};
let record={id:'record-qa',reference:'recordqa',name:'Maria QA',event_id:eventId,status:'pending_payment',deadline:'2026-12-01T12:00:00Z',snapshot:{event_name:'Foro QA',category:'VIP',amount:120,currency:'USD',timezone:'America/Caracas'},upload_token:'d'.repeat(32)};
let campaigns=[];
const failures=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>{
   const user={id:'00000000-0000-0000-0000-000000000003',email:'qa@example.test',aud:'authenticated',role:'authenticated'};
   const jwt=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}))}.qa`;
   localStorage.setItem('sb-moqywmcbklaeaelttzdm-auth-token',JSON.stringify({access_token:jwt,refresh_token:'qa',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
   sessionStorage.setItem('participant_access','b'.repeat(64));
  });
  // Deny ALL outgoing external requests unless explicitly mocked below.
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin)return route.continue();
   const path=url.pathname;const body=route.request().postDataJSON();
   requests.push({path,method:route.request().method(),body});
   const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value),headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   if(route.request().method()==='OPTIONS')return respond({});
   if(path.endsWith('/api/participant/records'))return respond({records:[record]});
   if(path.endsWith('/api/participant/recover'))return respond({message:'Si hay registros asociados, recibirás un enlace para consultarlos.'},202);
   if(path.endsWith('/api/participant/redeem'))return respond({access_token:'b'.repeat(64)});
   if(path.endsWith('/api/participant/close'))return respond({ok:true});
   if(path.endsWith('/api/registrations/notify')||path.endsWith('/api/registrations/confirm-notify'))return respond({status:'accepted'});
   if(path.includes('/auth/'))return respond({id:'00000000-0000-0000-0000-000000000003',email:'qa@example.test'});
   if(path.endsWith('/rpc/is_platform_admin'))return respond(false);
   if(path.endsWith('/rpc/event_promotion_destinations'))return respond([{site_id:null,program_id:null,label:'Página principal del evento',url:`https://eventosfacil.net/evento/${eventId}`}]);
   if(path.endsWith('/rpc/get_event_campaign_dashboard'))return respond({totals:{visits:0,starts:0,completions:0,form_only:0},campaigns,breakdown:[],legacy_events:4});
   if(path.endsWith('/rpc/create_event_campaign')){campaigns=[{id:'10000000-0000-0000-0000-000000000001',name:body.p_name,source:body.p_source,medium:body.p_medium,site_id:body.p_site_id,archived:false}];return respond(campaigns[0].id);}
   if(path.endsWith('/rpc/archive_event_campaign')){campaigns[0].archived=body.p_archived;return respond(null);}
   if(path.endsWith('/rpc/get_public_ticket_categories'))return respond([{id:'cat-qa',name:'VIP',description:'Acceso al foro',benefits:['Networking'],price:120,currency:'USD',remaining:1}]);
   if(path.endsWith('/rpc/register_event_attributed_purchase'))return respond([{registration_id:'reg-qa',credential_token:'d'.repeat(32),payment_required:true}]);
   if(path.endsWith('/rpc/create_registration_access'))return respond('b'.repeat(64));
   if(path.endsWith('/rpc/save_public_landing')){site={...site,landing_config:{...site.landing_config,...(body.p_publish?body.p_config:{}),draft:body.p_config}};return respond({site,event_config:{...event.config,public_landing_draft:body.p_config}});}
   if(path.includes('/rpc/'))return respond(null);
   if(path.endsWith('/events')){const id=url.searchParams.get('id')?.replace('eq.','')??eventId;return respond({...event,id,name:id===siblingId?'Expo QA':event.name});}
   if(path.endsWith('/event_programs'))return respond(program);
   if(path.endsWith('/program_events'))return respond(url.searchParams.has('event_id')?[{program_id:programId,event_programs:program}]:[{event_id:eventId,event:{id:eventId,name:'Foro QA'}},{event_id:siblingId,event:{id:siblingId,name:'Expo QA'}}]);
   if(path.endsWith('/public_sites'))return respond(site);
   if(path.endsWith('/memberships'))return respond([{organization_id:orgId,role:'owner',organizations:{name:'QA'}}]);
   if(path.endsWith('/organizations'))return respond({id:orgId,name:'QA',branding:{}});
   return respond([]);
  });
  const page=await context.newPage();page.on('pageerror',error=>failures.push(error.message));
  for(const id of [eventId,siblingId]){
   await page.goto(`${origin}/admin/eventos/${id}/landing`);
   await expect(page).toHaveURL(`${origin}/admin/programas/${programId}/landing`);
   await expect(page.getByRole('heading',{name:'Constructor de landing'})).toBeVisible();
   await expect(page.getByRole('button',{name:'Guardar borrador'}).first()).toBeEnabled();
   await page.getByLabel('Titular',{exact:true}).fill(`Web guardada ${id}`);
   await page.getByRole('button',{name:'Guardar borrador'}).first().click();
   await expect(page.getByText('Borrador guardado. La página pública no ha cambiado.')).toBeVisible();
   await page.reload();
   await expect(page.getByLabel('Titular',{exact:true})).toHaveValue(`Web guardada ${id}`);
  }
  await page.screenshot({path:new URL(`shared-site-${width}.png`,output).pathname.replace(/^\//,'')});
  await page.goto(`${origin}/admin/eventos/${eventId}/conversiones`);
  await page.getByLabel('Nombre de campaña',{exact:true}).fill('Lanzamiento Instagram QA');
  await page.getByRole('button',{name:'Crear campaña y enlace'}).click();
  const campaignLink=page.getByLabel('Enlace de Lanzamiento Instagram QA',{exact:true});
  await expect(campaignLink).toBeVisible();
  const campaignUrl=new URL(await campaignLink.inputValue());
  assert.equal(campaignUrl.pathname,`/evento/${eventId}`);
  assert.equal(campaignUrl.searchParams.get('utm_source'),'instagram');
  await page.getByRole('button',{name:'Archivar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reactivar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reactivar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Archivar',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:new URL(`campaigns-${width}.png`,output).pathname.replace(/^\//,'')});
  await page.goto(`${origin}${campaignUrl.pathname}${campaignUrl.search}`);
  await page.getByRole('link',{name:'Registrarme',exact:true}).first().click();
  assert.equal(new URL(page.url()).searchParams.get('utm_campaign'),campaigns[0].id);
  await page.getByRole('radio').check();
  await expect(page.getByRole('heading',{name:'Resumen del registro'})).toBeVisible();
  await expect(page.getByText('120,00 USD',{exact:true})).toBeVisible();
  await page.getByLabel('Nombre',{exact:true}).fill('Maria');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('qa@example.test');
  await page.getByLabel('Teléfono',{exact:true}).fill('123456789');
  await page.getByRole('button',{name:'Reservar mi plaza'}).click();
  await expect(page.getByRole('heading',{name:'¡Plaza reservada!'})).toBeVisible();
  const conversion=requests.filter(req=>req.path.endsWith('/rpc/register_event_attributed_purchase')).at(-1);
  const landing=requests.filter(req=>req.path.endsWith('/rpc/track_event_visit')&&req.body.p_stage==='landing').at(-1);
  assert.ok(landing.body.p_visit_id);
  assert.equal(conversion.body.p_visit_id,landing.body.p_visit_id);
  assert.equal(landing.body.p_campaign,campaigns[0].id);
  await page.getByRole('button',{name:'Consultar mi registro'}).click();
  await expect(page.getByRole('heading',{name:'Mi registro',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Cargar comprobante',exact:true})).toBeVisible();
  await page.screenshot({path:new URL(`record-${width}.png`,output).pathname.replace(/^\//,'')});
  record={...record,status:'payment_submitted',upload_token:null};
  await page.getByRole('button',{name:'Actualizar estado'}).click();
  await expect(page.getByRole('heading',{name:'Comprobante recibido'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Cargar comprobante',exact:true})).toHaveCount(0);
  record={...record,status:'confirmed',credential_token:'d'.repeat(32)};
  await page.getByRole('button',{name:'Actualizar estado'}).click();
  await expect(page.getByRole('link',{name:'Ver e imprimir credencial'})).toBeVisible();
  await page.goto(`${origin}/recuperar-registro?evento=${eventId}`);
  await page.getByLabel('Correo utilizado en el registro').fill('qa@example.test');
  await page.getByRole('button',{name:'Enviar enlace de acceso'}).click();
  await expect(page.getByRole('status')).toContainText('Si hay registros asociados');
  const prior=requests.filter(req=>req.path.endsWith('/redeem')).length;
  await page.goto(`${origin}/recuperar-registro#${'a'.repeat(64)}`);
  await expect(page.getByRole('button',{name:'Abrir mis registros'})).toBeVisible();
  assert.equal(requests.filter(req=>req.path.endsWith('/redeem')).length,prior);
  assert.equal(new URL(page.url()).hash,'');
  await page.getByRole('button',{name:'Abrir mis registros'}).click();
  await expect(page).toHaveURL(`${origin}/mi-registro`);
  await expect(page.getByRole('link',{name:'Ver e imprimir credencial'})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  record={...record,status:'pending_payment',credential_token:null,upload_token:'d'.repeat(32)};
  await context.close();
 }
 assert.deepEqual(failures,[]);
 console.log('PASS: both event entry points, shared draft reload, category/summary, registration state transitions, recovery explicit redeem, desktop/mobile. No external writes.');
}finally{await browser.close();}
