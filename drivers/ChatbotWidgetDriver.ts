/**
 * drivers/ChatbotWidgetDriver.ts
 *
 * LiveChat widget driver for Playwright.
 *
 * Important behavior:
 * - the writable composer can appear in one iframe/state
 * - bot messages can appear in another iframe/state after expansion
 * - DOM nodes are frequently replaced during interaction
 *
 * Therefore this driver:
 * 1. finds an interactive iframe for typing
 * 2. refreshes the input locator aggressively
 * 3. scans all widget iframes when reading bot responses
 * 4. waits for the bot response to fully settle before returning
 */

import { Page, FrameLocator, Locator } from '@playwright/test';
import { FrameworkConfig } from '../config/framework.config';
import { ConversationMessage } from '../core/types';
import { Logger } from '../utils/Logger';
import { sleep } from '../utils/helpers';

export interface SendMessageResult {
  botResponse: string;
  latencyMs: number;
  timedOut: boolean;
}

type CandidateFrame = {
  selector: string;
  index: number;
  frame: FrameLocator;
};

type MessageCandidate = {
  text: string;
  score: number;
};

export class ChatbotWidgetDriver {
  private readonly page: Page;
  private readonly logger: Logger;
  private frameLocator: FrameLocator | null = null;
  private conversationHistory: ConversationMessage[] = [];

  constructor(page: Page) {
    this.page = page;
    this.logger = new Logger('ChatbotWidgetDriver');
  }

  async openWidget(): Promise<void> {
    this.logger.info('Opening chatbot widget...');

    await this.waitForReactHydration();
    await this.waitForWidgetShell();
    await this.attachToInteractiveIframe();
    await this.waitForChatInput();

    this.logger.info('Widget is ready for interaction.');
  }

  async isInputVisible(): Promise<boolean> {
    try {
      await this.attachToInteractiveIframe();
      const input = await this.getFreshInputLocator();
      return await input.isVisible().catch(() => false);
    } catch {
      return false;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    this.logger.info(`Sending message: "${message.substring(0, 80)}..."`);

    await this.attachToInteractiveIframe();
    let inputLocator = await this.getFreshInputLocator();

    const messagesBefore = await this.getBotMessageCountAcrossFrames();
    const lastBotMessageBefore = await this.getLastBotMessageAcrossFrames();

    await this.safePrepareInput(inputLocator);

    inputLocator = await this.getFreshInputLocator();
    await this.focusChatInput(inputLocator);

    inputLocator = await this.getFreshInputLocator();
    await this.clearInput(inputLocator);

    inputLocator = await this.getFreshInputLocator();
    await this.typeIntoChatInput(inputLocator, message);

    await this.page.waitForTimeout(350);
    await this.attachToInteractiveIframe();

    inputLocator = await this.getFreshInputLocator();
    const typedText = await this.readInputContent(inputLocator);
    if (!typedText.trim()) {
      throw new Error('Message was not typed into the chat input.');
    }

    const sentAt = Date.now();

    await this.submitMessage(inputLocator, typedText);

    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: sentAt,
    });

    const result = await this.waitForNewBotMessage(
      messagesBefore,
      sentAt,
      lastBotMessageBefore
    );

    if (!result.timedOut) {
      this.conversationHistory.push({
        role: 'bot',
        content: result.botResponse,
        timestamp: sentAt + result.latencyMs,
      });
    }

    return result;
  }

  async waitForResponse(previousMessageCount?: number): Promise<string> {
    const countBefore =
      previousMessageCount ?? (await this.getBotMessageCountAcrossFrames()) - 1;

    const result = await this.waitForNewBotMessage(
      countBefore,
      Date.now(),
      await this.getLastBotMessageAcrossFrames()
    );

    return result.botResponse;
  }

  async getLastBotMessage(): Promise<string | null> {
    return this.getLastBotMessageAcrossFrames();
  }

  async getAllBotMessages(): Promise<string[]> {
    return this.getAllBotMessagesAcrossFrames();
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  async resetConversation(): Promise<void> {
    this.logger.info('Resetting conversation (page reload)...');
    this.conversationHistory = [];
    this.frameLocator = null;
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.openWidget();
  }

  async screenshotWidget(name: string): Promise<Buffer> {
    if (this.frameLocator) {
      return this.frameLocator.locator('body').screenshot({
        path: `test-artifacts/screenshots/${name}.png`,
      });
    }

    return this.page.screenshot({
      path: `test-artifacts/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  async isTyping(): Promise<boolean> {
    const frames = await this.getCandidateFrames();

    for (const candidate of frames) {
      try {
        const visible = await candidate.frame
          .locator(FrameworkConfig.widget.internal.typingIndicator)
          .first()
          .isVisible({ timeout: 500 })
          .catch(() => false);

        if (visible) return true;
      } catch {
        // continue
      }
    }

    return false;
  }

  private isTransientBotText(text: string): boolean {
    const lower = text.trim().toLowerCase();
    if (!lower) return true;

    return (
      lower === 'hello' ||
      lower === 'send' ||
      lower === 'write a message…' ||
      lower === 'write a message...' ||
      lower.length < 2 ||
      lower === 'typing' ||
      lower === 'typing...' ||
      /\bis typing\b/.test(lower) ||
      /^powered by\b/.test(lower) ||
      /^write a message/.test(lower) ||
      /^send( a message)?$/.test(lower) ||
      /^chat$/.test(lower) ||
      /^close$/.test(lower) ||
      /^read$/.test(lower) ||
      /^learn more$/.test(lower) ||
      /^contact( us)?$/.test(lower) ||
      lower === 'launcher'
    );
  }

  private scoreBotTextCandidate(text: string): number {
    const normalized = text.trim();
    if (!normalized || this.isTransientBotText(normalized)) return -100;

    const lower = normalized.toLowerCase();
    let score = 0;

    if (normalized.length >= 20) score += 4;
    if (normalized.length >= 60) score += 4;
    if (normalized.split(/\s+/).length >= 5) score += 3;
    if (/[.!?]/.test(normalized)) score += 2;
    if (/\b(appointment|support|clinic|doctor|hours|available|email)\b/.test(lower)) score += 2;

    if (/^(read|open|close|send|chat)$/i.test(normalized)) score -= 10;
    if (normalized.length <= 6) score -= 6;

    return score;
  }

  private async collectBotMessageCandidates(
    candidate: CandidateFrame,
    selectors: string[]
  ): Promise<MessageCandidate[]> {
    const collected: MessageCandidate[] = [];

    for (const selector of selectors) {
      try {
        const nodes = candidate.frame.locator(selector);
        const count = await nodes.count();

        // Sample recent nodes first; latest widget responses are usually near the end.
        const start = Math.max(0, count - 20);
        for (let i = count - 1; i >= start; i--) {
          const node = nodes.nth(i);
          const visible = await node.isVisible().catch(() => false);
          if (!visible) continue;

          const tagName = (
            (await node.evaluate(el => el.tagName.toLowerCase()).catch(() => '')) || ''
          ).trim();
          if (tagName === 'button' || tagName === 'a') continue;

          const text = ((await node.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          const score = this.scoreBotTextCandidate(text);
          if (score <= 0) continue;

          collected.push({ text, score });
        }
      } catch {
        // continue
      }
    }

    return collected;
  }

  private async waitForReactHydration(): Promise<void> {
    this.logger.debug('Waiting for React hydration...');

    await this.page
      .waitForLoadState('domcontentloaded', { timeout: 15_000 })
      .catch(() => this.logger.debug('domcontentloaded timed out — continuing'));

    await this.page
      .waitForFunction(() => document.readyState === 'complete', { timeout: 15_000 })
      .catch(() => this.logger.debug('readyState complete timed out — continuing'));

    await this.waitForIframeOrTimeout(12_000);
  }

  private async waitForIframeOrTimeout(maxWaitMs: number): Promise<void> {
    const pollInterval = 300;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const count = await this.page.locator('iframe').count();
      if (count > 0) return;
      await sleep(pollInterval);
    }
  }

  private async waitForWidgetShell(): Promise<void> {
    const selectors = [
      FrameworkConfig.widget.minimizedIframeSelector,
      'iframe#chat-widget',
      FrameworkConfig.widget.iframeSelector,
      FrameworkConfig.widget.iframeFallbackSelector,
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, {
          timeout: FrameworkConfig.widget.iframeLoadTimeoutMs,
          state: 'attached',
        });
        this.logger.debug(`Widget shell found with selector: ${selector}`);
        return;
      } catch {
        this.logger.debug(`Widget shell not found with selector: ${selector}, trying next...`);
      }
    }

    throw new Error(
      `Widget shell not found after ${FrameworkConfig.widget.iframeLoadTimeoutMs}ms.`
    );
  }

  private async getCandidateFrames(): Promise<CandidateFrame[]> {
    const selectorsToTry = [
      'iframe#chat-widget-minimized',
      'iframe#chat-widget',
      FrameworkConfig.widget.minimizedIframeSelector,
      FrameworkConfig.widget.iframeSelector,
      'iframe',
    ];

    const seen = new Set<string>();
    const candidates: CandidateFrame[] = [];

    for (const selector of selectorsToTry) {
      try {
        const loc = this.page.locator(selector);
        const count = await loc.count();

        for (let i = 0; i < count; i++) {
          const nth = loc.nth(i);
          const visible = await nth.isVisible().catch(() => false);
          if (!visible) continue;

          const key = `${selector}::${i}`;
          if (seen.has(key)) continue;
          seen.add(key);

          candidates.push({
            selector,
            index: i,
            frame: this.page.frameLocator(selector).nth(i),
          });
        }
      } catch {
        // continue
      }
    }

    return candidates;
  }

  private async attachToInteractiveIframe(): Promise<void> {
    const deadline = Date.now() + FrameworkConfig.widget.iframeLoadTimeoutMs;

    while (Date.now() < deadline) {
      const frames = await this.getCandidateFrames();

      for (const candidate of frames) {
        try {
          const input = candidate.frame
            .locator(FrameworkConfig.widget.internal.chatInput)
            .first();

          const inputVisible = await input.isVisible({ timeout: 800 }).catch(() => false);

          if (inputVisible) {
            this.frameLocator = candidate.frame;
            this.logger.debug(
              `Attached to interactive iframe via selector "${candidate.selector}" at index ${candidate.index}.`
            );
            return;
          }
        } catch {
          // continue
        }
      }

      await sleep(250);
    }

    throw new Error(
      'Could not find an interactive widget iframe exposing a visible chat input.'
    );
  }

  private async waitForChatInput(): Promise<void> {
    const input = await this.getFreshInputLocator();
    await input.waitFor({
      state: 'visible',
      timeout: FrameworkConfig.widget.iframeLoadTimeoutMs,
    });

    await this.safePrepareInput(input);
    this.logger.debug('Input visible and focused.');
  }

  private async getFreshInputLocator(): Promise<Locator> {
    await this.attachToInteractiveIframe();
    const frame = this.getFrame();
    const input = frame.locator(FrameworkConfig.widget.internal.chatInput).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    return input;
  }

  private async safePrepareInput(inputLocator: Locator): Promise<void> {
    try {
      await inputLocator.scrollIntoViewIfNeeded();
    } catch {
      inputLocator = await this.getFreshInputLocator();
    }

    await inputLocator.click({ force: true, timeout: 5_000 }).catch(async () => {
      const fresh = await this.getFreshInputLocator();
      await fresh.click({ force: true, timeout: 5_000 });
    });

    await this.page.waitForTimeout(250);
  }

  private async focusChatInput(inputLocator: Locator): Promise<void> {
    await inputLocator.click({ force: true, timeout: 5_000 }).catch(async () => {
      const fresh = await this.getFreshInputLocator();
      await fresh.click({ force: true, timeout: 5_000 });
    });

    await this.page.waitForTimeout(250);
  }

  private async clearInput(inputLocator: Locator): Promise<void> {
    const tagName = await inputLocator
      .evaluate(el => el.tagName.toLowerCase())
      .catch(() => '');

    if (tagName === 'input' || tagName === 'textarea') {
      await inputLocator.fill('').catch(async () => {
        const fresh = await this.getFreshInputLocator();
        await fresh.fill('');
      });
      await this.page.waitForTimeout(100);
      return;
    }

    await this.page.keyboard.press('Control+A').catch(() => {});
    await this.page.keyboard.press('Meta+A').catch(() => {});
    await this.page.keyboard.press('Backspace').catch(() => {});
    await this.page.waitForTimeout(100);
  }

  private async typeIntoChatInput(inputLocator: Locator, message: string): Promise<void> {
    const tagName = await inputLocator
      .evaluate(el => el.tagName.toLowerCase())
      .catch(() => '');

    if (tagName === 'input' || tagName === 'textarea') {
      try {
        await inputLocator.fill(message);
        await this.page.waitForTimeout(250);

        const valueAfterFill = await this.readInputContent(await this.getFreshInputLocator());
        if (valueAfterFill.trim()) return;
      } catch {
        // continue
      }
    }

    try {
      const fresh = await this.getFreshInputLocator();
      await fresh.pressSequentially(message, { delay: 35 });
      await this.page.waitForTimeout(250);

      const typedText = await this.readInputContent(await this.getFreshInputLocator());
      if (typedText.trim()) return;
    } catch {
      // continue
    }

    await this.page.keyboard.type(message, { delay: 35 });
    await this.page.waitForTimeout(250);

    let typedText = await this.readInputContent(await this.getFreshInputLocator());
    if (typedText.trim()) return;

    await this.forceTypeIntoFocusedInput(await this.getFreshInputLocator(), message);
    await this.page.waitForTimeout(250);

    typedText = await this.readInputContent(await this.getFreshInputLocator());
    if (!typedText.trim()) {
      throw new Error('Message still not present after all typing fallbacks.');
    }
  }

  private async readInputContent(inputLocator: Locator): Promise<string> {
    let typedText = await inputLocator.inputValue().catch(() => '');
    if (typedText?.trim()) return typedText;

    typedText = (await inputLocator.textContent().catch(() => '')) || '';
    if (typedText?.trim()) return typedText;

    typedText =
      (await inputLocator
        .evaluate((el: Element) => {
          const node = el as HTMLElement & { value?: string };
          if (typeof node.value === 'string') return node.value || '';
          return node.innerText || node.textContent || '';
        })
        .catch(() => '')) || '';

    return typedText || '';
  }

  private async forceTypeIntoFocusedInput(inputLocator: Locator, message: string): Promise<void> {
    await inputLocator.evaluate((el: Element, value: string) => {
      const target = el as HTMLElement & { value?: string };

      if ('value' in target) {
        const proto = Object.getPrototypeOf(target);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        descriptor?.set?.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      target.textContent = value;
      target.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value,
          inputType: 'insertText',
        })
      );
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }, message);
  }

  private async submitMessage(
    inputLocator: Locator,
    typedTextBeforeSend: string
  ): Promise<void> {
    await this.page.waitForTimeout(300);

    const inputHasCleared = async (): Promise<boolean> => {
      try {
        const fresh = await this.getFreshInputLocator();
        const value = await this.readInputContent(fresh);
        return value.trim().length === 0;
      } catch {
        return false;
      }
    };

    const inputChangedSignificantly = async (): Promise<boolean> => {
      try {
        const fresh = await this.getFreshInputLocator();
        const value = await this.readInputContent(fresh);
        return value.trim() !== typedTextBeforeSend.trim();
      } catch {
        return false;
      }
    };

    const directInputAttempts: Array<() => Promise<void>> = [
      async () => {
        const fresh = await this.getFreshInputLocator();
        await fresh.press('Enter', { timeout: 3000 });
        this.logger.debug('Tried send via input Enter.');
      },
      async () => {
        const fresh = await this.getFreshInputLocator();
        await fresh.press('NumpadEnter', { timeout: 3000 });
        this.logger.debug('Tried send via input NumpadEnter.');
      },
    ];

    for (const attempt of directInputAttempts) {
      try {
        await attempt();
        await this.page.waitForTimeout(500);

        if (await inputHasCleared()) {
          this.logger.debug('Input cleared after Enter — send likely succeeded.');
          return;
        }

        if (await inputChangedSignificantly()) {
          this.logger.debug('Input changed after Enter — send likely succeeded.');
          return;
        }
      } catch {
        // continue
      }
    }

    await this.attachToInteractiveIframe();
    const currentFrame = this.getFrame();

    const sendButtonCandidates = [
      'button[aria-label="Send a message"]:not([disabled])',
      'button[aria-label="Send message"]:not([disabled])',
      'button[type="submit"]:not([disabled])',
      'button[data-testid*="send"]:not([disabled])',
      '[role="button"][aria-label*="send" i]:not([disabled])',
      '[data-lc-id*="send"]:not([disabled])',
      '[data-testid*="send"]',
      'button',
      '[role="button"]',
    ];

    for (const selector of sendButtonCandidates) {
      try {
        const candidates = currentFrame.locator(selector);
        const count = await candidates.count();

        for (let i = 0; i < Math.min(count, 12); i++) {
          const button = candidates.nth(i);
          const visible = await button.isVisible().catch(() => false);
          if (!visible) continue;

          const aria = (await button.getAttribute('aria-label').catch(() => '')) || '';
          const title = (await button.getAttribute('title').catch(() => '')) || '';
          const text = ((await button.textContent().catch(() => '')) || '').trim();
          const cls = (await button.getAttribute('class').catch(() => '')) || '';

          const haystack = `${aria} ${title} ${text} ${cls}`.toLowerCase();

          const looksSendLike =
            selector !== 'button' && selector !== '[role="button"]'
              ? true
              : haystack.includes('send') ||
                haystack.includes('submit') ||
                haystack.includes('arrow') ||
                haystack.includes('paper-plane') ||
                haystack.includes('icon-send');

          if (!looksSendLike) continue;

          await button.click({ timeout: 3000, force: true }).catch(() => {});
          this.logger.debug(`Tried send button candidate: ${selector} [${i}]`);

          await this.page.waitForTimeout(500);

          if (await inputHasCleared()) {
            this.logger.debug('Input cleared after button click — send likely succeeded.');
            return;
          }

          if (await inputChangedSignificantly()) {
            this.logger.debug('Input changed after button click — send likely succeeded.');
            return;
          }
        }
      } catch {
        // continue
      }
    }

    const pageKeyboardAttempts: Array<() => Promise<void>> = [
      async () => {
        await this.page.keyboard.press('Enter');
        this.logger.debug('Tried send via page keyboard Enter.');
      },
      async () => {
        await this.page.keyboard.press('NumpadEnter');
        this.logger.debug('Tried send via page keyboard NumpadEnter.');
      },
    ];

    for (const attempt of pageKeyboardAttempts) {
      try {
        await attempt();
        await this.page.waitForTimeout(500);

        if (await inputHasCleared()) {
          this.logger.debug('Input cleared after page keyboard send.');
          return;
        }

        if (await inputChangedSignificantly()) {
          this.logger.debug('Input changed after page keyboard send.');
          return;
        }
      } catch {
        // continue
      }
    }

    throw new Error('Unable to trigger any send action.');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Response detection across all widget iframes
  // ────────────────────────────────────────────────────────────────────────────

  private async getLastBotMessageAcrossFrames(): Promise<string | null> {
    const frames = await this.getCandidateFrames();

    const strictSelectors = [
      FrameworkConfig.widget.internal.botMessage,
      '[data-author="agent"]',
      '[data-is-own-message="false"]',
      '[data-lc-id*="message"]',
      '[class*="message"]',
    ];

    const fallbackSelectors = [
      'li',
      'p',
      'div',
    ];

    let best: MessageCandidate | null = null;

    for (const candidate of frames) {
      const strictCandidates = await this.collectBotMessageCandidates(candidate, strictSelectors);
      for (const hit of strictCandidates) {
        if (!best || hit.score > best.score) {
          best = hit;
        }
      }

      if (!best || best.score < 6) {
        const fallbackCandidates = await this.collectBotMessageCandidates(candidate, fallbackSelectors);
        for (const hit of fallbackCandidates) {
          if (!best || hit.score > best.score) {
            best = hit;
          }
        }
      }
    }

    return best?.text || null;
  }

  private async getBotMessageCountAcrossFrames(): Promise<number> {
    const frames = await this.getCandidateFrames();

    const candidateSelectors = [
      FrameworkConfig.widget.internal.botMessage,
      '[data-author="agent"]',
      '[data-is-own-message="false"]',
      '[data-lc-id*="message"]',
    ];

    let bestCount = 0;

    for (const candidate of frames) {
      for (const selector of candidateSelectors) {
        try {
          const count = await candidate.frame.locator(selector).count();
          if (count > bestCount) {
            bestCount = count;
          }
        } catch {
          // continue
        }
      }
    }

    return bestCount;
  }

  private async getAllBotMessagesAcrossFrames(): Promise<string[]> {
    const frames = await this.getCandidateFrames();

    const candidateSelectors = [
      FrameworkConfig.widget.internal.botMessage,
      '[data-author="agent"]',
      '[data-is-own-message="false"]',
      '[data-lc-id*="message"]',
      '[class*="message"]',
    ];

    const results: string[] = [];
    const seen = new Set<string>();

    for (const candidate of frames) {
      const candidates = await this.collectBotMessageCandidates(candidate, candidateSelectors);
      for (const hit of candidates) {
        if (seen.has(hit.text)) continue;
        seen.add(hit.text);
        results.push(hit.text);
      }
    }

    return results;
  }

  private async waitForBotResponseToSettle(
    previousLastMessage?: string | null,
    settleMs: number = 3000,
    totalTimeoutMs: number = FrameworkConfig.widget.botResponseTimeoutMs
  ): Promise<string | null> {
    const deadline = Date.now() + totalTimeoutMs;

    let lastObservedMessage = '';
    let lastChangeAt = 0;
    let sawTyping = false;

    while (Date.now() < deadline) {
      const currentLastMessageRaw = await this.getLastBotMessageAcrossFrames().catch(() => null);
      const currentLastMessage = currentLastMessageRaw?.trim() || '';
      const typing = await this.isTyping().catch(() => false);

      if (typing) {
        sawTyping = true;
      }

      const isNew =
        !!currentLastMessage &&
        currentLastMessage !== (previousLastMessage?.trim() || '');

      if (isNew && currentLastMessage !== lastObservedMessage) {
        lastObservedMessage = currentLastMessage;
        lastChangeAt = Date.now();
        await sleep(300);
        continue;
      }

      if (typing) {
        await sleep(300);
        continue;
      }

      if (lastObservedMessage) {
        const stableForMs = Date.now() - lastChangeAt;

        if (stableForMs >= settleMs) {
          return lastObservedMessage;
        }

        if (!sawTyping && stableForMs >= 2000 && lastObservedMessage.trim().length > 12) {
          return lastObservedMessage;
        }
      }

      await sleep(300);
    }

    return lastObservedMessage || null;
  }

  private async waitForNewBotMessage(
    countBefore: number,
    sentAt: number,
    lastBotMessageBefore?: string | null
  ): Promise<SendMessageResult> {
    const timeoutMs = FrameworkConfig.widget.botResponseTimeoutMs;
    const pollInterval = FrameworkConfig.widget.responsePollingIntervalMs;
    const deadline = sentAt + timeoutMs;

    let firstResponseAt = 0;
    let lastNonEmptySeen = '';

    while (Date.now() < deadline) {
      const currentCount = await this.getBotMessageCountAcrossFrames().catch(() => countBefore);
      const currentLastMessage = await this.getLastBotMessageAcrossFrames().catch(() => null);
      const typing = await this.isTyping().catch(() => false);

      const normalizedCurrent = currentLastMessage?.trim() || '';
      const normalizedPrevious = lastBotMessageBefore?.trim() || '';

      if (normalizedCurrent) {
        lastNonEmptySeen = normalizedCurrent;
      }

      const hasNewMessage =
        !!normalizedCurrent && normalizedCurrent !== normalizedPrevious;

      if (hasNewMessage || currentCount > countBefore || typing) {
        firstResponseAt = firstResponseAt || Date.now();

        const settled = await this.waitForBotResponseToSettle(
          lastBotMessageBefore,
          3000,
          Math.max(6000, deadline - Date.now())
        );

        if (settled?.trim()) {
          return {
            botResponse: settled.trim(),
            latencyMs: Date.now() - sentAt,
            timedOut: false,
          };
        }
      }

      await sleep(pollInterval);
    }

    if (lastNonEmptySeen && lastNonEmptySeen !== (lastBotMessageBefore?.trim() || '')) {
      return {
        botResponse: lastNonEmptySeen,
        latencyMs: Date.now() - sentAt,
        timedOut: false,
      };
    }

    return {
      botResponse: '',
      latencyMs: timeoutMs,
      timedOut: true,
    };
  }

  private async getBotMessageCount(): Promise<number> {
    return this.getBotMessageCountAcrossFrames();
  }

  private getFrame(): FrameLocator {
    if (!this.frameLocator) {
      throw new Error('Widget iframe is not attached yet. Call openWidget() first.');
    }
    return this.frameLocator;
  }
}