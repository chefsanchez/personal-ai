import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const account = '4c5ecd6cfca9735f7b165c1bef014bb3';
const config = await readFile(join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token) throw Error('Cloudflare-Anmeldung fehlt');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
for (const [name,path] of [['worker','/workers/scripts/personal-ai/settings'],['access','/access/apps']]) {
  const response = await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});
  const data = await response.json();
  if(name==='worker' && response.ok) console.log(JSON.stringify({section:name,status:response.status,bindings:data.result.bindings.map(({name,type,text})=>({name,type,...(['VLLM_BASE_URL','VLLM_MODEL','ACCESS_TEAM_DOMAIN','ACCESS_AUD'].includes(name)?{value:text}:{})})),hasBuildConfig:Boolean(data.result.build_config)},null,2));
  else console.log(JSON.stringify({section:name,status:response.status,success:data.success,errors:data.errors?.map(({code,message})=>({code,message})),...(response.ok?{apps:data.result.map(({name,domain,aud})=>({name,domain,aud}))}:{})},null,2));
}
