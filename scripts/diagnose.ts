// @ts-nocheck
/**
 * scripts/diagnose.ts
 *
 * Standalone diagnostic script. Run this FIRST to understand exactly why
 * the widget isn't loading in Playwright.
 *
 * Usage:
 *   npx ts-node scripts/diagnose.ts
 *
 * Output:
 *   - diagnose-screenshot.png  (full page screenshot)
 *   - diagnose-report.txt      (all findings)
 *
 * Share both files if you need help debugging.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(process.cwd(), 'diagnose-output');
const WAIT_FOR_WIDGET_MS = 20_000;

interface Finding {
  level: 'OK' | 'WARN' | 'ERROR' | 'INFO';
  message: string;
}

const findings: Finding[] = [];
const log = (level: Finding['level'], message: string) => {
  findings.push({ level, message });
  const icons = { OK: '✅', WARN: '⚠️ ', ERROR: '❌', INFO: '   ' };
  console.log(`  ${icons[level]} ${message}`);
};

async function diagnose(): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Chatbot Widget Diagnostic — Headless Mode      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Target: ${BASE_URL}\n`);

  // ── Launch browser ────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    bypassCSP: true,
    viewport: { width: 1280, height: 900 },
  });

  // Stealth: remove navigator.webdriver in every frame.
  // Pass as a string so ts-node does not try to type-check browser globals.
  await context.addInitScript(`
    Object.defineProperty(window.navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(window.navigator, 'plugins',   { get: () => [1,2,3,4,5] });
    Object.defineProperty(window.navigator, 'languages', { get: () => ['en-US','en'] });
    if (!window.chrome) window.chrome = { runtime: {} };
  `);

  const page = await context.newPage();

  // ── Collect network events ─────────────────────────────────────────────────
  const blockedRequests: string[] = [];
  const chatbotRequests: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];

  page.on('requestfailed', req => {
    const url = req.url();
    const err = req.failure()?.errorText ?? 'unknown';
    blockedRequests.push(`${err}: ${url}`);
  });

  // Track ALL external requests so we can see what the page is loading
  const allExternalRequests: string[] = [];
  page.on('request', req => {
    const url = req.url().toLowerCase();
    // Match ChatBot.com AND LiveChat CDN domains.
    // @livechat/widget-react loads from livechat.com CDN, not chatbot.com.
    if (
      url.includes('chatbot') ||
      url.includes('livechat') ||
      url.includes('cdn.chat') ||
      url.includes('widget')
    ) {
      chatbotRequests.push(`${req.method()} ${req.url()}`);
    }
    if (!url.startsWith('http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      allExternalRequests.push(req.url());
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });

  // ── Navigate ───────────────────────────────────────────────────────────────
  console.log('  Loading page...');
  let pageStatus = 0;
  try {
    const response = await page.goto(BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    pageStatus = response?.status() ?? 0;
    if (pageStatus < 400) {
      log('OK', `Page loaded — HTTP ${pageStatus}`);
    } else {
      log('ERROR', `Page returned HTTP ${pageStatus} — app may not be running`);
    }
  } catch (e: any) {
    log('ERROR', `Failed to load page: ${e.message}`);
    log('ERROR', `Is the Next.js dev server running? Try: npm run dev`);
    await browser.close();
    writeReport();
    return;
  }

  // ── Inspect what scripts loaded on the page ───────────────────────────────
  const allScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]'))
      .map((s: any) => s.src)
      .filter(Boolean);
  });
  const chatbotScripts = allScripts.filter((s: string) => s.toLowerCase().includes('chatbot'));
  if (chatbotScripts.length > 0) {
    log('OK', `ChatBot.com script tags found (${chatbotScripts.length}):`);
    chatbotScripts.forEach((s: string) => log('INFO', `   ${s}`));
  } else {
    log('WARN', `No chatbot.com <script> tags in DOM — TextWidget may not be rendering`);
    log('INFO', `All script src values on page (${allScripts.length}):`);
    allScripts.slice(0, 10).forEach((s: string) => log('INFO', `   ${s.substring(0, 120)}`));
  }

  // ── Check if TextWidget div/container is in the DOM ───────────────────────
  const widgetDivCount = await page.evaluate(() => {
    const all = document.querySelectorAll('div,section');
    let found = 0;
    all.forEach((el: any) => {
      const cls = (el.className || '') + (el.id || '');
      if (cls.toLowerCase().includes('chat') || cls.toLowerCase().includes('widget')) found++;
    });
    return found;
  });
  log(widgetDivCount > 0 ? 'OK' : 'WARN',
    `Found ${widgetDivCount} div/section element(s) with "chat" or "widget" in class/id`);

  // ── Check navigator.webdriver ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const webdriverValue = await page.evaluate(() => (window as any).navigator.webdriver);
  if (webdriverValue === undefined) {
    log('OK', `navigator.webdriver = undefined (stealth working)`);
  } else {
    log('ERROR', `navigator.webdriver = ${webdriverValue} (stealth NOT working — ChatBot.com will block widget)`);
  }

  // ── Wait for widget to initialize ─────────────────────────────────────────
  console.log(`\n  Waiting ${WAIT_FOR_WIDGET_MS / 1000}s for ChatBot.com widget to initialize...\n`);
  await page.waitForTimeout(WAIT_FOR_WIDGET_MS);

  // ── Check ChatBot.com network requests ───────────────────────────────────
  if (chatbotRequests.length > 0) {
    log('OK', `ChatBot.com/widget network requests detected (${chatbotRequests.length}):`);
    chatbotRequests.slice(0, 5).forEach((r: string) => log('INFO', `   ${r}`));
  } else {
    log('ERROR', `No ChatBot.com/LiveChat requests made — widget script never loaded`);
    log('INFO', `All external requests made by the page (${allExternalRequests.length} total):`);
    allExternalRequests.slice(0, 15).forEach((r: string) => log('INFO', `   ${r.substring(0, 120)}`));
    if (allExternalRequests.length === 0) {
      log('WARN', `  No external requests at all — page may be fully static or widget not mounting`);
    }
  }

  // ── Check for blocked requests ────────────────────────────────────────────
  const chatbotBlocked = blockedRequests.filter(r => r.toLowerCase().includes('chatbot'));
  if (chatbotBlocked.length > 0) {
    log('ERROR', `Blocked ChatBot.com requests (${chatbotBlocked.length}):`);
    chatbotBlocked.forEach(r => log('INFO', `   ${r}`));
  }

  // ── Inspect all iframes ───────────────────────────────────────────────────
  const allIframes = await page.locator('iframe').all();
  log(allIframes.length > 0 ? 'OK' : 'ERROR', `Found ${allIframes.length} iframe(s) on page`);

  const iframeDetails: any[] = [];
  for (let i = 0; i < allIframes.length; i++) {
    const iframe = allIframes[i];
    const src     = await iframe.getAttribute('src').catch(() => '');
    const id      = await iframe.getAttribute('id').catch(() => '');
    const name    = await iframe.getAttribute('name').catch(() => '');
    const title   = await iframe.getAttribute('title').catch(() => '');
    const cls     = await iframe.getAttribute('class').catch(() => '');
    const visible = await iframe.isVisible().catch(() => false);
    const box     = await iframe.boundingBox().catch(() => null);

    const detail = { index: i, src, id, name, title, class: cls, visible, size: box };
    iframeDetails.push(detail);

    const isLikelyChatbot = [src, id, name, title, cls].some(v =>
      v?.toLowerCase().includes('chat')
    );

    const icon = isLikelyChatbot ? 'OK' : 'INFO';
    log(icon, `iframe[${i}]: src="${src?.substring(0, 80)}" id="${id}" title="${title}" visible=${visible}`);

    if (box) {
      log('INFO', `          size: ${box.width.toFixed(0)}×${box.height.toFixed(0)} at (${box.x.toFixed(0)},${box.y.toFixed(0)})`);
    } else {
      log('WARN', `          size: zero/off-screen — widget may be hidden`);
    }

    if (isLikelyChatbot) {
      log('OK', `   ✨ This looks like the chatbot iframe!`);
      log('INFO', `   Suggested selector for framework.config.ts:`);
      if (src)   log('INFO', `     iframe[src*="${new URL(src).hostname}"]`);
      if (id)    log('INFO', `     iframe#${id}`);
      if (title) log('INFO', `     iframe[title="${title}"]`);
    }
  }

  if (allIframes.length === 0) {
    log('ERROR', `No iframes found — the TextWidget component may not be mounted`);
    log('WARN', `  Check that <TextWidget organizationId="..."/> is in your page component`);
    log('WARN', `  And that it renders on the route being tested (default: /)`);
  }

  // ── Console errors ────────────────────────────────────────────────────────
  if (consoleErrors.length > 0) {
    log('WARN', `Console errors (${consoleErrors.length}):`);
    consoleErrors.slice(0, 10).forEach(e => log('INFO', `   ${e.substring(0, 150)}`));
  } else {
    log('OK', `No console errors`);
  }

  // ── Check CSP headers ────────────────────────────────────────────────────
  try {
    const response = await page.request.get(BASE_URL);
    const csp = response.headers()['content-security-policy'];
    if (csp) {
      log('WARN', `CSP header detected on page:`);
      log('INFO', `   ${csp.substring(0, 200)}`);
      if (!csp.includes('chatbot.com')) {
        log('ERROR', `CSP does NOT include chatbot.com — widget scripts are being BLOCKED by CSP`);
        log('WARN', `  Fix: See NEXTJS_CSP_FIX.md in the framework root`);
      } else {
        log('OK', `CSP includes chatbot.com domains`);
      }
    } else {
      log('OK', `No CSP header (good — widget can load freely)`);
    }
  } catch {
    log('INFO', `Could not read response headers`);
  }

  // ── Take screenshot ───────────────────────────────────────────────────────
  const screenshotPath = path.join(OUTPUT_DIR, 'diagnose-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  log('OK', `Full-page screenshot saved: ${screenshotPath}`);

  // ── Take screenshot of each iframe ───────────────────────────────────────
  for (let i = 0; i < Math.min(allIframes.length, 3); i++) {
    try {
      const iframePath = path.join(OUTPUT_DIR, `iframe-${i}-screenshot.png`);
      await allIframes[i].screenshot({ path: iframePath });
      log('INFO', `iframe[${i}] screenshot: ${iframePath}`);
    } catch {
      // Iframe might be cross-origin
    }
  }

  // ── Summary & verdict ─────────────────────────────────────────────────────
  await browser.close();

  const errors = findings.filter(f => f.level === 'ERROR');
  const warnings = findings.filter(f => f.level === 'WARN');

  console.log('\n╔══════════════════════════════════════════════════╗');
  if (errors.length === 0) {
    console.log('║  VERDICT: Widget should be loading correctly ✅   ║');
  } else {
    console.log(`║  VERDICT: ${errors.length} blocking issue(s) found ❌              ║`);
  }
  console.log('╚══════════════════════════════════════════════════╝');

  console.log(`\n  Errors:   ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Output:   ${OUTPUT_DIR}/\n`);

  if (errors.length > 0) {
    console.log('  ─── BLOCKING ISSUES ────────────────────────────────');
    errors.forEach(e => console.log(`  ❌ ${e.message}`));
    console.log('');
  }

  writeReport();
}

function writeReport(): void {
  const reportPath = path.join(OUTPUT_DIR, 'diagnose-report.txt');
  const lines = [
    `Chatbot Widget Diagnostic Report`,
    `Generated: ${new Date().toISOString()}`,
    `Target: ${process.env.APP_BASE_URL || 'http://localhost:3000'}`,
    '',
    ...findings.map(f => `[${f.level}] ${f.message}`),
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`  Report saved: ${reportPath}\n`);
}

diagnose().catch(err => {
  console.error('\nDiagnostic crashed:', err);
  process.exit(1);
});
