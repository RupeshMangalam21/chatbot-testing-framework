// @ts-nocheck
/**
 * scripts/discover-selectors.ts
 *
 * Automatically discovers the correct CSS selectors inside the LiveChat
 * widget iframe. Run this once and it prints the exact values to put in
 * framework.config.ts → widget.internal
 *
 * Usage:
 *   npx ts-node scripts/discover-selectors.ts
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

async function discoverSelectors() {
  console.log('\n🔍 LiveChat Widget Selector Discovery');
  console.log(`   URL: ${BASE_URL}\n`);

  const browser = await chromium.launch({
    headless: false, // headed so you can see what's happening
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    bypassCSP: true,
  });

  await context.addInitScript(`
    Object.defineProperty(window.navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(window.navigator, 'plugins', { get: () => [1,2,3,4,5] });
    if (!window.chrome) window.chrome = { runtime: {} };
  `);

  const page = await context.newPage();

  page.on('requestfailed', req => {
    if (req.url().includes('livechat') || req.url().includes('chatbot')) {
      console.log(`  [BLOCKED] ${req.failure()?.errorText}: ${req.url()}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  console.log('  Page loaded. Waiting for widget to mount...\n');

  // Poll for iframe to appear
  let iframeFound = false;
  for (let i = 0; i < 30; i++) {
    const count = await page.locator('iframe').count();
    if (count > 0) { iframeFound = true; break; }
    await page.waitForTimeout(500);
    process.stdout.write('.');
  }
  console.log('');

  if (!iframeFound) {
    console.log('\n❌ No iframe found after 15s. Is the widget visible in the browser?');
    await page.waitForTimeout(30000);
    await browser.close();
    return;
  }

  // Find all iframes and their details
  const iframes = await page.locator('iframe').all();
  console.log(`\n✅ Found ${iframes.length} iframe(s)\n`);

  for (let i = 0; i < iframes.length; i++) {
    const src   = await iframes[i].getAttribute('src').catch(() => '');
    const id    = await iframes[i].getAttribute('id').catch(() => '');
    const title = await iframes[i].getAttribute('title').catch(() => '');
    const name  = await iframes[i].getAttribute('name').catch(() => '');
    const cls   = await iframes[i].getAttribute('class').catch(() => '');

    console.log(`iframe[${i}]:`);
    console.log(`  src:   ${src}`);
    console.log(`  id:    ${id}`);
    console.log(`  title: ${title}`);
    console.log(`  name:  ${name}`);
    console.log(`  class: ${cls}`);

    // Build the best selector for this iframe
    let iframeSelector = 'iframe';
    if (src)   iframeSelector = `iframe[src*="${new URL(src).hostname}"]`;
    else if (id)    iframeSelector = `iframe#${id}`;
    else if (title) iframeSelector = `iframe[title*="${title}"]`;

    // Try to inspect inside this iframe
    console.log(`\n  Inspecting iframe[${i}] internals...`);
    const frame = page.frameLocator(`iframe:nth-of-type(${i + 1})`);

    // The LiveChat widget starts as a minimized bubble — click the iframe
    // to open the chat window, then wait for the input to appear.
    console.log('  Clicking bubble to open chat window...');
    try {
      await iframes[i].click({ timeout: 5000 });
      console.log('  Clicked. Waiting 3s for chat window to animate open...');
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log(`  Could not click iframe: ${e.message}`);
    }

    // After clicking, the iframe src may change (LiveChat navigates internally)
    // Re-attach the frame locator
    const chatFrame = page.frameLocator('iframe#chat-widget, iframe[src*="livechatinc.com"]');

    // Wait for the input to appear inside the now-open chat window
    try {
      await chatFrame.locator('input[placeholder="Write a message…"], input[aria-label="Write a message…"]')
        .waitFor({ state: 'visible', timeout: 8000 });
      console.log('  ✅ Chat input is now visible inside iframe');
    } catch {
      console.log('  ⚠️  Chat input not found yet — iframe may still be loading');
    }

    // Discover all interactive elements inside the iframe
    const elements = await frame.locator('input, textarea, button, [contenteditable], [role="textbox"]')
      .all()
      .catch(() => []);

    console.log(`\n  Found ${elements.length} interactive element(s) inside iframe:`);
    for (const el of elements) {
      const tag         = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '?');
      const type        = await el.getAttribute('type').catch(() => '');
      const placeholder = await el.getAttribute('placeholder').catch(() => '');
      const ariaLabel   = await el.getAttribute('aria-label').catch(() => '');
      const cls2        = await el.getAttribute('class').catch(() => '');
      const id2         = await el.getAttribute('id').catch(() => '');
      const role        = await el.getAttribute('role').catch(() => '');
      const name2       = await el.getAttribute('name').catch(() => '');
      const visible     = await el.isVisible().catch(() => false);

      console.log(`    <${tag}>`);
      if (type)        console.log(`      type:        "${type}"`);
      if (placeholder) console.log(`      placeholder: "${placeholder}"`);
      if (ariaLabel)   console.log(`      aria-label:  "${ariaLabel}"`);
      if (role)        console.log(`      role:        "${role}"`);
      if (id2)         console.log(`      id:          "${id2}"`);
      if (cls2)        console.log(`      class:       "${cls2.substring(0, 80)}"`);
      if (name2)       console.log(`      name:        "${name2}"`);
      console.log(`      visible:     ${visible}`);
    }

    // Also dump a slice of the iframe's full HTML for manual inspection
    try {
      const bodyHTML = await frame.locator('body').innerHTML({ timeout: 3000 });
      const snippet  = bodyHTML.replace(/\s+/g, ' ').substring(0, 1000);
      console.log(`\n  iframe body HTML (first 1000 chars):\n  ${snippet}`);
    } catch {
      console.log(`  (Could not read iframe body — may be cross-origin)`);
    }

    console.log('\n' + '─'.repeat(60));
  }

  // ── Print config recommendation ──────────────────────────────────────────
  console.log('\n📋 RECOMMENDED framework.config.ts settings:');
  console.log('   Copy these into config/framework.config.ts → widget section\n');

  if (iframes.length > 0) {
    const src   = await iframes[0].getAttribute('src').catch(() => '');
    const id    = await iframes[0].getAttribute('id').catch(() => '');
    const title = await iframes[0].getAttribute('title').catch(() => '');

    let best = 'iframe';
    if (src)   best = `iframe[src*="${new URL(src).hostname}"]`;
    else if (id)    best = `iframe#${id}`;
    else if (title) best = `iframe[title*="${title}"]`;

    console.log(`  iframeSelector: '${best}',`);
  }

  console.log('\n  (Check the interactive elements list above for input/button selectors)');
  console.log('\n  Browser stays open for 60s for manual inspection. Press Ctrl+C to quit early.\n');

  await page.waitForTimeout(60_000);
  await browser.close();
}

discoverSelectors().catch(err => {
  console.error('\nDiscovery failed:', err.message);
  process.exit(1);
});
