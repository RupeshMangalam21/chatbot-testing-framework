/**
 * config/global-setup.ts
 *
 * Runs once before the Playwright suite starts.
 */

import { chromium, FullConfig } from '@playwright/test';
import { FrameworkConfig } from './framework.config';
import fs from 'fs/promises';

async function globalSetup(_config: FullConfig) {
  console.log('\n🤖 Chatbot Testing Framework — Global Setup');
  console.log(`   Target: ${process.env.BASE_URL || 'http://localhost:3000'}`);
  console.log(`   LLM Judge: ${FrameworkConfig.llmJudge.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   Stealth mode: enabled (anti-bot-detection)\n`);

  await fs.mkdir(FrameworkConfig.reporting.outputDir, { recursive: true });
  await fs.mkdir(FrameworkConfig.reporting.screenshotsDir, { recursive: true });
  await fs.mkdir('test-results', { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    const target = process.env.BASE_URL || 'http://localhost:3000';

    const response = await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(`Application not reachable. HTTP status: ${response?.status() ?? 'unknown'}`);
    }

    console.log(`✅ Application is reachable (HTTP ${response.status()})`);

    await page.waitForSelector(
      [
        FrameworkConfig.widget.minimizedIframeSelector,
        'iframe#chat-widget',
        FrameworkConfig.widget.iframeSelector,
      ].join(', '),
      {
        timeout: FrameworkConfig.widget.iframeLoadTimeoutMs,
        state: 'attached',
      }
    );

    console.log('✅ Chatbot widget detected on landing page');
  } catch {
    const allIframes = await page.locator('iframe').all();
    console.warn(`⚠️  Widget iframe not detected. Found ${allIframes.length} iframe(s) on page:`);

    for (const iframe of allIframes) {
      const src = await iframe.getAttribute('src').catch(() => '(no src)');
      const id = await iframe.getAttribute('id').catch(() => '(no id)');
      const title = await iframe.getAttribute('title').catch(() => '(no title)');
      console.warn(`     src="${src}" id="${id}" title="${title}"`);
    }

    console.warn(`   Current expanded selector: ${FrameworkConfig.widget.iframeSelector}`);
    console.warn(`   Current minimized selector: ${FrameworkConfig.widget.minimizedIframeSelector}`);
    console.warn('   → Update widget selectors in config/framework.config.ts if needed.');
    console.warn('   → Run: npm run chatbot:debug to inspect interactively.');
  } finally {
    await browser.close();
  }

  console.log('✅ Report directories initialized\n');
  console.log('🚀 Starting test execution...\n');
}

export default globalSetup;