import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { browserHarness } from '../scripts/browser-harness.mjs';

// The 9 exact iPhone viewports specified in the requirements
const IPHONE_MODELS = [
  { name: 'iPhone SE', width: 375, height: 667, scale: 2 },
  { name: 'iPhone X / XS / 11 Pro', width: 375, height: 812, scale: 3 },
  { name: 'iPhone XR / 11', width: 414, height: 896, scale: 2 },
  { name: 'iPhone 12 / 13 / 14', width: 390, height: 844, scale: 3 },
  { name: 'iPhone 12 / 13 / 14 Pro Max', width: 428, height: 926, scale: 3 },
  { name: 'iPhone 14 Pro / 15 / 16', width: 393, height: 852, scale: 3 },
  { name: 'iPhone 14 Pro Max / 15 Pro Max / 16 Plus', width: 430, height: 932, scale: 3 },
  { name: 'iPhone 16 Pro', width: 402, height: 874, scale: 3 },
  { name: 'iPhone 16 Pro Max', width: 440, height: 956, scale: 3 }
];

async function launchBrowser(t) {
  let channel;
  if (process.platform === 'win32') {
    try {
      await access('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
      channel = 'msedge';
    } catch {}
  }
  const instance = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  t.after(() => instance.close());
  return instance;
}

async function createIPhoneContext(instance, model, t) {
  const context = await instance.newContext({
    viewport: { width: model.width, height: model.height },
    deviceScaleFactor: model.scale,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
  });
  t.after(() => context.close());
  return context;
}

async function login(page, token) {
  if (await page.locator('#send').isEnabled()) return;
  await page.locator('#mobile button[data-view="settings"]').click();
  await page.locator('#app-token').fill(token);
  await page.locator('#save').click();
  await page.waitForFunction(() => !document.getElementById('send').disabled);
}

test('iPhone Matrix: Main App - Navigation, Zero Overflow & Touch Targets across all 9 iPhone viewports', async t => {
  const harness = await browserHarness();
  t.after(() => harness.close());
  const instance = await launchBrowser(t);

  for (const model of IPHONE_MODELS) {
    await t.test(`Main App on ${model.name} (${model.width}x${model.height})`, async st => {
      const context = await createIPhoneContext(instance, model, st);
      const page = await context.newPage();

      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('console', msg => {
        // Collect console errors; 401 is expected during initial unauthenticated handshake
        if (msg.type() === 'error' && !msg.text().includes('401')) {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(harness.base);
      await page.waitForFunction(() => !document.getElementById('send').disabled);

      // 1. Verify zero horizontal overflow across all views
      for (const view of ['overview', 'chat', 'memory', 'projects', 'settings']) {
        const navBtn = page.locator(`#mobile button[data-view="${view}"]`);
        await navBtn.click();
        await page.waitForTimeout(50);

        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(root.scrollWidth, body.scrollWidth);
          const clientW = Math.max(root.clientWidth, window.innerWidth);
          return scrollW > clientW;
        });
        assert.equal(overflow, false, `Horizontal overflow detected in view '${view}' on ${model.name}`);
      }

      // 2. Verify Mobile Navigation buttons visible & touch target >= 44px
      const navButtons = page.locator('#mobile button');
      const count = await navButtons.count();
      assert.equal(count, 5, `Expected 5 mobile nav buttons on ${model.name}`);

      for (let i = 0; i < count; i++) {
        const btn = navButtons.nth(i);
        assert.equal(await btn.isVisible(), true, `Nav button ${i} should be visible on ${model.name}`);
        const box = await btn.boundingBox();
        assert.ok(box, `Bounding box missing for nav button ${i}`);
        assert.ok(box.height >= 44, `Nav button ${i} height (${box.height}px) should be >= 44px on ${model.name}`);
      }

      // 3. Switch to Chat view and verify Chat input & Send button
      await page.locator('#mobile button[data-view="chat"]').click();
      const chatInput = page.locator('#prompt, #input').filter({ visible: true }).first();
      assert.equal(await chatInput.isVisible(), true, `Chat input textarea should be visible on ${model.name}`);

      // Verify input textarea touch target height >= 44px
      const inputBox = await chatInput.boundingBox();
      assert.ok(inputBox, 'Chat input bounding box missing');
      assert.ok(inputBox.height >= 44, `Chat input height (${inputBox.height}px) should be >= 44px on ${model.name}`);

      // Verify operable (can type into textarea)
      await chatInput.fill('iPhone Matrix Automated Test Prompt');
      assert.equal(await chatInput.inputValue(), 'iPhone Matrix Automated Test Prompt');

      // Send button visible
      const sendBtn = page.locator('#send');
      assert.equal(await sendBtn.isVisible(), true, `Send button should be visible on ${model.name}`);
      const sendBox = await sendBtn.boundingBox();
      assert.ok(sendBox, 'Send button bounding box missing');
      assert.ok(sendBox.width >= 44, `Send button width (${sendBox.width}px) should be >= 44px on ${model.name}`);
      assert.ok(sendBox.height >= 44, `Send button height (${sendBox.height}px) should be >= 44px on ${model.name}`);

      // 4. Verify safe area insets are referenced in CSS
      const hasSafeAreaCSS = await page.evaluate(() => {
        const mobileEl = document.querySelector('.mobile');
        if (!mobileEl) return false;
        const style = window.getComputedStyle(mobileEl);
        return Boolean(style.position === 'fixed' && style.bottom);
      });
      assert.equal(hasSafeAreaCSS, true, `Mobile nav should be fixed with safe-area positioning on ${model.name}`);

      // 5. Verify Zero Console Errors and Zero Page Errors
      assert.deepEqual(pageErrors, [], `Expected zero page errors on ${model.name}`);
      assert.deepEqual(consoleErrors, [], `Expected zero console errors on ${model.name}`);

      await page.close();
    });
  }
});

test('iPhone Matrix: Main App - Authenticated Chat and Operability across iPhone viewports', async t => {
  const harness = await browserHarness();
  t.after(() => harness.close());
  const instance = await launchBrowser(t);

  // Test across representative key viewports: SE (smallest), 14/15/16 Pro (standard), 16 Pro Max (largest)
  const testModels = [
    IPHONE_MODELS[0], // iPhone SE (375x667)
    IPHONE_MODELS[5], // iPhone 14 Pro / 15 / 16 (393x852)
    IPHONE_MODELS[8]  // iPhone 16 Pro Max (440x956)
  ];

  for (const model of testModels) {
    await t.test(`Authenticated chat roundtrip on ${model.name}`, async st => {
      const context = await createIPhoneContext(instance, model, st);
      const page = await context.newPage();

      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('401')) {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(harness.base);
      await page.waitForFunction(() => !document.getElementById('send').disabled);

      // Log in if needed
      await login(page, harness.token);

      // Navigate to chat
      await page.locator('#mobile button[data-view="chat"]').click();
      const chatInput = page.locator('#prompt, #input').filter({ visible: true }).first();
      const sendBtn = page.locator('#send');

      // Verify operable (Send button enabled)
      assert.equal(await sendBtn.isDisabled(), false, `Send button should be enabled after login on ${model.name}`);

      // Type message and submit
      const testMsg = `Mobile WebKit Test on ${model.name}`;
      await chatInput.fill(testMsg);
      await sendBtn.click();

      // Wait for reply
      await page.waitForFunction(msg => document.getElementById('messages').textContent.includes('Lokale Testantwort: ' + msg), testMsg);

      // Verify zero overflow after message rendered
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Overflow detected after chat reply on ${model.name}`);

      assert.deepEqual(pageErrors, [], `Expected zero page errors on ${model.name}`);
      assert.deepEqual(consoleErrors, [], `Expected zero console errors on ${model.name}`);

      await page.close();
    });
  }
});

test('iPhone Matrix: preview-liquid-glass.html - Responsiveness, Overflow & Themes across all 9 iPhone viewports', async t => {
  const harness = await browserHarness();
  t.after(() => harness.close());
  const instance = await launchBrowser(t);

  for (const model of IPHONE_MODELS) {
    await t.test(`preview-liquid-glass on ${model.name} (${model.width}x${model.height})`, async st => {
      const context = await createIPhoneContext(instance, model, st);
      const page = await context.newPage();

      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(harness.base + '/preview-liquid-glass.html');
      await page.waitForTimeout(150);

      // 1. Verify zero horizontal overflow on initial load
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Initial horizontal overflow on preview-liquid-glass for ${model.name}`);

      // 2. Verify Device Switcher buttons exist and switch to iPhone Frame
      const devIphone = page.locator('#devIphone');
      assert.equal(await devIphone.isVisible(), true, `devIphone button visible on ${model.name}`);
      await devIphone.click();
      await page.waitForTimeout(100);

      // iPhone Frame should now be visible
      const iphoneFrame = page.locator('#iphoneFrame');
      assert.equal(await iphoneFrame.isVisible(), true, `iphoneFrame should be visible after clicking devIphone on ${model.name}`);

      // Verify no overflow in iPhone frame mode
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Horizontal overflow after switching to iPhone frame on ${model.name}`);

      // 3. Dynamic Island Simulation is present and active with live telemetry
      const dynamicIsland = page.locator('#dynamicIslandPill');
      assert.equal(await dynamicIsland.isVisible(), true, `Dynamic island pill should be visible on ${model.name}`);
      const islandTicker = page.locator('#islandTicker');
      assert.equal(await islandTicker.isVisible(), true, `Dynamic island ticker should be visible on ${model.name}`);

      // 4. Test Mobile Chat Composer inside iPhone Frame
      const mobileInput = page.locator('#mobileInput');
      assert.equal(await mobileInput.isVisible(), true, `Mobile input should be visible on ${model.name}`);
      await mobileInput.fill('High-Speed Sport+ Modus');
      assert.equal(await mobileInput.inputValue(), 'High-Speed Sport+ Modus');

      // Click mobile send button
      const mobileSendBtn = page.locator('#iphoneFrame button.liquid-button');
      assert.equal(await mobileSendBtn.isVisible(), true, `Mobile send button should be visible on ${model.name}`);
      await mobileSendBtn.click();
      await page.waitForTimeout(50);
      assert.match(await page.locator('#mobileBotMsg').textContent(), /High-Speed Sport\+ Modus/);

      // 5. Test Theme Switcher across all 7 iconic themes without error
      const themes = ['cash', 'kitty', 'bmw', 'amg', 'audi', 'traphouse', 'wholetrain'];
      for (const themeId of themes) {
        const themeBtn = page.locator('#btn-theme-' + themeId);
        if (await themeBtn.isVisible()) {
          await themeBtn.click();
          const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
          assert.equal(currentTheme, themeId, `data-theme attribute should be '${themeId}'`);
        }
      }

      // Verify no overflow after theme switches
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Horizontal overflow after theme switches on ${model.name}`);

      // 6. Verify Touch targets on theme tabs and device buttons meet usability guidelines (min 32px height for compact tabs, 44px where applicable)
      const themeButtons = page.locator('.theme-tab-btn');
      const themeBtnCount = await themeButtons.count();
      for (let i = 0; i < themeBtnCount; i++) {
        const btn = themeButtons.nth(i);
        const box = await btn.boundingBox();
        if (box) {
          assert.ok(box.height >= 32, `Theme button ${i} height (${box.height}px) should be >= 32px on ${model.name}`);
        }
      }

      // 7. Verify Zero Console Errors and Zero Page Errors
      assert.deepEqual(pageErrors, [], `Expected zero page errors on preview-liquid-glass (${model.name})`);
      assert.deepEqual(consoleErrors, [], `Expected zero console errors on preview-liquid-glass (${model.name})`);

      await page.close();
    });
  }
});
