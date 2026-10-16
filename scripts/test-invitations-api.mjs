import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
const require = createRequire(new URL('../backend/package.json', import.meta.url))
const source = await readFile(new URL('../backend/src/invitations.ts', import.meta.url), 'utf8')
const calls = [];let limited = false, fail = false
const db = { rpc: async (name, args) => { calls.push({ name, args });if (name === 'participant_rate_limit') return { data: !limited };if (fail) return { error: { message: 'Invitación no disponible' } };return { data: { registration_id: 'qa-registration', credential_token: 'qa-credential' } } } }
const context = { exports: {}, Request, Response, Headers, crypto: globalThis.crypto, require: name => name === '@supabase/supabase-js' ? { createClient: () => db } : name === './participant' ? { hashToken: async x => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x))).toString('hex') } : require(name) }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const api = context.exports.invitationsApi, event = '00000000-0000-4000-8000-000000000001', code = 'f'.repeat(64)
const send = (path, body) => api.request(new Request(`https://qa.invalid/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) }), undefined, { SUPABASE_URL: 'https://qa.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-qa-key' })
assert.equal((await send('redeem', { event_id: event, code: 'short' })).status, 400)
let response = await send('redeem', { event_id: event, code, request: 'a'.repeat(64), first_name: 'Ana', last_name: 'QA', email: 'ana@example.invalid', phone: '' });assert.equal(response.status, 200);assert.equal(response.headers.get('Cache-Control'), 'no-store');assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer')
assert.equal(calls.at(-1).name, 'redeem_event_invitation');assert.equal(calls.at(-1).args.p_event, event);assert.ok(!JSON.stringify(calls.filter(c => c.name === 'participant_rate_limit')).includes('192.0.2.1'))
const count = calls.filter(c => c.name === 'redeem_event_invitation').length;limited = true;assert.equal((await send('redeem', { event_id: event, code })).status, 429);assert.equal(calls.filter(c => c.name === 'redeem_event_invitation').length, count);limited = false
assert.equal((await send('household', { event_id: event, code, member_id: event })).status, 400)
response = await send('household', { event_id: event, code, member_id: event, response: 'accepted', first_name: 'Ana' });assert.equal(response.status, 200);assert.equal(calls.at(-1).args.p_member, event)
fail = true;assert.equal((await send('redeem', { event_id: event, code, request: 'a'.repeat(64), first_name: 'Ana', last_name: '', email: 'ana@example.invalid', phone: '' })).status, 400)
console.log('PASS invitation API: validation, event scoping, no-store, no-referrer, hashed-IP rate limit, service RPC boundary and RSVP schema')
