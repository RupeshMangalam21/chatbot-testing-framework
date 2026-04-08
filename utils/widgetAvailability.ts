import { Page } from '@playwright/test';
import { FrameworkConfig } from '../config/framework.config';

/**
 * Waits for any iframe to appear so widget-driven suites don't skip too early
 * while the app/chat widget is still initializing.
 */
export async function waitForWidgetIframe(
  page: Page,
  timeoutMs: number = FrameworkConfig.widget.iframeLoadTimeoutMs + 10_000,
  pollMs: number = 500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const iframeCount = await page.locator('iframe').count().catch(() => 0);
    if (iframeCount > 0) {
      return true;
    }

    await page.waitForTimeout(pollMs);
  }

  return false;
}
