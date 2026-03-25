/**
 * core/types.ts
 *
 * Shared TypeScript types used throughout the framework.
 * A single source of truth for all data shapes.
 */

// ─── Test Data ────────────────────────────────────────────────────────────────

/** A single chatbot test prompt with metadata for evaluation */
export interface ChatbotPrompt {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedKeywords: string[];
  category: PromptCategory;
  tags?: string[];
  /** If set, the expected response must contain this substring */
  expectedContains?: string;
  /** If set, the response must NOT contain this substring (safety use case) */
  expectedNotContains?: string;
  /** Maximum acceptable latency for this prompt in ms (overrides global) */
  maxLatencyMs?: number;
}

export type PromptCategory =
  | 'happy-path'
  | 'healthcare-query'
  | 'appointment-booking'
  | 'appointment-rescheduling'
  | 'appointment-cancellation'
  | 'doctor-onboarding'
  | 'platform-navigation'
  | 'general-support'
  | 'edge-case'
  | 'malicious'
  | 'prompt-injection'
  | 'long-prompt'
  | 'emoji-prompt'
  | 'empty-prompt'
  | 'multilingual';

// ─── Conversation ─────────────────────────────────────────────────────────────

/** A single message in a conversation */
export interface ConversationMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: number;
}

/** A complete conversation exchange */
export interface ConversationTurn {
  prompt: ChatbotPrompt;
  userMessage: string;
  botResponse: string;
  latencyMs: number;
  conversationHistory: ConversationMessage[];
  capturedAt: string; // ISO timestamp
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/** Result from a single evaluator */
export interface EvaluationResult {
  evaluatorName: string;
  score: number;
  maxScore: number;
  passed: boolean;
  reasoning: string;
  details?: Record<string, unknown>;
}

/** Aggregated evaluation of a single conversation turn */
export interface TurnEvaluation {
  turn: ConversationTurn;
  evaluations: EvaluationResult[];
  overallScore: number;
  overallMaxScore: number;
  passed: boolean;
  flags: EvaluationFlag[];
}

/** A flag raised during evaluation (e.g., safety concern, hallucination) */
export interface EvaluationFlag {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'safety' | 'hallucination' | 'relevance' | 'latency' | 'regression';
  message: string;
}

// ─── Test Result ──────────────────────────────────────────────────────────────

/** Result of a complete test case (may contain multiple turns) */
export interface TestCaseResult {
  testId: string;
  testName: string;
  category: PromptCategory;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  turns: TurnEvaluation[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorMessage?: string;
  screenshotPath?: string;
}

// ─── Report ───────────────────────────────────────────────────────────────────

/** The full chatbot quality report generated after a test run */
export interface ChatbotQualityReport {
  runId: string;
  generatedAt: string;
  environment: string;
  appUrl: string;

  summary: ReportSummary;
  categoryBreakdown: CategoryBreakdown[];
  testResults: TestCaseResult[];
  qualityGateResults: QualityGateResult[];
  overallGrade: QualityGrade;
}

export interface ReportSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;

  avgRelevanceScore: number;
  avgCorrectnessScore: number;
  avgCompletenessScore: number;
  avgLatencyMs: number;
  p95LatencyMs: number;

  safetyViolations: number;
  hallucinationFlags: number;
  regressionFlags: number;

  totalEvaluations: number;
}

export interface CategoryBreakdown {
  category: PromptCategory;
  totalTests: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number;
}

export interface QualityGateResult {
  gate: string;
  threshold: string | number;
  actual: string | number;
  passed: boolean;
}

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

// ─── Baseline ─────────────────────────────────────────────────────────────────

/** Saved baseline response for regression comparison */
export interface BaselineEntry {
  promptId: string;
  prompt: string;
  response: string;
  capturedAt: string;
  version: string;
}

// ─── LLM Judge ────────────────────────────────────────────────────────────────

export interface LLMJudgeInput {
  userPrompt: string;
  botResponse: string;
  expectedIntent: string;
  expectedKeywords: string[];
  category: PromptCategory;
}

export interface LLMJudgeOutput {
  relevanceScore: number;
  correctnessScore: number;
  completenessScore: number;
  safetyPass: boolean;
  reasoning: string;
  flags: string[];
}
