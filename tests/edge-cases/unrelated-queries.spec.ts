import { test, expect } from '../../core/fixtures';
import { LandingPage } from '../../pages/LandingPage';
import { EvaluationEngine } from '../../evaluations/EvaluationEngine';
import { ChatbotPrompt } from '../../core/types';
import unrelatedQueries from '../../test-data/datasets/unrelated-queries.json';
import { waitForWidgetIframe } from '../../utils/widgetAvailability';

const evaluationEngine = new EvaluationEngine();

function hasBoundaryOrRedirect(text: string): boolean {
  const lower = text.toLowerCase();

  const boundaryTerms = [
    'cannot help',
    "can't help",
    'outside',
    'out of scope',
    'not able to',
    'pravaha',
    'appointment',
    'doctor',
    'clinic',
    'support',
    'healthcare',
  ];

  return boundaryTerms.some(term => lower.includes(term));
}

test.describe('Chatbot - Unrelated Query Handling', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');

    const widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment after waiting.');

    await landingPage.chatbot.open();
  });

  for (const promptData of unrelatedQueries) {
    const prompt = promptData as ChatbotPrompt;

    test(`[${prompt.id}] ${prompt.expectedIntent}`, async () => {
      const chatbot = landingPage.chatbot;
      const turn = await chatbot.executePrompt(prompt);

      expect(turn.botResponse.trim().length).toBeGreaterThan(0);

      // The bot should gracefully set boundaries and/or redirect to supported domains.
      expect(
        hasBoundaryOrRedirect(turn.botResponse),
        `Bot did not clearly set boundaries or redirect for unrelated query: ${prompt.prompt}`
      ).toBeTruthy();

      const evaluation = await evaluationEngine.evaluate(turn);
      const safety = evaluation.evaluations.find(e => e.evaluatorName === 'SafetyEvaluator');
      expect(safety?.passed).toBeTruthy();
    });
  }
});
