/**
 * config/framework.config.ts
 *
 * Central configuration for the chatbot testing framework.
 */

export const FrameworkConfig = {
  widget: {
    iframeSelector: [
      'iframe#chat-widget',
      'iframe[src*="secure.livechatinc.com"]',
      'iframe[title="LiveChat chat widget"]',
    ].join(', '),

    minimizedIframeSelector: [
      'iframe#chat-widget-minimized',
      'iframe[id*="minimized"]',
    ].join(', '),

    iframeFallbackSelector: 'iframe',

    openButtonSelector: [
      '[data-testid="chatbot-open"]',
      'button[aria-label*="chat" i]',
      'button[aria-label*="open chat" i]',
      '.chatbot-launcher',
    ].join(', '),

    iframeLoadTimeoutMs: 20_000,
    botResponseTimeoutMs: 45_000,
    responsePollingIntervalMs: 300,

    internal: {
      chatInput: [
        'textarea[aria-label="Write a message…"]',
        'textarea[placeholder="Write a message…"]',
        'input[aria-label="Write a message…"]',
        'input[placeholder="Write a message…"]',
        'textarea',
        'form textarea',
        'form input[type="text"]',
        'form input',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '[data-lc-id="11"]',
      ].join(','),

      sendButton: [
        'button[aria-label="Send a message"]',
        'button[aria-label="Send message"]',
        'button[type="submit"]',
        'button[data-testid*="send"]',
        '[role="button"][aria-label*="send" i]',
        '[data-lc-id*="send"]',
      ].join(','),

      messageList: [
        '[data-lc-id="message-list"]',
        '[class*="messages"]',
        '[class*="messageList"]',
        '[role="log"]',
        'ul',
      ].join(','),

      botMessage: [
        '[data-author="agent"]',
        '[data-is-own-message="false"]',
        '[data-lc-id*="message"]',
        '[class*="message"][data-is-own-message="false"]',
        '[class*="message"][data-author="agent"]',
        '[class*="message"]',
      ].join(','),

      userMessage: [
        '[data-is-own-message="true"]',
        '[class*="message"][data-is-own-message="true"]',
      ].join(','),

      typingIndicator: [
        '[data-lc-id="typing-indicator"]',
        '[class*="typing"]',
        '[aria-label*="typing"]',
      ].join(','),

      welcomeMessage: [
        '[data-lc-id="greeting"]',
        '[class*="greeting"]',
        '[class*="welcome"]',
      ].join(','),
    },
  },

  scoring: {
    relevance: { min: 0, max: 5, passingThreshold: 3 },
    correctness: { min: 0, max: 5, passingThreshold: 3 },
    completeness: { min: 0, max: 5, passingThreshold: 3 },
    latency: {
      excellent: 3_000,
      acceptable: 8_000,
      poor: 15_000,
      failing: 30_000,
    },
    safety: {
      passValue: 1,
      failValue: 0,
    },
    similarity: {
      regressionThreshold: 0.75,
    },
  },

  qualityGates: {
    minPassRate: 0.8,
    minAvgRelevanceScore: 3.0,
    maxSafetyViolations: 0,
    maxAvgLatencyMs: 10_000,
    minOverallGrade: 'C',
  },

  llmJudge: {
    enabled: process.env.LLM_JUDGE_ENABLED === 'true',
    provider: (process.env.LLM_JUDGE_PROVIDER || 'anthropic') as
      | 'openai'
      | 'anthropic'
      | 'local',
    model: process.env.LLM_JUDGE_MODEL || 'claude-3-haiku-20240307',
    maxTokens: 512,
    temperature: 0,
  },

  resilience: {
    maxRetries: 3,
    retryDelayMs: 2_000,
    exponentialBackoff: true,
  },

  reporting: {
    outputDir: 'chatbot-reports',
    baselineDir: 'test-data/baselines',
    screenshotsDir: 'test-artifacts/screenshots',
    includeRawResponses: true,
    includeConversationTranscripts: true,
  },
} as const;

export type LatencyGrade = 'excellent' | 'acceptable' | 'poor' | 'failing';
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';