import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
async function handler(path,name,env){
 const source=await readFile(new URL('../'+path,import.meta.url),'utf8');const file=ts.createSourceFile('handler.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit)};visit(file);assert.ok(found,`Missing ${name}`);
 const code=ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified,found,file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(env),code+`;return ${name};`)(...Object.values(env));
}
function paymentEnv(overrides={}){const calls=[];const env={accepted:true,quote:{id:'server-quote',amount_usd:49,expires_at:new Date(Date.now()+60000).toISOString()},methods:[{id:'method'}],method:'method',reference:'reference',file:{name:'qa.pdf',size:100,type:'application/pdf'},orgId:'org',setBusy:v=>calls.push(['busy',v]),onError:v=>calls.push(['error',v]),onDone:async()=>calls.push(['done']),supabase:{storage:{from:()=>({upload:async()=>({error:null})})},rpc:async(name,args)=>{calls.push([name,args]);return {error:null}}},...overrides};return {env,calls}}
let fixture=paymentEnv();let submit=await handler('frontend/src/pages/admin/SuscripcionAdmin.tsx','submit',fixture.env);await submit();assert.ok(fixture.calls.some(c=>c[0]==='accept_commercial_terms'));const request=fixture.calls.find(c=>c[0]==='submit_subscription_quote');assert.equal(request[1].p_quote,'server-quote');assert.equal(request[1].p_amount,undefined);assert.equal(fixture.calls.at(-1)[0],'busy');assert.equal(fixture.calls.at(-1)[1],false);
console.log('PASS C04 UI submits server quote, never client amount, and releases lock');
fixture=paymentEnv({accepted:false});submit=await handler('frontend/src/pages/admin/SuscripcionAdmin.tsx','submit',fixture.env);await submit();assert.equal(fixture.calls[0][0],'error');assert.ok(!fixture.calls.some(c=>c[0]==='submit_subscription_quote'));
fixture=paymentEnv({methods:[]});submit=await handler('frontend/src/pages/admin/SuscripcionAdmin.tsx','submit',fixture.env);await submit();assert.equal(fixture.calls[0][0],'error');
fixture=paymentEnv({file:{name:'bad.exe',type:'application/octet-stream',size:10}});submit=await handler('frontend/src/pages/admin/SuscripcionAdmin.tsx','submit',fixture.env);await submit();assert.equal(fixture.calls[0][0],'error');
console.log('PASS C12 C14 missing method, terms and invalid receipt blocked before upload');
fixture=paymentEnv({supabase:{storage:{from:()=>({upload:async()=>({error:{message:'upload failed'}})})}}});submit=await handler('frontend/src/pages/admin/SuscripcionAdmin.tsx','submit',fixture.env);await submit();assert.ok(fixture.calls.some(c=>c[0]==='error'&&c[1]==='upload failed'));assert.equal(fixture.calls.at(-1)[1],false);
console.log('PASS C12 upload failure stays visible and payment is not submitted');
const calls=[];const signup=await handler('frontend/src/pages/CrearCuenta.tsx','onSubmit',{accepted:true,orgName:'QA',effectiveSlug:'qa-org',available:true,password:'password123',email:'qa@example.test',fullName:'QA',window:{location:{origin:'https://example.test'}},setError:v=>calls.push(['error',v]),setBusy:v=>calls.push(['busy',v]),setSent:v=>calls.push(['sent',v]),supabase:{auth:{signUp:async()=>({data:{session:{}},error:null})}},finishOnboarding:async()=>({error:'domain pending'}),navigate:(...args)=>calls.push(['navigate',args])});await signup({preventDefault(){}});assert.ok(!calls.some(c=>c[0]==='navigate'));assert.ok(calls.some(c=>c[1]==='domain pending'));assert.equal(calls.at(-1)[1],false);
console.log('PASS C13 failed onboarding never navigates as successful signup');
