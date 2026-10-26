import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { browserHarness } from '../scripts/browser-harness.mjs';

async function browser(t) {
  let channel;
  if(process.platform==='win32') {
    try {await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');channel='msedge';} catch {}
  }
  const instance=await chromium.launch({headless:true,...(channel?{channel}:{})});
  t.after(()=>instance.close());return instance;
}
async function login(page,token) {
  await page.locator('#mobile button[data-view="settings"], #nav button[data-view="settings"]').filter({visible:true}).click();
  await page.locator('#app-token').fill(token);await page.locator('#save').click();
  await page.waitForFunction(()=>!document.getElementById('send').disabled);
}
async function go(page,view) {await page.locator(`#mobile button[data-view="${view}"], #nav button[data-view="${view}"]`).filter({visible:true}).click();}

test('Browser: mobile Layouts, Anmeldung, D1-Gedächtnis und mehrteiliger Chat', async t=>{
  const harness=await browserHarness();t.after(()=>harness.close());
  const instance=await browser(t);const context=await instance.newContext({viewport:{width:393,height:852},deviceScaleFactor:1});t.after(()=>context.close());
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(harness.base);await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('Anmeldung'));
  assert.equal(await page.locator('#send').isDisabled(),true);
  for(const size of [{width:320,height:740},{width:393,height:852},{width:768,height:1024},{width:1440,height:1000}]) {
    await page.setViewportSize(size);
    for(const view of ['overview','chat','memory','projects','settings']) {
      await go(page,view);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`${size.width}/${view} overflows`);
    }
  }
  await page.setViewportSize({width:393,height:852});await login(page,harness.token);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pai_token')),null);
  assert.equal(await page.locator('#app-token').inputValue(),'');
  await go(page,'memory');await page.locator('#addMemory').click();
  await page.locator('#entryValue').fill('Ich bevorzuge kurze deutsche Antworten. <img src=x onerror=alert(1)>');
  await page.locator('#entryForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.getElementById('memoryList').textContent.includes('kurze deutsche'));
  assert.equal(await page.locator('#memoryList img').count(),0);
  await go(page,'chat');await page.locator('#input').fill('Hallo');await page.locator('#send').click();
  await page.waitForFunction(()=>document.getElementById('messages').textContent.includes('Lokale Testantwort: Hallo'));
  await page.locator('#input').fill('Was habe ich gesagt?');await page.locator('#send').click();
  await page.waitForFunction(()=>document.getElementById('messages').textContent.includes('Lokale Testantwort: Was habe ich gesagt?'));
  assert.equal(harness.calls.length,2);assert.equal(harness.calls[1].messages.length,4);
  assert.match(harness.calls[1].messages[0].content,/kurze deutsche Antworten/);
  await page.reload();await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('Anmeldung'));await login(page,harness.token);
  await go(page,'chat');assert.match(await page.locator('#messages').textContent(),/Was habe ich gesagt/);
  await go(page,'overview');await page.waitForFunction(()=>document.querySelectorAll('[data-conversation]').length>0);
  await mkdir('.wrangler/screenshots',{recursive:true});await page.waitForTimeout(400);await page.screenshot({path:'.wrangler/screenshots/iphone-home.png',fullPage:true});
  await go(page,'chat');await page.waitForTimeout(400);await page.screenshot({path:'.wrangler/screenshots/iphone-chat.png',fullPage:true});
  await go(page,'settings');await page.locator('#logout').click();
  assert.equal(await page.locator('#memoryList').textContent(),'Keine D1-Erinnerungen geladen.');
  assert.equal(await page.locator('#messages').textContent(),'');
  assert.equal(await page.locator('#send').isDisabled(),true);
  assert.deepEqual(errors,[]);
});

test('PWA: Standalone-Manifest, App-Icons und keine privaten API-Antworten im Cache', async t=>{
  const harness=await browserHarness();t.after(()=>harness.close());const instance=await browser(t);
  const context=await instance.newContext({viewport:{width:393,height:852}});t.after(()=>context.close());const page=await context.newPage();
  await page.goto(harness.base);await page.evaluate(()=>navigator.serviceWorker.ready);
  const manifest=await (await context.request.get(harness.base+'/manifest.webmanifest')).json();
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
  for(const icon of manifest.icons) assert.equal((await context.request.get(harness.base+icon.src)).status(),200);
  await login(page,harness.token);
  const cacheUrls=await page.evaluate(async()=>{const results=[];for(const name of await caches.keys()) for(const request of await (await caches.open(name)).keys())results.push(request.url);return results;});
  assert.equal(cacheUrls.some(url=>new URL(url).pathname.startsWith('/api/')),false);
  await page.reload();await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!document.getElementById('offlineBanner').hidden);
  assert.equal(await page.locator('#send').isDisabled(),true);
  assert.equal(await page.locator('h1').count()>0,true);
});
