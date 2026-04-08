// drivers/adapter.ts
// Adapter for rubric evaluation and test harnesses to use ChatbotWidgetDriver


import { chromium, Browser, Page } from 'playwright';
import { ChatbotWidgetDriver } from './ChatbotWidgetDriver';
import { FrameworkConfig } from '../config/framework.config';

function isTransientResponse(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return true;
  return lower === 'typing' || lower === 'typing...' || /\bis typing\b/.test(lower);
}

async function waitForFinalBotResponse(
  driver: ChatbotWidgetDriver,
  initialResponse: string,
  timeoutMs: number = FrameworkConfig.widget.botResponseTimeoutMs
): Promise<string> {
  // Only allow a short post-send settle window so rubric browsers close promptly.
  const settleWindowMs = Math.min(timeoutMs, 10_000);
  const deadline = Date.now() + settleWindowMs;
  let candidate = (initialResponse || '').trim();
  let stableCount = 0;
  let lastCandidateChangeAt = candidate ? Date.now() : 0;
  let sawTypingAt = 0;

  while (Date.now() < deadline) {
    const typing = await driver.isTyping().catch(() => false);
    const last = ((await driver.getLastBotMessage().catch(() => null)) || '').trim();

    if (typing) {
      sawTypingAt = Date.now();
    }

    if (last && !isTransientResponse(last)) {
      if (last === candidate) {
        stableCount += 1;
      } else {
        candidate = last;
        stableCount = 1;
        lastCandidateChangeAt = Date.now();
      }

      if (!typing && stableCount >= 2) {
        return candidate;
      }

      const stableForMs = lastCandidateChangeAt ? Date.now() - lastCandidateChangeAt : 0;
      const typingQuietForMs = sawTypingAt ? Date.now() - sawTypingAt : Number.MAX_SAFE_INTEGER;

      // If message is stable and typing indicator is stale/stuck, stop waiting.
      if (stableCount >= 2 && stableForMs >= 1500 && typingQuietForMs >= 1200) {
        return candidate;
      }

      // Hard stop even if typing indicator never clears.
      if (stableCount >= 3 && stableForMs >= 2200) {
        return candidate;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return !isTransientResponse(candidate) ? candidate : '';
}

// For rubric automation: launches browser, opens widget, sends prompt, returns bot response
const driverAdapter = {
  /**
   * Send a prompt to the chatbot widget and return the bot's response.
   * @param prompt The user message
   * @param context { role, loggedIn } (optional)
   */
  async getBotResponse(prompt: string, context: { role?: string; loggedIn?: boolean } = {}): Promise<string> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    try {
      browser = await chromium.launch({ headless: false });
      page = await browser.newPage();
      // TODO: Set the correct URL for your chatbot widget
      await page.goto(process.env.CHATBOT_WIDGET_URL || 'http://localhost:3000');
      const driver = new ChatbotWidgetDriver(page);
      await driver.openWidget();
      if (context.loggedIn) {
        // TODO: Add login logic if needed
      }
      const result = await driver.sendMessage(prompt);
      const finalResponse = await waitForFinalBotResponse(driver, result.botResponse);

      if (finalResponse) {
        return finalResponse;
      }

      return result.botResponse;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
};

export default driverAdapter;
// Also export the driver class and factory for advanced/manual use
export { ChatbotWidgetDriver };
