/**
 * core/fixtures.ts
 *
 * Custom Playwright fixtures with a stealth browser context.
 *
 * IMPORTANT:
 * Test files should import `test` and `expect` from this file,
 * not directly from '@playwright/test'.
 */

import { test as baseTest, expect, BrowserContext, Page } from '@playwright/test';

export { expect };

const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(window.navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });

  Object.defineProperty(window.navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
    configurable: true,
  });

  Object.defineProperty(window.navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true,
  });

  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: {} },
      configurable: true,
    });
  }
`;

type StealthFixtures = {
  stealthContext: BrowserContext;
  page: Page;
};

export const test = baseTest.extend<StealthFixtures>({
  stealthContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      userAgent: STEALTH_USER_AGENT,
      bypassCSP: true,
      permissions: [],
      ignoreHTTPSErrors: true,
    });

    await context.addInitScript({ content: STEALTH_INIT_SCRIPT });

    await use(context);
    await context.close();
  },

  page: async ({ stealthContext }, use) => {
    const page = await stealthContext.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (
          !text.includes('favicon') &&
          !text.includes('net::ERR_ABORTED') &&
          !text.includes('Third-party cookie')
        ) {
          console.log(`  [PAGE ERROR] ${text}`);
        }
      }
    });

    page.on('requestfailed', request => {
      const url = request.url();
      if (url.includes('chatbot') || url.includes('livechat')) {
        console.log(`  [BLOCKED REQUEST] ${request.failure()?.errorText}: ${url}`);
      }
    });

    await use(page);
    await page.close();
  },
});