/**
 * evaluations/EvaluationEngine.ts
 *
 * Orchestrates all evaluators and produces a complete TurnEvaluation.
 *
 * Usage:
 *   const engine = new EvaluationEngine();
 *   const evaluation = await engine.evaluate(turn);
 */

import {
  ConversationTurn,
  TurnEvaluation,
  EvaluationFlag,
  EvaluationResult,
} from '../core/types';
import { BaseEvaluator } from './BaseEvaluator';
import { RelevanceEvaluator } from './RelevanceEvaluator';
import { SafetyEvaluator } from './SafetyEvaluator';
import { LatencyEvaluator } from './LatencyEvaluator';
import { ResponseQualityEvaluator } from './ResponseQualityEvaluator';
import { HallucinationDetector } from './HallucinationDetector';
import { LLMJudge } from './LLMJudge';
import { FrameworkConfig } from '../config/framework.config';
import { Logger } from '../utils/Logger';

export class EvaluationEngine {
  private readonly evaluators: BaseEvaluator[];
  private readonly logger: Logger;
  private readonly llmJudge: LLMJudge | null;

  constructor() {
    this.logger = new Logger('EvaluationEngine');

    // Register all evaluators
    this.evaluators = [
      new RelevanceEvaluator(),
      new ResponseQualityEvaluator(),
      new SafetyEvaluator(),
      new LatencyEvaluator(),
      new HallucinationDetector(),
    ];

    // Optional LLM judge
    this.llmJudge = FrameworkConfig.llmJudge.enabled ? new LLMJudge() : null;

    this.logger.info(
      `Initialized with ${this.evaluators.length} evaluators` +
      (this.llmJudge ? ' + LLM judge' : '')
    );
  }

  /**
   * Runs all evaluators on a conversation turn and returns a complete evaluation.
   */
  async evaluate(turn: ConversationTurn): Promise<TurnEvaluation> {
    this.logger.debug(`Evaluating turn: "${turn.userMessage.substring(0, 60)}..."`);

    const evaluationResults: EvaluationResult[] = [];

    // Run all evaluators in parallel for speed
    const evaluatorPromises = this.evaluators.map(async (evaluator) => {
      try {
        return await evaluator.evaluate(turn);
      } catch (err) {
        this.logger.warn(`Evaluator ${evaluator.name} threw an error: ${err}`);
        // Return a neutral result rather than crashing the whole evaluation
        return {
          evaluatorName: evaluator.name,
          score: 0,
          maxScore: evaluator.maxScore,
          passed: false,
          reasoning: `Evaluator error: ${err}`,
        } as EvaluationResult;
      }
    });

    const results = await Promise.all(evaluatorPromises);
    evaluationResults.push(...results);

    // Run LLM judge if enabled
    if (this.llmJudge) {
      try {
        const llmResults = await this.llmJudge.evaluate(turn);
        evaluationResults.push(...llmResults);
      } catch (err) {
        this.logger.warn(`LLM judge failed: ${err}`);
      }
    }

    // Calculate aggregate scores
    const totalScore = evaluationResults.reduce((sum, r) => sum + r.score, 0);
    const totalMaxScore = evaluationResults.reduce((sum, r) => sum + r.maxScore, 0);
    const allPassed = evaluationResults.every(r => r.passed);

    // Generate flags for issues
    const flags = this.generateFlags(turn, evaluationResults);

    return {
      turn,
      evaluations: evaluationResults,
      overallScore: totalScore,
      overallMaxScore: totalMaxScore,
      passed: allPassed,
      flags,
    };
  }

  /**
   * Evaluates multiple turns and returns all evaluations.
   */
  async evaluateAll(turns: ConversationTurn[]): Promise<TurnEvaluation[]> {
    return Promise.all(turns.map(t => this.evaluate(t)));
  }

  /**
   * Generates flags from evaluation results for reporting.
   */
  private generateFlags(
    turn: ConversationTurn,
    results: EvaluationResult[]
  ): EvaluationFlag[] {
    const flags: EvaluationFlag[] = [];

    for (const result of results) {
      if (!result.passed) {
        if (result.evaluatorName === 'SafetyEvaluator') {
          flags.push({
            severity: 'critical',
            type: 'safety',
            message: `Safety violation: ${result.reasoning}`,
          });
        } else if (result.evaluatorName === 'HallucinationDetector') {
          flags.push({
            severity: 'high',
            type: 'hallucination',
            message: `Hallucination risk: ${result.reasoning}`,
          });
        } else if (result.evaluatorName === 'LatencyEvaluator') {
          flags.push({
            severity: turn.latencyMs > FrameworkConfig.scoring.latency.failing ? 'high' : 'medium',
            type: 'latency',
            message: `Slow response: ${turn.latencyMs}ms`,
          });
        } else if (result.evaluatorName === 'RelevanceEvaluator') {
          flags.push({
            severity: result.score === 0 ? 'high' : 'medium',
            type: 'relevance',
            message: `Low relevance score: ${result.score}/${result.maxScore}`,
          });
        }
      }
    }

    return flags;
  }
}
