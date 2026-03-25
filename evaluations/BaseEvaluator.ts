/**
 * evaluations/BaseEvaluator.ts
 *
 * Abstract base class for all chatbot response evaluators.
 * All evaluators must implement evaluate() and return a standardized EvaluationResult.
 */

import { ConversationTurn, EvaluationResult } from '../core/types';

export abstract class BaseEvaluator {
  /** Human-readable name for this evaluator (appears in reports) */
  abstract readonly name: string;

  /** Maximum possible score from this evaluator */
  abstract readonly maxScore: number;

  /**
   * Evaluates a conversation turn and returns a scored result.
   * Must not throw — catch all errors internally and return a low-score result.
   */
  abstract evaluate(turn: ConversationTurn): Promise<EvaluationResult>;

  /**
   * Helper to build a standard EvaluationResult.
   */
  protected buildResult(
    score: number,
    reasoning: string,
    passed: boolean,
    details?: Record<string, unknown>
  ): EvaluationResult {
    return {
      evaluatorName: this.name,
      score,
      maxScore: this.maxScore,
      passed,
      reasoning,
      details,
    };
  }
}
