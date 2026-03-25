/**
 * pages/LandingPage.ts
 *
 * Page Object for the Next.js landing page that hosts the chatbot widget.
 */

import { Page, expect } from '@playwright/test';
import { ChatbotWidget } from './ChatbotWidget';
import { Logger } from '../utils/Logger';

export class LandingPage {
  private readonly page: Page;
  private readonly logger: Logger;
  private _chatbot: ChatbotWidget | null = null;

  constructor(page: Page) {
    this.page = page;
    this.logger = new Logger('LandingPage');
  }

  async open(path: string = '/'): Promise<void> {
    this.logger.info(`Opening landing page: ${path}`);
    await this.page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.verifyLoaded();
  }

  async verifyLoaded(): Promise<void> {
    await expect(this.page).not.toHaveTitle(/404|error|not found/i);
    await expect(this.page.locator('main, #main, [role="main"], body')).toBeVisible();
    this.logger.debug('Landing page verified as loaded.');
  }

  async verifyChatbotWidgetPresent(): Promise<void> {
    await expect(this.page.locator('iframe').first()).toBeAttached({
      timeout: 15_000,
    });
    this.logger.debug('Chatbot widget iframe confirmed present in DOM.');
  }

  get chatbot(): ChatbotWidget {
    if (!this._chatbot) {
      this._chatbot = new ChatbotWidget(this.page);
    }
    return this._chatbot;
  }

  getPage(): Page {
    return this.page;
  }
}