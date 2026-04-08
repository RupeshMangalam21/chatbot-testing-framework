/**
 * tests/regression/regression-tests.spec.ts
 *
 * Regression Tests — compares current chatbot responses against saved baselines.
 * Detects when chatbot behavior has drifted (e.g., after a model update or
 * configuration change).
 *
 * Before running regression tests, capture a baseline:
 *   npm run chatbot:baseline
 */

import { test, expect } from '../../core/fixtures';
import fs from 'fs';
import path from 'path';
import { LandingPage } from '../../pages/LandingPage';
import { SemanticSimilarity } from '../../evaluations/SemanticSimilarity';
import { BaselineEntry, ChatbotPrompt } from '../../core/types';
import { FrameworkConfig } from '../../config/framework.config';
import happyPathData from '../../test-data/datasets/happy-path.json';
import { waitForWidgetIframe } from '../../utils/widgetAvailability';

const similarity = new SemanticSimilarity(FrameworkConfig.scoring.similarity.regressionThreshold);

/**
 * Loads a saved baseline file for a given prompt ID.
 * Returns null if no baseline exists yet.
 */
function loadBaseline(promptId: string): BaselineEntry | null {
  const baselineFile = path.join(
    FrameworkConfig.reporting.baselineDir,
    `${promptId}.json`
  );

  if (!fs.existsSync(baselineFile)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(baselineFile, 'utf-8')) as BaselineEntry;
  } catch {
    return null;
  }
}

test.describe('Chatbot — Regression Tests', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');

    const widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment after waiting.');

    await landingPage.chatbot.open();
  });

  for (const promptData of happyPathData.slice(0, 5)) {
    const prompt = promptData as ChatbotPrompt;

    test(`[REGRESSION] ${prompt.id}: "${prompt.expectedIntent}"`, async () => {
      const baseline = loadBaseline(prompt.id);

      if (!baseline) {
        test.skip();
        console.log(`⚠️  No baseline for ${prompt.id}. Run "npm run chatbot:baseline" first.`);
        return;
      }

      const chatbot = landingPage.chatbot;
      const result = await chatbot.sendMessage(prompt.prompt);
      const currentResponse = result.botResponse;

      // Compare current response to baseline
      const similarityResult = similarity.compare(baseline.response, currentResponse);

      console.log(
        `  📊 ${prompt.id} similarity: ` +
        `combined=${(similarityResult.combined * 100).toFixed(1)}%, ` +
        `jaccard=${(similarityResult.jaccard * 100).toFixed(1)}%, ` +
        `cosine=${(similarityResult.cosine * 100).toFixed(1)}%`
      );

      if (similarityResult.isRegression) {
        console.log(`  ❌ REGRESSION DETECTED: ${similarityResult.regressionReason}`);
        console.log(`  Baseline: "${baseline.response.substring(0, 100)}..."`);
        console.log(`  Current:  "${currentResponse.substring(0, 100)}..."`);
      }

      // Assert no regression
      expect(
        similarityResult.isRegression,
        `REGRESSION in ${prompt.id}:\n${similarityResult.regressionReason}\n\nBaseline: "${baseline.response}"\n\nCurrent: "${currentResponse}"`
      ).toBeFalsy();
    });
  }
});
