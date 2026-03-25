/**
 * scripts/debug-widget.ts
 *
 * Interactive debug tool — opens a headed browser, loads your app, and
 * dumps every iframe it finds along with their selectors and content.
 *
 * Run: npm run chatbot:debug
 *
 * This tells you EXACTLY what selector to use in framework.config.ts
 * and whether the widget is actually loading in Playwright's browser.
 */

import { chromium } from 'playwright';
import { STEALTH_LAUNCH_ARGS, STEALTH_USER_AGENT, STEALTH_INIT_SCRIPT } from '../config/global-setup';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const WAIT_MS = 8000; // How long to wait for the widget to load

async function debugWidget(): Promise<void> {
  console.log(`\n🔍 Widget Debug Tool`);
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Waiting ${WAIT_MS / 1000}s for widget to load...\n`);

  const browser = await chromium.launch({
    headless: false, // HEADED — you'll see the browser open
    args: STEALTH_LAUNCH_ARGS,
    slowMo: 200,
  });

  const context = await browser.newContext({ userAgent: STEALTH_USER_AGENT });
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  const page = await context.newPage();

  // Log all console messages
  page.on('console', msg => console.log(`  [${msg.type()}] ${msg.text()}`));
  page.on('requestfailed', req =>
    console.log(`  [FAIL] ${req.failure()?.errorText} — ${req.url()}`)
  );

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  console.log(`✅ Page loaded\n`);

  // Wait for the widget to initialize
  await page.waitForTimeout(WAIT_MS);

  // Dump all iframes
  const iframes = await page.locator('iframe').all();
  console.log(`\n📦 Found ${iframes.length} iframe(s) on page:\n`);

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const src = await iframe.getAttribute('src').catch(() => '(none)');
    const id = await iframe.getAttribute('id').catch(() => '(none)');
    const name = await iframe.getAttribute('name').catch(() => '(none)');
    const title = await iframe.getAttribute('title').catch(() => '(none)');
    const className = await iframe.getAttribute('class').catch(() => '(none)');
    const visible = await iframe.isVisible().catch(() => false);

    console.log(`  iframe[${i}]:`);
    console.log(`    src:     ${src}`);
    console.log(`    id:      ${id}`);
    console.log(`    name:    ${name}`);
    console.log(`    title:   ${title}`);
    console.log(`    class:   ${className}`);
    console.log(`    visible: ${visible}`);

    // Try to read content from inside the iframe
    try {
      const frame = page.frameLocator(`iframe:nth-of-type(${i + 1})`);
      const bodyText = await frame.locator('body').innerText({ timeout: 3000 });
      const snippet = bodyText.substring(0, 200).replace(/\n/g, ' ');
      console.log(`    content: "${snippet}"`);
    } catch {
      console.log(`    content: (could not read — cross-origin or empty)`);
    }
    console.log('');
  }

  // ── Suggested selectors ───────────────────────────────────────────────────
  console.log(`\n💡 Suggested selectors for framework.config.ts:\n`);

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const src = await iframe.getAttribute('src').catch(() => '');
    const id = await iframe.getAttribute('id').catch(() => '');
    const title = await iframe.getAttribute('title').catch(() => '');

    if (src) console.log(`  iframe[src*="${new URL(src).hostname}"]`);
    if (id) console.log(`  iframe#${id}`);
    if (title) console.log(`  iframe[title="${title}"]`);
  }

  // ── navigator.webdriver check ────────────────────────────────────────────
  const webdriverValue = await page.evaluate(() => navigator.webdriver);
  console.log(`\n🔐 navigator.webdriver = ${webdriverValue} (should be undefined for stealth to work)\n`);

  console.log(`\nBrowser will stay open for 30s so you can inspect manually.`);
  console.log(`Check DevTools > Network to see if chatbot.com requests succeed.\n`);

  await page.waitForTimeout(30_000);
  await browser.close();
}

debugWidget().catch(err => {
  console.error('Debug failed:', err);
  process.exit(1);
});
