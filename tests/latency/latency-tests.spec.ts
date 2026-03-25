/**
 * tests/latency/latency-tests.spec.ts
 *
 * Latency Tests — measures chatbot response times under various conditions.
 * These tests run sequentially (workers=1 in latency-suite project) to ensure
 * accurate latency measurements without concurrency interference.
 */

import { test, expect } from '../../core/fixtures';
import { LandingPage } from '../../pages/LandingPage';
import { LatencyEvaluator } from '../../evaluations/LatencyEvaluator';
import { ChatbotPrompt } from '../../core/types';
import { FrameworkConfig } from '../../config/framework.config';
import { calculatePercentile } from '../../utils/helpers';

const latencyEvaluator = new LatencyEvaluator();

// Prompts chosen to represent a spread of complexity levels
const LATENCY_TEST_PROMPTS: ChatbotPrompt[] = [
  {
    id: 'LAT-001',
    prompt: 'Hi',
    expectedIntent: 'greeting',
    expectedKeywords: ['help', 'hello'],
    category: 'happy-path',
  },
  {
    id: 'LAT-002',
    prompt: 'How do I book an appointment?',
    expectedIntent: 'appointment booking',
    expectedKeywords: ['book', 'appointment'],
    category: 'appointment-booking',
  },
  {
    id: 'LAT-003',
    prompt: 'What is the process for a doctor to get verified on this platform? I need detailed step-by-step instructions.',
    expectedIntent: 'doctor verification',
    expectedKeywords: ['verification', 'process', 'steps'],
    category: 'doctor-onboarding',
  },
  {
    id: 'LAT-004',
    prompt: 'I need to reschedule, cancel, and then rebook an appointment, and also understand the cancellation policy',
    expectedIntent: 'multi-intent query',
    expectedKeywords: ['appointment', 'reschedule', 'cancel'],
    category: 'long-prompt',
  },
];

test.describe('Chatbot — Response Latency', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    await landingPage.chatbot.open();
  });

  // ─── Individual Latency Tests ───────────────────────────────────────────────

  for (const prompt of LATENCY_TEST_PROMPTS) {
    test(`[${prompt.id}] Latency: "${prompt.prompt.substring(0, 50)}"`, async () => {
      const chatbot = landingPage.chatbot;
      const turn = await chatbot.executePrompt(prompt);
      const evaluation = await latencyEvaluator.evaluate(turn);

      // Log for analysis
      console.log(`  ⏱ ${prompt.id}: ${turn.latencyMs}ms (${evaluation.details?.grade})`);

      // Hard limit: no response should take longer than the absolute failing threshold
      expect(
        turn.latencyMs,
        `Response took ${turn.latencyMs}ms — exceeds absolute limit of ${FrameworkConfig.scoring.latency.failing}ms`
      ).toBeLessThanOrEqual(FrameworkConfig.scoring.latency.failing);
    });
  }

  // ─── Aggregate Latency Test ─────────────────────────────────────────────────

  test('p95 latency is within acceptable bounds across multiple prompts', async () => {
    const chatbot = landingPage.chatbot;
    const latencies: number[] = [];

    // Send all test prompts in sequence and collect latencies
    for (const prompt of LATENCY_TEST_PROMPTS) {
      const result = await chatbot.sendMessage(prompt.prompt);
      latencies.push(result.latencyMs);
      // Small delay between measurements
      await new Promise(r => setTimeout(r, 1000));
    }

    const p50 = calculatePercentile(latencies, 50);
    const p95 = calculatePercentile(latencies, 95);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`  📊 Latency stats: avg=${avg.toFixed(0)}ms, p50=${p50}ms, p95=${p95}ms`);

    // p50 must be under the "poor" threshold
    expect(p50).toBeLessThanOrEqual(FrameworkConfig.scoring.latency.poor);

    // p95 must not exceed the absolute failing threshold
    expect(p95).toBeLessThanOrEqual(FrameworkConfig.scoring.latency.failing);
  });

  // ─── First Response Latency ────────────────────────────────────────────────

  test('time-to-first-response on page load is acceptable', async ({ page }) => {
    // Reset and measure from a fresh page load
    const freshLandingPage = new LandingPage(page);
    await freshLandingPage.open('/');
    const chatbot = freshLandingPage.chatbot;

    const start = Date.now();
    await chatbot.open();
    const result = await chatbot.sendMessage('Hello');
    const totalMs = Date.now() - start;

    console.log(`  ⏱ Time-to-first-response from page load: ${totalMs}ms`);

    // First response (including widget load time) should be under 60s
    expect(totalMs).toBeLessThanOrEqual(60_000);
  });
});
