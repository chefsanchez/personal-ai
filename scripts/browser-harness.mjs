import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createWorker } from '../src/worker.js';

export async function browserHarness() {
  const root = fileURLToPath(new URL('../',import.meta.url));
  const publicRoot = resolve(root,'public');
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local-test")}}',d1Databases:{DB:'browser-test'}}));
  const DB = await mf.getD1Database('DB');
  for(const name of (await readdir(resolve(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort()) {
    const sql = await readFile(resolve(root,'migrations',name),'utf8');
    await DB.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(statement=>DB.prepare(statement)));
  }
  const token = 'browser-test-only-'.repeat(3);
  const calls = [];
  const worker = createWorker({upstream:async (url,init) => {
    const payload = JSON.parse(init.body); calls.push(payload);
    return Response.json({choices:[{message:{content:'Lokale Testantwort: ' + payload.messages.at(-1).content}}]});
  }});
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
  const env = {DB,APP_TOKEN:token,VLLM_BASE_URL:'https://local-mock.example/v1',VLLM_API_KEY:'local-mock-only',ASSETS:{fetch:async request=>{
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/favicon.ico') return new Response(null, { status: 204 });
    const target = resolve(publicRoot,'.' + (pathname==='/' ? '/index.html' : pathname));
    if(!target.startsWith(publicRoot+sep)) return new Response('Not found',{status:404});
    try {
      const content = await readFile(target);
      const extension = target.slice(target.lastIndexOf('.'));
      const csp = pathname.includes('preview')
        ? "default-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data:;"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
      return new Response(content,{headers:{'Content-Type':mime[extension]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp}});
    }
    catch { return new Response('Not found',{status:404}); }
  }}};
  let base;
  const server = createServer(async(req,res)=>{
    try {
      const chunks=[]; for await(const chunk of req) chunks.push(chunk);
      const body=Buffer.concat(chunks);
      const request=new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})});
      const response=await worker.fetch(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local test harness failure'); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  return {base,token,calls,DB,env,close:async()=>{await new Promise(resolve=>server.close(resolve));await mf.dispose();}};
}
