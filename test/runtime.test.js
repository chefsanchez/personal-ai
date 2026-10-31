import { TERMS_VERSION } from '../src/policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const root = fileURLToPath(new URL('../',import.meta.url));
const execute = promisify(execFile);
const token = 'runtime-test-only-'.repeat(3);
const migration = (await Promise.all(['0001_memory_and_history.sql','0002_accounts_profiles.sql','0003_terms_acceptance.sql','0004_projects_and_tasks.sql','0005_custom_agents.sql'].map(name => readFile(new URL('../migrations/' + name, import.meta.url),'utf8')))).join('\n');

async function bundleFixture() {
  const directory = await mkdtemp(join(tmpdir(),'personal-ai-runtime-'));
  const cleanup = async()=>{
    // Only this test's freshly created temporary directory can be removed.
    assert.equal(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'),true);
    assert.equal(directory.split(/[\\/]/).at(-1).startsWith('personal-ai-runtime-'),true);
    await rm(directory,{recursive:true,force:true});
  };
  await mkdir(join(directory,'logs'));
  await execute(process.execPath,[join(root,'node_modules','wrangler','bin','wrangler.js'),'deploy','--dry-run','--outdir',join(directory,'bundle')],{
    cwd:root, env:{...process.env,WRANGLER_LOG_PATH:join(directory,'logs'),WRANGLER_SEND_METRICS:'false'}, timeout:60000,
  });
  return {directory,script:await readFile(join(directory,'bundle','index.js'),'utf8'),cleanup};
}

function runtime(script, directory, outbound, bindings = {}) {
  return new Miniflare(convertV4MiniflareOptions({
    modules:true, script, compatibilityDate:'2026-10-21',
    d1Databases:{DB:'persisted-runtime-test'}, resourcePersistencePath:join(directory,'resources'),
    bindings:{APP_TOKEN:token,VLLM_BASE_URL:'https://runtime-model.example',VLLM_API_KEY:'runtime-upstream-only',...bindings},
    outboundService:outbound,
  }));
}
function dispatch(mf,path,{method='GET',body,headers={}}={}) {
  return mf.dispatchFetch('http://localhost'+path,{
    method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
}

test('workerd: vollständiger Chat und D1-Daten bleiben nach Runtime-Neustart erhalten',async t=>{
  const {directory,script,cleanup} = await bundleFixture();
  const requests=[];
  const outbound=async request=>{
    assert.equal(request.url,'https://runtime-model.example/v1/chat/completions');
    assert.equal(request.headers.get('Authorization'),'Bearer runtime-upstream-only');
    requests.push(await request.json());
    return new RuntimeResponse(JSON.stringify({choices:[{message:{content:'Antwort aus dem lokalen Modelltest'}}]}),{headers:{'Content-Type':'application/json'}});
  };
  let mf=runtime(script,directory,outbound);
  t.after(async()=>{ await mf.dispose(); await cleanup(); });
  const db=await mf.getD1Database('DB');
  await db.batch(migration.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  assert.equal((await dispatch(mf,'/api/health')).status,200);
  assert.equal((await dispatch(mf,'/api/status',{headers:{Authorization:''}})).status,401);
  assert.equal((await dispatch(mf,'/api/memories',{method:'POST',body:{content:'Meine bevorzugte Sprache ist Deutsch.'}})).status,201);
  const response=await dispatch(mf,'/api/chat',{method:'POST',body:{conversation_id:'persisted-chat',messages:[{role:'user',content:'Was ist meine bevorzugte Sprache?'}]}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).historySaved,true);
  assert.match(requests[0].messages[0].content,/Sprache ist Deutsch/);
  assert.equal(requests.length,1);
  await mf.dispose();
  mf=runtime(script,directory,outbound);
  const memories=await (await dispatch(mf,'/api/memories')).json();
  assert.equal(memories.memories.length,1);
  const history=await (await dispatch(mf,'/api/history?conversation_id=persisted-chat')).json();
  assert.deepEqual(history.messages.map(({role})=>role),['user','assistant']);
  const conversations=await (await dispatch(mf,'/api/conversations')).json();
  assert.equal(conversations.conversations[0].id,'persisted-chat');
  assert.equal(requests.length,1,'Lesen oder Neustart startet keine Inferenz');
});

test('workerd: Access-Signaturprüfung und Datenisolation funktionieren in der echten Worker-Laufzeit',async t=>{
  const {directory,script,cleanup} = await bundleFixture();
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'runtime-key',alg:'RS256',use:'sig'};
  const bindings={ACCESS_TEAM_DOMAIN:'runtime-test.cloudflareaccess.com',ACCESS_AUD:'runtime-audience'};
  let certRequests=0;
  const mf=runtime(script,directory,async request=>{
    assert.equal(request.url,'https://runtime-test.cloudflareaccess.com/cdn-cgi/access/certs');
    certRequests++;
    return new RuntimeResponse(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
  },bindings);
  t.after(async()=>{ await mf.dispose(); await cleanup(); });
  const db=await mf.getD1Database('DB');
  await db.batch(migration.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  const sign=subject=>new SignJWT({sub:subject}).setProtectedHeader({alg:'RS256',kid:'runtime-key'}).setIssuer('https://runtime-test.cloudflareaccess.com').setAudience('runtime-audience').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const headerA={'Cf-Access-Jwt-Assertion':await sign('owner-a')};
  const headerB={'Cf-Access-Jwt-Assertion':await sign('owner-b')};
  for (const headers of [headerA,headerB]) assert.equal((await dispatch(mf,'/api/terms/accept',{method:'POST',body:{version:TERMS_VERSION},headers})).status,200);
  assert.equal((await dispatch(mf,'/api/memories',{method:'POST',body:{content:'Privater Kontext A'},headers:headerA})).status,201);
  assert.equal((await (await dispatch(mf,'/api/memories',{headers:headerB})).json()).memories.length,0);
  assert.equal((await dispatch(mf,'/api/memories',{headers:{'Cf-Access-Jwt-Assertion':'forged'}})).status,401);
  assert.equal((await dispatch(mf,'/api/memories')).status,401,'APP_TOKEN umgeht Access nicht');
  assert.equal(certRequests,1,'JWKS wird innerhalb der Runtime wiederverwendet');
});




