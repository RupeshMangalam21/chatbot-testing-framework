/**
 * scripts/capture-baseline.ts
 *
 * Captures current chatbot responses as baseline for regression testing.
 *
 * Run: npm run chatbot:baseline
 *
 * This opens a headless browser, sends each prompt, and saves the responses
 * to test-data/baselines/{promptId}.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ChatbotWidgetDriver } from '../drivers/ChatbotWidgetDriver';
import { BaselineEntry, ChatbotPrompt } from '../core/types';
import { FrameworkConfig } from '../config/framework.config';

dotenv.config();

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const VERSION = process.env.BASELINE_VERSION || new Date().toISOString().split('T')[0];
const BASELINE_DIR = FrameworkConfig.reporting.baselineDir;

// Import all datasets to baseline
import happyPathData from '../test-data/datasets/happy-path.json';
const PROMPTS_TO_BASELINE: ChatbotPrompt[] = happyPathData as ChatbotPrompt[];

async function captureBaselines(): Promise<void> {
  console.log(`\n📸 Chatbot Baseline Capture`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Version: ${VERSION}`);
  console.log(`   Capturing ${PROMPTS_TO_BASELINE.length} prompts...\n`);

  // Ensure baseline directory exists
  fs.mkdirSync(BASELINE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  let captured = 0;
  let failed = 0;

  try {
    await page.goto('/', { waitUntil: 'networkidle' });

    const driver = new ChatbotWidgetDriver(page);
    await driver.openWidget();

    for (const prompt of PROMPTS_TO_BASELINE) {
      try {
        console.log(`  Capturing ${prompt.id}: "${prompt.prompt.substring(0, 60)}..."`);

        const result = await driver.sendMessage(prompt.prompt);

        if (result.timedOut || !result.botResponse.trim()) {
          console.log(`  ⚠️  ${prompt.id}: Timeout or empty response — skipping`);
          failed++;
          continue;
        }

        const baseline: BaselineEntry = {
          promptId: prompt.id,
          prompt: prompt.prompt,
          response: result.botResponse,
          capturedAt: new Date().toISOString(),
          version: VERSION,
        };

        const filePath = path.join(BASELINE_DIR, `${prompt.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2));

        console.log(`  ✅ ${prompt.id}: Captured (${result.latencyMs}ms)`);
        captured++;

        // Small delay between prompts
        await new Promise(r => setTimeout(r, 1500));

      } catch (err) {
        console.error(`  ❌ ${prompt.id}: Error — ${err}`);
        failed++;
      }
    }

  } finally {
    await browser.close();
  }

  console.log(`\n📊 Baseline Capture Complete`);
  console.log(`   Captured: ${captured}`);
  console.log(`   Failed:   ${failed}`);
  console.log(`   Saved to: ${BASELINE_DIR}/\n`);
}

captureBaselines().catch(err => {
  console.error('Baseline capture failed:', err);
  process.exit(1);
});
