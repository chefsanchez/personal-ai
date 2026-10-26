import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createWorker } from '../src/worker.js';
import { TERMS_VERSION } from '../src/policy.js';

const {privateKey,publicKey} = await generateKeyPair('RS256');
const jwk = {...await exportJWK(publicKey),kid:'admin-test-key',alg:'RS256',use:'sig'};
const team = 'admin-test.cloudflareaccess.com';
const audience = 'admin-test-audience';
const legacyToken = 'legacy-private-test-'.repeat(3);
async function signed(sub, extra = {}, key = privateKey) {
  return new SignJWT({sub,email:sub+'@example.test',...extra}).setProtectedHeader({alg:'RS256',kid:'admin-test-key'}).setIssuer('https://'+team).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(key);
}
async function fixture(t,{accept=true}={}) {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:{DB:'admin-test'}}));
  t.after(()=>mf.dispose());
  const db = await mf.getD1Database('DB');
  const directory = new URL('../migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name,directory),'utf8');
    await db.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {assert.equal(String(url),'https://'+team+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  t.after(()=>{globalThis.fetch=originalFetch;});
  const env = {DB:db,ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:audience,OWNER_ACCESS_SUB:'owner',APP_TOKEN:legacyToken,VLLM_BASE_URL:'https://mock.example',VLLM_API_KEY:'local-test-only'};
  const modelCalls=[];
  const worker=createWorker({upstream:async(_url,init)=>{modelCalls.push(JSON.parse(init.body));return Response.json({choices:[{message:{content:'Antwort aus lokalem Admin-Test'}}]});}});
  const tokens = Object.fromEntries(await Promise.all(['owner','alice','bob'].map(async sub=>[sub,await signed(sub)])));
  const call=(sub,path,{body,method=body===undefined?'GET':'POST',headers={}}={})=>worker.fetch(new Request('http://localhost'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+legacyToken,'Cf-Access-Jwt-Assertion':tokens[sub]||sub,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  for(const sub of Object.keys(tokens)) {
    assert.equal((await call(sub,'/api/status')).status,200);
    if(accept) assert.equal((await call(sub,'/api/terms/accept',{body:{version:TERMS_VERSION}})).status,200);
  }
  return {db,env,call,modelCalls,tokens};
}
const target = sub=>'/api/admin/users/'+encodeURIComponent('access:'+sub);
async function seed(f,sub) {
  const memory=await (await f.call(sub,'/api/memories',{body:{content:'Privates Wissen von '+sub}})).json();
  const response=await f.call(sub,'/api/chat',{body:{conversation_id:'same-chat',messages:[{role:'user',content:'Private Frage von '+sub}]}});
  assert.equal(response.status,200);
  return memory.id;
}

test('Access-Nutzungsbedingungen: serverseitig, versioniert, personenbezogen und ohne Profil-Zwang',async t=>{
  const f=await fixture(t,{accept:false});
  const status=await (await f.call('alice','/api/status')).json();
  assert.equal(status.termsAccepted,false); assert.equal(status.termsVersion,TERMS_VERSION);
  assert.equal(status.profileConsent,false); assert.equal(status.operatorCanReadChats,true);
  assert.equal((await f.call('alice','/api/memories')).status,428);
  assert.equal((await f.call('alice','/api/chat',{body:{conversation_id:'x',messages:[{role:'user',content:'test'}]}})).status,428);
  assert.equal(f.modelCalls.length,0);
  assert.equal((await f.call('alice','/api/terms/accept',{body:{version:'old',profileConsent:true}})).status,400);
  assert.equal((await f.call('alice','/api/profile/consent',{body:{enabled:true}})).status,428);
  assert.equal((await f.call('alice','/api/profile/consent',{body:{enabled:false}})).status,200,'Widerruf bleibt ohne neue Bedingungen möglich');
  assert.equal((await f.call('alice','/api/terms/accept',{body:{version:TERMS_VERSION,profileConsent:true}})).status,200);
  const accepted=await (await f.call('alice','/api/status')).json();
  assert.equal(accepted.termsAccepted,true); assert.equal(accepted.profileConsent,false);
  assert.equal((await (await f.call('bob','/api/status')).json()).termsAccepted,false);
  assert.equal((await f.call('alice','/api/memories')).status,200);
  const account=await f.db.prepare('SELECT terms_version,terms_accepted_at FROM app_accounts WHERE id=?').bind('access:alice').first();
  assert.equal(account.terms_version,TERMS_VERSION); assert.ok(account.terms_accepted_at);
});

test('Admin ist ausschließlich der konfigurierte signierte Access-Subject, nie Token, Mail oder Client-Rolle',async t=>{
  const f=await fixture(t);
  assert.equal((await (await f.call('owner','/api/status')).json()).isAdmin,true);
  assert.equal((await (await f.call('alice','/api/status')).json()).isAdmin,false);
  assert.equal((await f.call('alice','/api/admin/users')).status,403);
  const spoof=await signed('alice',{email:'owner@example.test',role:'owner',isAdmin:true});
  assert.equal((await f.call(spoof,'/api/admin/users')).status,403);
  const foreignKeys=await generateKeyPair('RS256');
  assert.equal((await f.call(await signed('owner',{},foreignKeys.privateKey),'/api/admin/users')).status,401);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM app_accounts').first()).n,3,'Keine Registrierung für ungültige Signatur');
  delete f.env.ACCESS_TEAM_DOMAIN; delete f.env.ACCESS_AUD;
  assert.equal((await f.call('owner','/api/admin/users')).status,403,'Legacy-Token erhält nie Adminrechte');
});

test('Admin liest und löscht nur Daten des ausdrücklich gewählten Kontos',async t=>{
  const f=await fixture(t);
  const aliceMemory=await seed(f,'alice'); const bobMemory=await seed(f,'bob');
  const listed=await (await f.call('owner','/api/admin/users')).json();
  assert.equal(listed.users.length,3); assert.equal(listed.users.find(u=>u.id==='access:alice').conversation_count,1);
  assert.doesNotMatch(JSON.stringify(listed),/Private Frage|Privates Wissen/,'Nutzerliste enthält keine Chatinhalte');
  const history=await (await f.call('owner',target('alice')+'/history?conversation_id=same-chat')).json();
  assert.match(history.messages[0].content,/alice/); assert.doesNotMatch(JSON.stringify(history),/bob/);
  assert.equal((await f.call('owner',target('alice')+'/memories',{method:'DELETE',body:{id:bobMemory}})).status,404);
  assert.equal((await f.call('owner',target('alice')+'/memories',{method:'DELETE',body:{id:aliceMemory}})).status,200);
  assert.equal((await (await f.call('bob','/api/memories')).json()).memories.length,1);
  await f.call('owner',target('alice')+'/history?conversation_id=same-chat',{method:'DELETE'});
  assert.equal((await (await f.call('alice','/api/conversations')).json()).conversations.length,0);
  assert.equal((await (await f.call('bob','/api/conversations')).json()).conversations.length,1);
  assert.equal((await f.call('owner','/api/admin/users/%ZZ/memories')).status,400);
  assert.equal((await f.call('owner',target('missing')+'/memories')).status,404);
});

test('Sperre wirkt auf jede weitere Anfrage, schützt Betreiber und entfernt abgeleitete Profile',async t=>{
  const f=await fixture(t); await seed(f,'alice');
  await f.call('alice','/api/profile/consent',{body:{enabled:true}});
  await f.db.prepare('INSERT INTO derived_profiles(session_id,content) VALUES (?,?)').bind('access:alice','Abgeleitetes Profil').run();
  await f.db.prepare('INSERT INTO daily_summaries(session_id,summary_date,content) VALUES (?,?,?)').bind('access:alice','2026-10-26','Zusammenfassung').run();
  assert.equal((await f.call('alice',target('bob'),{method:'PATCH',body:{status:'blocked'}})).status,403);
  assert.equal((await f.call('owner',target('owner'),{method:'PATCH',body:{status:'blocked'}})).status,403);
  assert.equal((await f.call('owner',target('alice'),{method:'PATCH',body:{status:'blocked'}})).status,200);
  for(const path of ['/api/status','/api/memories','/api/conversations','/api/profile']) assert.equal((await f.call('alice',path)).status,403);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM derived_profiles WHERE session_id=?').bind('access:alice').first()).n,0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM daily_summaries WHERE session_id=?').bind('access:alice').first()).n,0);
  assert.equal((await (await f.call('owner',target('alice')+'/memories')).json()).memories.length,1,'Quellgedächtnis bleibt erhalten');
  await f.call('owner',target('alice'),{method:'PATCH',body:{status:'active'}});
  assert.equal((await (await f.call('alice','/api/status')).json()).profileConsent,false);
});

test('Profil-Einwilligung ist freiwillig; Widerruf löscht nur eigene Ableitungen atomar',async t=>{
  const f=await fixture(t); await seed(f,'alice'); await seed(f,'bob');
  assert.deepEqual(await (await f.call('alice','/api/profile')).json(),{consentEnabled:false,profile:null,summaries:[],generationEnabled:false});
  assert.equal((await f.call('alice','/api/profile/consent',{body:{enabled:'true'}})).status,400);
  for(const sub of ['alice','bob']) {
    assert.equal((await f.call(sub,'/api/profile/consent',{body:{enabled:true}})).status,200);
    await f.db.prepare('INSERT INTO derived_profiles(session_id,content) VALUES (?,?)').bind('access:'+sub,'Profil '+sub).run();
    await f.db.prepare('INSERT INTO daily_summaries(session_id,summary_date,content) VALUES (?,?,?)').bind('access:'+sub,'2026-10-26','Tag '+sub).run();
  }
  assert.equal((await (await f.call('alice','/api/profile')).json()).profile.content,'Profil alice');
  assert.equal((await f.call('alice','/api/profile/consent',{body:{enabled:false}})).status,200);
  const profile=await (await f.call('alice','/api/profile')).json();
  assert.equal(profile.profile,null); assert.deepEqual(profile.summaries,[]);
  assert.equal((await (await f.call('bob','/api/profile')).json()).profile.content,'Profil bob');
  assert.equal((await (await f.call('alice','/api/memories')).json()).memories.length,1);
  assert.equal((await (await f.call('alice','/api/conversations')).json()).conversations.length,1);
  assert.equal(f.modelCalls.length,2,'Einwilligung und Widerruf starten keine Modellanfragen');
});
