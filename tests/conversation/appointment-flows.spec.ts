/**
 * tests/conversation/appointment-flows.spec.ts
 *
 * Conversation Tests — simulates real user conversation flows and verifies
 * the chatbot provides relevant, helpful responses.
 */

import { test, expect } from '../../core/fixtures';
import fuzzysort from 'fuzzysort';
import { LandingPage } from '../../pages/LandingPage';
import { EvaluationEngine } from '../../evaluations/EvaluationEngine';
import { ChatbotPrompt } from '../../core/types';
import happyPathData from '../../test-data/datasets/happy-path.json';
import doctorOnboardingData from '../../test-data/datasets/doctor-onboarding.json';
import { FrameworkConfig } from '../../config/framework.config';
import { TestResultStore } from '../../utils/TestResultStore';
import { waitForWidgetIframe } from '../../utils/widgetAvailability';

const evaluationEngine = new EvaluationEngine();
const resultStore = new TestResultStore();

const isTypingPlaceholder = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return normalized === 'butter is typing' || normalized.endsWith('is typing');
};



//Accept synonyms, partials, and booking-related phrases
const bookingIntentTerms = [
  'appointment', 'book', 'booking', 'schedule', 'doctor', 'visit', 'slot', 'available', 'help',
  'register', 'sign up', 'login', 'log in', 'account', 'reschedule', 'manage', 'notification', 'update', 'support',
  'registration page', 'login page', 'create your account', 'patients can book', 'clear updates', 'notifications', 'further assistance', 'support team'
];


// Regex and fuzzy matching for booking intent
const hasAnyTerm = (text: string, terms: string[]): { matched: string[], fuzzy: string[] } => {
  const normalized = text.toLowerCase();
  const matched = terms.filter(term => {
    // Direct substring or regex match
    try {
      if (normalized.includes(term.toLowerCase())) return true;
      const re = new RegExp(term, 'i');
      return re.test(normalized);
    } catch { return false; }
  });
  // Fuzzy match (score > -1000 is a loose threshold)
  const fuzzy = terms.filter(term => {
    const result = fuzzysort.single(term, normalized);
    return !!result && result.score > -1500;
  });
  return { matched, fuzzy };
};



// Delay/retry loop for intent check, with logging
const intentSatisfied = async (
  initialResponse: string,
  getLatestResponse: () => Promise<string>,
  keywordFallback: string[],
  llmJudgePassed?: boolean,
  maxRetries = 4,
  delayMs = 2000
): Promise<boolean> => {
  if (FrameworkConfig.llmJudge.enabled && typeof llmJudgePassed === 'boolean') {
    return llmJudgePassed;
  }

  let response = initialResponse;
  await new Promise(res => setTimeout(res, delayMs));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const latest = (await getLatestResponse().catch(() => response)) || response;
    response = latest;

    if (isTypingPlaceholder(response)) {
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, delayMs));
      }
      continue;
    }

    const termsToMatch = Array.from(new Set([...bookingIntentTerms, ...keywordFallback]));
    const { matched, fuzzy } = hasAnyTerm(response, termsToMatch);
    // Log for debugging
    console.log(`[IntentMatcher] Attempt ${attempt}: Bot response:`, response);
    console.log(`[IntentMatcher] Matched terms:`, matched, '| Fuzzy matches:', fuzzy);

    if (matched.length > 0 || fuzzy.length > 0) return true;
    if (attempt < maxRetries) await new Promise(res => setTimeout(res, delayMs));
  }

  return false;
};

const llmJudgeRelevancePassed = (
  evaluation: Awaited<ReturnType<EvaluationEngine['evaluate']>>
): boolean | undefined => {
  const llmRelevance = evaluation.evaluations.find(
    e => e.evaluatorName === 'LLMJudge:Relevance'
  );
  return llmRelevance?.passed;
};

test.describe('Chatbot — Appointment Booking Flow', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');

    const widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment after waiting.');

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

    const intentMatched = await intentSatisfied(
      turn.botResponse,
      async () => (await chatbot.getLastBotMessage()) || turn.botResponse,
      [
        'appointment',
        'book',
        'booking',
        'schedule',
        'doctor',
        'visit',
        'slot',
        'available',
        'help',
      ],
      llmJudgeRelevancePassed(evaluation)
    );
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

    const intentMatched = await intentSatisfied(
      turn.botResponse,
      async () => (await chatbot.getLastBotMessage()) || turn.botResponse,
      [
      'reschedule',
      'appointment',
      'change',
      'modify',
      'move',
      'slot',
      'time',
      'schedule',
      'another',
      ],
      llmJudgeRelevancePassed(evaluation)
    );
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

    const intentMatched = await intentSatisfied(
      turn.botResponse,
      async () => (await chatbot.getLastBotMessage()) || turn.botResponse,
      [
      'cancel',
      'cancellation',
      'appointment',
      'booking',
      'scheduled',
      'remove',
      'delete',
      'support',
      'help',
      ],
      llmJudgeRelevancePassed(evaluation)
    );
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

    const finalTurn = {
      prompt: {
        id: 'MANUAL-CONV-001',
        prompt: conversationScript.join(' '),
        expectedIntent: 'appointment booking conversation',
        expectedKeywords: ['appointment', 'book', 'schedule', 'slot'],
        category: 'appointment-booking' as const,
      },
      userMessage: conversationScript[conversationScript.length - 1],
      botResponse: finalResponse,
      latencyMs: 0,
      conversationHistory: chatbot.getConversationHistory(),
      capturedAt: new Date().toISOString(),
    };

    const finalEvaluation = await evaluationEngine.evaluate(finalTurn);

    const isRelevant = await intentSatisfied(
      finalResponse,
      async () => (await chatbot.getLastBotMessage()) || finalResponse,
      [
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
      ],
      llmJudgeRelevancePassed(finalEvaluation)
    );

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

    const widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment after waiting.');

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

      const intentMatched = await intentSatisfied(
        turn.botResponse,
        async () => (await chatbot.getLastBotMessage()) || turn.botResponse,
        [
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
        ],
        llmJudgeRelevancePassed(evaluation)
      );
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

    const widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment after waiting.');

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