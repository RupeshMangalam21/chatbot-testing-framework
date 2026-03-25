/**
 * tests/conversation/appointment-flows.spec.ts
 *
 * Conversation Tests — simulates real user conversation flows and verifies
 * the chatbot provides relevant, helpful responses.
 */

import { test, expect } from '../../core/fixtures';
import { LandingPage } from '../../pages/LandingPage';
import { EvaluationEngine } from '../../evaluations/EvaluationEngine';
import { ChatbotPrompt } from '../../core/types';
import happyPathData from '../../test-data/datasets/happy-path.json';
import doctorOnboardingData from '../../test-data/datasets/doctor-onboarding.json';
import { FrameworkConfig } from '../../config/framework.config';
import { TestResultStore } from '../../utils/TestResultStore';

const evaluationEngine = new EvaluationEngine();
const resultStore = new TestResultStore();

const hasAnyTerm = (text: string, terms: string[]): boolean => {
  const normalized = text.toLowerCase();
  return terms.some(term => normalized.includes(term.toLowerCase()));
};

test.describe('Chatbot — Appointment Booking Flow', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    await landingPage.chatbot.open();
  });

  test.afterEach(async () => {
    await resultStore.flush();
  });

  test('responds to appointment booking query', async () => {
    test.setTimeout(90_000);

    const chatbot = landingPage.chatbot;
    const prompt = happyPathData.find(p => p.id === 'HP-001')! as ChatbotPrompt;

    const turn = await chatbot.executePrompt(prompt);
    const evaluation = await evaluationEngine.evaluate(turn);

    await resultStore.save('appointment-booking', evaluation);

    expect(turn.botResponse.trim().length).toBeGreaterThan(0);
    expect(turn.latencyMs).toBeLessThanOrEqual(FrameworkConfig.scoring.latency.failing);

    const intentMatched = hasAnyTerm(turn.botResponse, [
      'appointment',
      'book',
      'booking',
      'schedule',
      'doctor',
      'visit',
      'slot',
      'available',
      'help',
    ]);
    expect(intentMatched).toBe(true);

    const safety = evaluation.evaluations.find(
      e => e.evaluatorName === 'SafetyEvaluator'
    );
    expect(safety?.passed).toBeTruthy();
  });

  test('responds to appointment rescheduling query', async () => {
    test.setTimeout(90_000);

    const chatbot = landingPage.chatbot;
    const prompt = happyPathData.find(p => p.id === 'HP-002')! as ChatbotPrompt;

    const turn = await chatbot.executePrompt(prompt);
    const evaluation = await evaluationEngine.evaluate(turn);

    await resultStore.save('appointment-rescheduling', evaluation);

    expect(turn.botResponse.trim().length).toBeGreaterThan(0);

    const intentMatched = hasAnyTerm(turn.botResponse, [
      'reschedule',
      'appointment',
      'change',
      'modify',
      'move',
      'slot',
      'time',
      'schedule',
      'another',
    ]);
    expect(intentMatched).toBe(true);

    const safety = evaluation.evaluations.find(
      e => e.evaluatorName === 'SafetyEvaluator'
    );
    expect(safety?.passed).toBeTruthy();
  });

  test('responds to appointment cancellation query', async () => {
    test.setTimeout(90_000);

    const chatbot = landingPage.chatbot;
    const prompt = happyPathData.find(p => p.id === 'HP-003')! as ChatbotPrompt;

    const turn = await chatbot.executePrompt(prompt);
    const evaluation = await evaluationEngine.evaluate(turn);

    await resultStore.save('appointment-cancellation', evaluation);

    expect(turn.botResponse.trim().length).toBeGreaterThan(0);

    const intentMatched = hasAnyTerm(turn.botResponse, [
      'cancel',
      'cancellation',
      'appointment',
      'booking',
      'scheduled',
      'remove',
      'delete',
      'support',
      'help',
    ]);
    expect(intentMatched).toBe(true);

    const safety = evaluation.evaluations.find(
      e => e.evaluatorName === 'SafetyEvaluator'
    );
    expect(safety?.passed).toBeTruthy();
  });

  test('simulates a complete appointment booking conversation', async ({ page }) => {
    test.setTimeout(120_000);

    const chatbot = landingPage.chatbot;

    const conversationScript = [
      'Hi, I need help',
      'I want to book an appointment with a cardiologist',
      'I prefer mornings, maybe next Tuesday',
    ];

    const responses: string[] = [];

    for (const message of conversationScript) {
      const result = await chatbot.sendMessage(message);

      expect(result.timedOut).toBe(false);
      expect(result.botResponse.trim().length).toBeGreaterThanOrEqual(10);

      responses.push(result.botResponse);

      await page.waitForTimeout(1500);
    }

    expect(responses).toHaveLength(conversationScript.length);

    const finalResponse = responses[responses.length - 1];
    const isRelevant = hasAnyTerm(finalResponse, [
      'appointment',
      'book',
      'schedule',
      'available',
      'confirm',
      'select',
      'slot',
      'time',
      'doctor',
      'tuesday',
      'morning',
    ]);

    expect(isRelevant).toBe(true);
  });

  test('handles context continuity across turns', async ({ page }) => {
    test.setTimeout(120_000);

    const chatbot = landingPage.chatbot;

    const first = await chatbot.sendMessage('I want to book an appointment');
    expect(first.timedOut).toBe(false);
    expect(first.botResponse.trim().length).toBeGreaterThan(0);

    await page.waitForTimeout(1500);

    const second = await chatbot.sendMessage('What information do you need from me?');
    expect(second.timedOut).toBe(false);
    expect(second.botResponse.trim().length).toBeGreaterThanOrEqual(10);
  });
});

test.describe('Chatbot — Doctor Onboarding Flow', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    await landingPage.chatbot.open();
  });

  test.afterEach(async () => {
    await resultStore.flush();
  });

  for (const promptData of doctorOnboardingData) {
    const prompt = promptData as ChatbotPrompt;

    test(`[${prompt.id}] ${prompt.expectedIntent}`, async () => {
      test.setTimeout(90_000);

      const chatbot = landingPage.chatbot;
      const turn = await chatbot.executePrompt(prompt);
      const evaluation = await evaluationEngine.evaluate(turn);

      const safety = evaluation.evaluations.find(
        e => e.evaluatorName === 'SafetyEvaluator'
      );
      expect(safety?.passed).toBeTruthy();

      expect(turn.botResponse.trim().length).toBeGreaterThanOrEqual(10);

      const intentMatched = hasAnyTerm(turn.botResponse, [
        'doctor',
        'register',
        'registration',
        'verification',
        'document',
        'approval',
        'availability',
        'clinic',
        'admin',
        'profile',
      ]);
      expect(intentMatched).toBe(true);

      await resultStore.save(prompt.category, evaluation);
    });
  }
});

test.describe('Chatbot — Happy Path Prompts', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    await landingPage.chatbot.open();
  });

  test.afterEach(async () => {
    await resultStore.flush();
  });

  for (const promptData of happyPathData) {
    const prompt = promptData as ChatbotPrompt;

    test(`[${prompt.id}] ${prompt.expectedIntent}`, async () => {
      test.setTimeout(90_000);

      const chatbot = landingPage.chatbot;

      const turn = await chatbot.executePrompt(prompt);
      const evaluation = await evaluationEngine.evaluate(turn);

      expect(turn.botResponse.trim().length).toBeGreaterThan(0);
      expect(turn.latencyMs).toBeLessThanOrEqual(
        FrameworkConfig.scoring.latency.failing
      );

      const safety = evaluation.evaluations.find(
        e => e.evaluatorName === 'SafetyEvaluator'
      );
      expect(safety?.passed).toBeTruthy();

      await resultStore.save(prompt.category, evaluation);
    });
  }
});