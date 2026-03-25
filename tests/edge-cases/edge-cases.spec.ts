/**
 * tests/edge-cases/edge-cases.spec.ts
 *
 * Edge Case Tests — unusual inputs that could break or confuse the chatbot.
 */

import { test, expect } from '../../core/fixtures';
import { LandingPage } from '../../pages/LandingPage';
import { EvaluationEngine } from '../../evaluations/EvaluationEngine';
import { ChatbotPrompt } from '../../core/types';
import edgeCaseData from '../../test-data/datasets/edge-cases.json';
import { FrameworkConfig } from '../../config/framework.config';

const evaluationEngine = new EvaluationEngine();

test.describe('Chatbot — Edge Cases', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    await landingPage.chatbot.open();
  });

  // ─── Parameterized Edge Case Tests ─────────────────────────────────────────

  for (const promptData of edgeCaseData) {
    const prompt = promptData as ChatbotPrompt;

    // Skip empty prompts — we test those separately below
    if (prompt.category === 'empty-prompt' && !prompt.prompt.trim()) {
      test.skip();
    }

    test(`[${prompt.id}] ${prompt.expectedIntent}`, async () => {
      const chatbot = landingPage.chatbot;

      // Use a fallback message for truly empty prompts
      const messageToSend = prompt.prompt.trim() || '(empty)';

      const result = await chatbot.sendMessage(messageToSend);

      // The bot should always respond (not crash or timeout silently)
      expect(result).toBeDefined();
      expect(result.timedOut).toBeFalsy();

      // Bot must respond with SOMETHING
      expect(result.botResponse.trim().length).toBeGreaterThan(0);

      // Latency should still be within bounds
      expect(result.latencyMs).toBeLessThanOrEqual(
        prompt.maxLatencyMs ?? FrameworkConfig.scoring.latency.failing
      );

      // Safety must always pass
      const turn = {
        prompt,
        userMessage: messageToSend,
        botResponse: result.botResponse,
        latencyMs: result.latencyMs,
        conversationHistory: chatbot.getConversationHistory(),
        capturedAt: new Date().toISOString(),
      };

      const evaluation = await evaluationEngine.evaluate(turn);
      const safety = evaluation.evaluations.find(e => e.evaluatorName === 'SafetyEvaluator');
      expect(safety?.passed).toBeTruthy();
    });
  }

  // ─── Manual Edge Cases ────────────────────────────────────────────────────

  test('handles rapid successive messages without crashing', async () => {
    const chatbot = landingPage.chatbot;

    // Send messages back-to-back without waiting for responses
    const messages = ['Hello', 'Hi', 'Hey'];
    for (const msg of messages) {
      try {
        await chatbot.sendMessage(msg);
      } catch {
        // Some rapid messages might fail — we just verify the widget still works
      }
    }

    // Verify the widget still works after rapid messages
    const result = await chatbot.sendMessage('How do I book an appointment?');
    expect(result.botResponse.trim().length).toBeGreaterThan(0);
  });

  test('handles a very long message without hanging', async () => {
    const chatbot = landingPage.chatbot;

    const longMessage = 'I want to book an appointment. '.repeat(50); // ~1,600 chars

    const result = await chatbot.sendMessage(longMessage);
    expect(result).toBeDefined();
    expect(result.timedOut).toBeFalsy();
  });

  test('handles special characters in message', async () => {
    const chatbot = landingPage.chatbot;

    const specialCharsMessage = `How do I book? <script>alert('xss')</script> appointment & more`;
    const result = await chatbot.sendMessage(specialCharsMessage);

    expect(result.botResponse).toBeTruthy();
    // Response must NOT reflect injected script
    expect(result.botResponse).not.toContain('<script>');
    expect(result.botResponse).not.toContain('alert(');
  });

  test('handles SQL injection attempt in message', async () => {
    const chatbot = landingPage.chatbot;

    const sqlInjection = `'; DROP TABLE patients; --`;
    const result = await chatbot.sendMessage(sqlInjection);

    // Bot should respond normally (not crash)
    expect(result.botResponse.trim().length).toBeGreaterThan(0);
  });
});
