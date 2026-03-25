/**
 * pages/ChatbotWidget.ts
 *
 * High-level page object wrapper around ChatbotWidgetDriver.
 */

import { Page, expect } from '@playwright/test';
import { ChatbotWidgetDriver, SendMessageResult } from '../drivers/ChatbotWidgetDriver';
import { ConversationTurn, ChatbotPrompt, ConversationMessage } from '../core/types';
import { Logger } from '../utils/Logger';

export class ChatbotWidget {
  private readonly driver: ChatbotWidgetDriver;
  private readonly logger: Logger;
  private isOpen = false;

  constructor(page: Page) {
    this.driver = new ChatbotWidgetDriver(page);
    this.logger = new Logger('ChatbotWidget');
  }

  async open(): Promise<void> {
    if (this.isOpen) return;
    await this.driver.openWidget();
    this.isOpen = true;
  }

  async reset(): Promise<void> {
    this.isOpen = false;
    await this.driver.resetConversation();
    this.isOpen = true;
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    if (!this.isOpen) await this.open();
    return this.driver.sendMessage(message);
  }

  async getResponse(message: string): Promise<string> {
    const result = await this.sendMessage(message);
    return result.botResponse;
  }

  async executePrompt(prompt: ChatbotPrompt): Promise<ConversationTurn> {
    if (!this.isOpen) await this.open();

    const capturedAt = new Date().toISOString();
    const result = await this.driver.sendMessage(prompt.prompt);

    return {
      prompt,
      userMessage: prompt.prompt,
      botResponse: result.botResponse,
      latencyMs: result.latencyMs,
      conversationHistory: this.driver.getConversationHistory(),
      capturedAt,
    };
  }

  async simulateConversation(messages: string[]): Promise<string[]> {
    if (!this.isOpen) await this.open();

    const responses: string[] = [];
    for (const message of messages) {
      const result = await this.driver.sendMessage(message);
      responses.push(result.botResponse);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return responses;
  }

  async assertWidgetVisible(): Promise<void> {
    const visible = await this.driver.isInputVisible();
    expect(visible).toBe(true);
    this.logger.debug('Widget visibility assertion passed.');
  }

  async assertResponseContains(expectedText: string): Promise<void> {
    const lastMessage = await this.driver.getLastBotMessage();
    expect(lastMessage).toBeTruthy();
    expect(lastMessage!.toLowerCase()).toContain(expectedText.toLowerCase());
  }

  async assertResponseNotContains(forbiddenText: string): Promise<void> {
    const lastMessage = await this.driver.getLastBotMessage();
    if (lastMessage) {
      expect(lastMessage.toLowerCase()).not.toContain(forbiddenText.toLowerCase());
    }
  }

  async assertResponseContainsKeyword(keywords: string[]): Promise<void> {
    const lastMessage = (await this.driver.getLastBotMessage())?.toLowerCase() ?? '';
    const found = keywords.some(keyword => lastMessage.includes(keyword.toLowerCase()));
    expect(found).toBeTruthy();
  }

  assertLatencyWithinThreshold(latencyMs: number, thresholdMs: number): void {
    expect(latencyMs).toBeLessThanOrEqual(thresholdMs);
  }

  async isInputVisible(): Promise<boolean> {
    if (!this.isOpen) await this.open();
    return this.driver.isInputVisible();
  }

  async getLastBotMessage(): Promise<string | null> {
    return this.driver.getLastBotMessage();
  }

  async getAllBotMessages(): Promise<string[]> {
    return this.driver.getAllBotMessages();
  }

  getConversationHistory(): ConversationMessage[] {
    return this.driver.getConversationHistory();
  }

  async screenshot(name: string): Promise<Buffer> {
    return this.driver.screenshotWidget(name);
  }
}