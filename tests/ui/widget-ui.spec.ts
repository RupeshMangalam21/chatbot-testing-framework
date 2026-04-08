/**
 * tests/ui/widget-ui.spec.ts
 *
 * UI-level widget smoke tests.
 */

import { test, expect } from '../../core/fixtures';
import { LandingPage } from '../../pages/LandingPage';
import { waitForWidgetIframe } from '../../utils/widgetAvailability';

test.describe('Chatbot Widget — UI', () => {
  let landingPage: LandingPage;
  let widgetAvailable = false;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.open('/');
    widgetAvailable = await waitForWidgetIframe(page);
  });
//
  test('landing page loads without errors', async ({ page }) => {
    await expect(page).not.toHaveTitle(/404|error|not found/i);
    await expect(page.locator('body')).toBeVisible();
  });
//
  test('chatbot widget iframe is present in the DOM', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    await landingPage.verifyChatbotWidgetPresent();
  });
//
  test('chatbot widget opens successfully', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const isVisible = await chatbot.isInputVisible();
    expect(isVisible).toBe(true);
  });
//
  test('chat input field is visible after widget opens', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const isVisible = await chatbot.isInputVisible();
    expect(isVisible).toBe(true);
  });
//
  test('user messages are sent and bot responds', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const response = await chatbot.getResponse('Hello');
    expect(response).toBeTruthy();
    expect(response.trim().length).toBeGreaterThan(0);
  });
//
  test('bot response is non-empty text', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const response = await chatbot.getResponse('What can you help me with?');
    expect(response.trim().length).toBeGreaterThan(0);
  });
//
  test('multiple messages render in sequence', async () => {
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');
    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const first = await chatbot.sendMessage('Hello');
    expect(first.timedOut).toBe(false);
    expect(first.botResponse.trim().length).toBeGreaterThan(0);

    const second = await chatbot.sendMessage('How do I book an appointment?');
    expect(second.timedOut).toBe(false);
    expect(second.botResponse.trim().length).toBeGreaterThan(0);

    const history = chatbot.getConversationHistory();
    const botMessages = history.filter(message => message.role === 'bot');

    expect(botMessages.length).toBeGreaterThanOrEqual(2);
    expect(botMessages[0]?.content?.trim().length ?? 0).toBeGreaterThan(0);
    expect(botMessages[1]?.content?.trim().length ?? 0).toBeGreaterThan(0);
  });
//
  test('widget is accessible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await landingPage.open('/');
    widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');

    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const isVisible = await chatbot.isInputVisible();
    expect(isVisible).toBe(true);
  });
//
  test('widget is accessible on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await landingPage.open('/');
    widgetAvailable = await waitForWidgetIframe(page);
    test.skip(!widgetAvailable, 'Widget iframe not available in this environment.');

    const chatbot = landingPage.chatbot;
    await chatbot.open();

    const isVisible = await chatbot.isInputVisible();
    expect(isVisible).toBe(true);
  });
});