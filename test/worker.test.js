import { TERMS_VERSION } from '../src/policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createWorker } from '../src/worker.js';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { authorize, verifyAccess } from '../src/auth.js';

const token = 'local-test-only-'.repeat(3);
const baselineMigration = await readFile(new URL('../migrations/0001_memory_and_history.sql',import.meta.url),'utf8');
const migration = (await Promise.all(['0001_memory_and_history.sql','0002_accounts_profiles.sql','0003_terms_acceptance.sql'].map(name => readFile(new URL('../migrations/' + name, import.meta.url),'utf8')))).join('\n');
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid:'test-key', alg:'RS256', use:'sig' };
const accessEnv = { ACCESS_TEAM_DOMAIN:'personal-ai-test.cloudflareaccess.com', ACCESS_AUD:'test-audience' };
async function jwt(sub = 'user-a', overrides = {}) {
  return new SignJWT({sub}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(overrides.issuer || 'https://' + accessEnv.ACCESS_TEAM_DOMAIN).setAudience(overrides.aud || accessEnv.ACCESS_AUD).setIssuedAt().setExpirationTime(overrides.exp || '5m').sign(privateKey);
}
function request(path, options = {}) {
  const { body, method = body === undefined ? 'GET' : 'POST', headers = {} } = options;
  return new Request('http://localhost' + path, { method, headers:{ Authorization:'Bearer ' + token, 'Content-Type':'application/json', ...headers }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
}
const chat = (content = 'Hallo', id = 'conversation-a') => ({conversation_id:id,messages:[{role:'user',content}]});
async function fixture(t, upstream) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules:true, script:'export default { fetch() { return new Response("local-test"); } }', d1Databases:{DB:'test-db'} }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.batch(migration.split(';').map(s => s.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  const env = { DB:db, APP_TOKEN:token, VLLM_BASE_URL:'https://model.example/v1/', VLLM_API_KEY:'test-upstream-secret', VLLM_TIMEOUT_MS:'1000' };
  const calls = [];
  const worker = createWorker({upstream:upstream || (async (url, init) => {calls.push({url,init,body:JSON.parse(init.body)}); return Response.json({choices:[{message:{content:'Lokale Testantwort'}}]});})});
  return {mf,db,env,calls,call:(path, options) => worker.fetch(request(path,options),env)};
}

test('Access JWT: Signatur, Aussteller, Audience, Ablauf und Identität', async () => {
  const keys = createLocalJWKSet({keys:[jwk]});
  assert.deepEqual(await verifyAccess(await jwt(),accessEnv,keys), {id:'access:user-a',mode:'access'});
  assert.equal(await verifyAccess(await jwt('a',{issuer:'https://attacker.example'}),accessEnv,keys),null);
  assert.equal(await verifyAccess(await jwt('a',{aud:'wrong'}),accessEnv,keys),null);
  assert.equal(await verifyAccess(await jwt('a',{exp:1}),accessEnv,keys),null);
  const forged = (await jwt()).split('.'); forged[2] = 'invalid';
  assert.equal(await verifyAccess(forged.join('.'),accessEnv,keys),null);
  assert.equal(await verifyAccess(await jwt(),{...accessEnv,ACCESS_TEAM_DOMAIN:'attacker.example'},keys),null);
  assert.equal(await verifyAccess('x'.repeat(16385),accessEnv,keys),null);
  assert.equal(await authorize(request('/api/chat'),{...accessEnv,APP_TOKEN:token}),null, 'Kein Token-Fallback im Access-Modus');
});

test('Öffentlicher Healthcheck gibt keine Modellbereitschaft vor; Auth und CSRF', async t => {
  const f = await fixture(t);
  const health = await f.call('/api/health'); assert.equal(health.status,200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal(health.headers.get('Cache-Control'),'no-store');
  assert.equal((await f.call('/api/memories',{headers:{Authorization:''}})).status,401);
  assert.equal((await f.call('/api/memories',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.call('/api/memories',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await f.call('/api/status')).status,200);
  assert.equal(f.calls.length,0);
});

test('D1: idempotente Migration, Bestandserhalt, Speichern, Lesen und Löschen', async t => {
  const f = await fixture(t);
  await f.db.prepare("INSERT INTO ai_memories(id,session_id,content,category) VALUES ('old','owner','alter Chat','chat_user')").run();
  await f.db.batch(baselineMigration.split(';').map(s=>s.trim()).filter(Boolean).map(sql=>f.db.prepare(sql)));
  const saved = await f.call('/api/memories',{body:{content:'Ich mag grünen Tee.'}}); assert.equal(saved.status,201);
  const {id} = await saved.json();
  assert.equal((await (await f.call('/api/memories')).json()).memories.length,1);
  assert.equal((await f.call('/api/memories',{method:'DELETE',body:{id}})).status,200);
  assert.equal((await f.call('/api/memories',{method:'DELETE',body:{id}})).status,404);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM ai_memories WHERE id = 'old'").first()).n,1);
});

test('Chat: Erinnerungskontext, mehrteiliger Verlauf, Server-Secret und getrennte Historie', async t => {
  const f = await fixture(t);
  await f.call('/api/memories',{body:{content:'Ich bevorzuge deutschen Text.'}});
  const payload = chat(); payload.messages = [{role:'user',content:'Erste Frage'},{role:'assistant',content:'Erste Antwort'},...payload.messages];
  const response = await f.call('/api/chat',{body:payload}); assert.equal(response.status,200);
  const answer = await response.json(); assert.equal(answer.historySaved,true);
  assert.equal(f.calls[0].url,'https://model.example/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.Authorization,'Bearer test-upstream-secret');
  assert.equal(f.calls[0].init.redirect,'manual','Provider-Secret wird nicht über Redirects weitergereicht');
  assert.match(f.calls[0].body.messages[0].content,/deutschen Text/);
  assert.equal(f.calls[0].body.messages.length,4);
  assert.doesNotMatch(JSON.stringify(answer),/test-upstream-secret/);
  const history = await (await f.call('/api/history?conversation_id=conversation-a')).json();
  assert.deepEqual(history.messages.map(m=>m.role),['user','assistant']);
  assert.equal((await (await f.call('/api/memories')).json()).memories.length,1);
  assert.equal((await (await f.call('/api/history?conversation_id=other')).json()).messages.length,0);
  await f.call('/api/history?conversation_id=conversation-a',{method:'DELETE'});
  assert.equal((await (await f.call('/api/history?conversation_id=conversation-a')).json()).messages.length,0);
});

test('D1: Access-Nutzer sehen und löschen keine fremden Erinnerungen oder Chats', async t => {
  const f = await fixture(t);
  const original = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(String(url),'https://' + accessEnv.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs'); return Response.json({keys:[jwk]}); };
  t.after(()=>{globalThis.fetch=original;});
  Object.assign(f.env,accessEnv);
  const headersA = {'Cf-Access-Jwt-Assertion':await jwt('a')};
  const headersB = {'Cf-Access-Jwt-Assertion':await jwt('b')};
  for (const headers of [headersA,headersB]) assert.equal((await f.call('/api/terms/accept',{body:{version:TERMS_VERSION},headers})).status,200);
  const saved = await (await f.call('/api/memories',{body:{content:'privat A'},headers:headersA})).json();
  assert.equal((await (await f.call('/api/memories',{headers:headersB})).json()).memories.length,0);
  assert.equal((await f.call('/api/memories',{method:'DELETE',body:{id:saved.id},headers:headersB})).status,404);
  assert.equal((await f.call('/api/chat',{body:chat(),headers:headersA})).status,200);
  assert.equal((await (await f.call('/api/conversations',{headers:headersA})).json()).conversations.length,1);
  assert.equal((await (await f.call('/api/conversations',{headers:headersB})).json()).conversations.length,0);
  assert.equal((await (await f.call('/api/history?conversation_id=conversation-a',{headers:headersB})).json()).messages.length,0);
  await f.call('/api/history?conversation_id=conversation-a',{method:'DELETE',headers:headersB});
  assert.equal((await (await f.call('/api/history?conversation_id=conversation-a',{headers:headersA})).json()).messages.length,2);
  assert.equal((await (await f.call('/api/memories',{headers:headersA})).json()).memories.length,1);
});

test('Ungültige Eingaben und zu große Anfragen lösen keinen Modellaufruf aus', async t => {
  const f = await fixture(t);
  for (const body of [null,[],{}, {messages:[]}, {...chat(),messages:[{role:'system',content:'inject'}]}, {...chat(),messages:[{role:'assistant',content:'not user'}]}, chat('x'.repeat(12001))]) {
    assert.equal((await f.call('/api/chat',{body})).status,400);
  }
  assert.equal((await f.call('/api/chat',{body:chat('x'.repeat(66000))})).status,413);
  assert.equal((await f.call('/api/memories',{body:{content:'x'.repeat(4001)}})).status,400);
  assert.equal(f.calls.length,0);
});

test('Modellfehler werden ohne interne Texte oder Schlüssel gemeldet', async t => {
  for (const status of [302,401,403,429,500]) {
    const f = await fixture(t,async()=>new Response('LEAK test-upstream-secret',{status}));
    const response = await f.call('/api/chat',{body:chat()}); assert.equal(response.status,502);
    assert.doesNotMatch(await response.text(),/LEAK|test-upstream-secret/);
  }
  const f = await fixture(t,async()=>Response.json({choices:[]}));
  assert.equal((await f.call('/api/chat',{body:chat()})).status,502);
});

test('Zeitlimit und Verbindungsfehler sind getrennt', async t => {
  const f = await fixture(t,(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})));
  assert.equal((await f.call('/api/chat',{body:chat()})).status,504);
  const g = await fixture(t,async()=>{throw Error('private detail');});
  assert.equal((await g.call('/api/chat',{body:chat()})).status,502);
});

test('D1-Ausfall verhindert Inferenz; Historienausfall meldet erhaltene Antwort ehrlich', async t => {
  const f = await fixture(t);
  await f.db.prepare('DROP TABLE ai_memories').run();
  assert.equal((await f.call('/api/chat',{body:chat()})).status,503); assert.equal(f.calls.length,0);
  const g = await fixture(t);
  await g.db.prepare('DROP TABLE chat_messages').run();
  const response = await g.call('/api/chat',{body:chat()}); assert.equal(response.status,200);
  const body = await response.json(); assert.equal(body.historySaved,false); assert.match(body.warning,/nicht gespeichert/);
});

test('D1-Rate-Limit stoppt weitere kostenverursachende Modellaufrufe', async t => {
  const f = await fixture(t);
  for(let i=0;i<10;i++) assert.equal((await f.call('/api/chat',{body:chat()})).status,200);
  assert.equal((await f.call('/api/chat',{body:chat()})).status,429); assert.equal(f.calls.length,10);
  assert.equal((await f.db.prepare("SELECT count FROM request_limits WHERE scope = 'global'").first()).count,10, 'Abgewiesene Nutzeranfrage belastet globales Kontingent nicht');
});

test('JSON-Medientyp und abgebrochene Übertragung werden als Eingabefehler gemeldet', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/memories',{body:{content:'Test'},headers:{'Content-Type':'application/jsonp'}})).status,415);
  assert.equal((await f.call('/api/memories',{body:{content:'Test'},headers:{'Content-Type':'Application/JSON; charset=utf-8'}})).status,201);
  const broken = new Request('http://localhost/api/memories', {
    method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, duplex:'half',
    body:new ReadableStream({start(controller) {controller.error(Error('Private Übertragungsdetails'));}}),
  });
  const response = await createWorker().fetch(broken,f.env);
  assert.equal(response.status,400);
  assert.doesNotMatch(await response.text(),/Private Übertragungsdetails|D1/);
});

test('Modellantwortgröße, Ziel-URL und fehlende Konfiguration sind begrenzt', async t => {
  const f = await fixture(t,async()=>new Response('x'.repeat(1048577)));
  assert.equal((await f.call('/api/chat',{body:chat()})).status,502);
  for (const endpoint of ['http://model.example','https://user:pass@model.example','https://model.example/?token=private']) {
    f.env.VLLM_BASE_URL = endpoint;
    assert.equal((await f.call('/api/chat',{body:chat()})).status,503);
  }
  f.env.VLLM_BASE_URL = '';
  assert.equal((await f.call('/api/chat',{body:chat()})).status,503);
});

test('Gespeicherte Chats sind geräteübergreifend auffindbar und nach Aktivität sortiert', async t => {
  const f = await fixture(t);
  await f.call('/api/chat',{body:chat('Erste Frage','chat-a')});
  await f.call('/api/chat',{body:chat('Zweite Frage','chat-b')});
  await f.call('/api/chat',{body:chat('Folgefrage','chat-a')});
  const {conversations} = await (await f.call('/api/conversations')).json();
  assert.deepEqual(conversations.map(c=>c.id),['chat-a','chat-b']);
  assert.equal(conversations[0].title,'Erste Frage');
  assert.equal(conversations[0].message_count,4);
  await f.call('/api/history?conversation_id=chat-a',{method:'DELETE'});
  assert.deepEqual((await (await f.call('/api/conversations')).json()).conversations.map(c=>c.id),['chat-b']);
});

test('Profile: Einwilligung speichern, abfragen und Datenbereinigung', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/profile')).status, 200);
  const tokenProfile = await (await f.call('/api/profile')).json();
  assert.equal(tokenProfile.consentEnabled, false);
  
  const tokenConsent = await f.call('/api/profile/consent', { method: 'POST', body: { enabled: true } });
  assert.equal(tokenConsent.status, 403);

  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = original; });
  Object.assign(f.env, accessEnv);
  const headers = { 'Cf-Access-Jwt-Assertion': await jwt('user-consent') };
  assert.equal((await f.call('/api/terms/accept', { method: 'POST', body: { version: TERMS_VERSION }, headers })).status, 200);
  
  const grant = await f.call('/api/profile/consent', { method: 'POST', body: { enabled: true }, headers });
  assert.equal(grant.status, 200);
  assert.equal((await grant.json()).consentEnabled, true);

  const profile = await (await f.call('/api/profile', { headers })).json();
  assert.equal(profile.consentEnabled, true);

  const revoke = await f.call('/api/profile/consent', { method: 'POST', body: { enabled: false }, headers });
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).consentEnabled, false);
});

test('Admin: Nur Betreiber darf Nutzerkonten verwalten und sperren', async t => {
  const f = await fixture(t);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  t.after(() => { globalThis.fetch = original; });
  Object.assign(f.env, { ...accessEnv, OWNER_ACCESS_SUB: 'admin-sub' });

  const adminHeaders = { 'Cf-Access-Jwt-Assertion': await jwt('admin-sub') };
  const userHeaders = { 'Cf-Access-Jwt-Assertion': await jwt('regular-user') };

  for (const headers of [adminHeaders, userHeaders]) {
    assert.equal((await f.call('/api/terms/accept', { method: 'POST', body: { version: TERMS_VERSION }, headers })).status, 200);
  }

  await f.call('/api/status', { headers: userHeaders });

  assert.equal((await f.call('/api/admin/users', { headers: userHeaders })).status, 403);

  const listRes = await f.call('/api/admin/users', { headers: adminHeaders });
  assert.equal(listRes.status, 200);
  const users = (await listRes.json()).users;
  assert.equal(users.some(u => u.id === 'access:regular-user'), true);

  const blockRes = await f.call('/api/admin/users/access%3Aregular-user', { method: 'PATCH', body: { status: 'blocked' }, headers: adminHeaders });
  assert.equal(blockRes.status, 200);

  const blockedStatus = await f.call('/api/status', { headers: userHeaders });
  assert.equal(blockedStatus.status, 403);
  assert.equal((await blockedStatus.json()).code, 'ACCOUNT_BLOCKED');

  const blockSelf = await f.call('/api/admin/users/access%3Aadmin-sub', { method: 'PATCH', body: { status: 'blocked' }, headers: adminHeaders });
  assert.equal(blockSelf.status, 403);
});





