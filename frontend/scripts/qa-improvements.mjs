import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:5173';
const eventId='00000000-0000-0000-0000-000000000010';
const orgId='00000000-0000-0000-0000-000000000001';
const userId='00000000-0000-0000-0000-000000000003';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:900},permissions:[]});
  await context.addInitScript(({userId})=>{
    const user={id:userId,email:'qa@example.test',aud:'authenticated',role:'authenticated'};
    const jwt=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}))}.qa`;
    const session=JSON.stringify({access_token:jwt,refresh_token:'qa',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
    localStorage.setItem('sb-moqywmcbklaeaelttzdm-auth-token',session);
    localStorage.setItem('sb-qa-auth-token',session);
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>Promise.reject(new DOMException('denied','NotAllowedError')),enumerateDevices:()=>Promise.resolve([])}});
  },{userId});
  let closed=true;
  let checkedIn=false;
  const checks=[
    ['basics','Datos básicos',true,true],['dates','Fechas del evento',true,true],['deadline','Cierre de registro',true,true],
    ['registration','Modalidad de registro',true,true],['price','Precio o gratuidad',false,true],['payments','Métodos de pago',false,true],
    ['agenda','Agenda dentro de fechas',true,true],['passes','Pases públicos',false,false],['contact','Formulario de contacto',false,false],['public_link','Enlace público',true,false],
  ].map(([key,label,ok,blocking])=>({key,label,ok,blocking,detail:`Detalle ${label}`}));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    const path=url.pathname; const method=route.request().method();
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
    if(method==='OPTIONS')return respond({});
    if(path.includes('/auth/'))return respond({id:userId,email:'qa@example.test'});
    if(path.endsWith('/rpc/is_platform_admin'))return respond(false);
    if(path.endsWith('/rpc/get_public_event_registration_state'))return respond(closed?{available:false,reason:'El plazo de registro terminó.'}:{available:true,payment_required:false,price_known:true,payment_methods_ready:true});
    if(path.endsWith('/rpc/get_event_launch_readiness'))return respond({event_id:eventId,can_publish:false,checks});
    if(path.endsWith('/rpc/track_event_visit'))return respond(null);
    if(path.endsWith('/rpc/get_public_event_lead_form')||path.endsWith('/rpc/get_public_event_sponsors'))return respond([]);
    if(path.endsWith('/events'))return respond({id:eventId,organization_id:orgId,name:'Evento QA',description:'Descripción QA',event_type:'forum',status:'published',start_date:'2027-10-01T12:00:00Z',end_date:closed?'2020-10-01T12:00:00Z':'2027-10-01T18:00:00Z',registration_deadline:closed?'2020-09-30T12:00:00Z':'2027-09-30T12:00:00Z',config:{registration_mode:'free',public_landing:{headline:'Evento QA',subheadline:'Prueba'}},organizations:{name:'QA'}});
    if(path.endsWith('/organizations'))return respond({id:orgId,name:'QA',branding:{}});
    if(path.endsWith('/memberships'))return respond([{organization_id:orgId,user_id:userId,role:'owner',organizations:{name:'QA'}}]);
    if(path.endsWith('/access_points'))return respond([]);
    if(path.endsWith('/event_sessions'))return respond([]);
    if(path.endsWith('/registrations')){
      if(method==='PATCH'){checkedIn=true;return respond([]);}
      return respond({id:'reg-qa',first_name:'María',last_name:'QA',status:'confirmed',attendance_status:checkedIn?'checked_in':'no_attendance',events:{name:'Evento QA'}});
    }
    return respond([]);
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));
  await page.goto(`${origin}/e/${eventId}`);
  await expect(page.getByRole('heading',{name:'Registro no disponible'})).toBeVisible();
  await expect(page.getByText('El plazo de registro terminó.')).toBeVisible();
  closed=false;
  await page.reload();
  await expect(page.getByRole('button',{name:'Confirmar mi registro'})).toBeVisible();
  closed=true;
  await page.goto(`${origin}/evento/${eventId}`);
  await expect(page.getByText('Registro cerrado').first()).toBeVisible();
  await expect(page.getByRole('link',{name:'Registrarme'})).toHaveCount(0);
  await page.goto(`${origin}/admin/eventos/${eventId}/lanzamiento`);
  await expect(page.getByRole('heading',{name:'Checklist del evento'})).toBeVisible();
  await expect(page.getByText('2 requisitos bloquean la publicación.')).toBeVisible();
  await expect(page.getByText('10 verificaciones listas.')).toBeVisible();
  await page.goto(`${origin}/admin/checkin`);
  await expect(page.getByText('La cámara no está disponible; puedes continuar sin ella.')).toBeVisible();
  const token='a'.repeat(32);
  await page.getByPlaceholder('Pega o escribe el código').fill(token);
  await page.getByRole('button',{name:'Validar'}).click();
  await expect(page.getByRole('heading',{name:'¡Bienvenido, María!'})).toBeVisible();
  await page.getByRole('button',{name:'Escanear siguiente'}).click();
  await page.getByPlaceholder('Pega o escribe el código').fill(token);
  await page.getByRole('button',{name:'Validar'}).click();
  await expect(page.getByRole('heading',{name:'Ya había ingresado'})).toBeVisible();
  assert.equal(checkedIn,true);
  assert.deepEqual(pageErrors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS: cierre automático, registro habilitado, checklist de 10 reglas, cámara con fallback e ingreso válido/duplicado.');
  await context.close();
} finally { await browser.close(); }
