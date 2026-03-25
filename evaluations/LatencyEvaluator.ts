/**
 * evaluations/LatencyEvaluator.ts
 */

import { ConversationTurn, EvaluationResult } from '../core/types';
import { BaseEvaluator } from './BaseEvaluator';
import { FrameworkConfig } from '../config/framework.config';

export class LatencyEvaluator extends BaseEvaluator {
  readonly name = 'LatencyEvaluator';
  readonly maxScore = 5;

  async evaluate(turn: ConversationTurn): Promise<EvaluationResult> {
    const { latencyMs, prompt } = turn;
    const thresholds = FrameworkConfig.scoring.latency;

    // Use prompt-specific threshold if defined, else global
    const failingThreshold = prompt.maxLatencyMs ?? thresholds.failing;

    let score: number;
    let grade: string;

    if (latencyMs <= thresholds.excellent) {
      score = 5;
      grade = 'excellent';
    } else if (latencyMs <= thresholds.acceptable) {
      score = 4;
      grade = 'acceptable';
    } else if (latencyMs <= thresholds.poor) {
      score = 2;
      grade = 'poor';
    } else if (latencyMs <= failingThreshold) {
      score = 1;
      grade = 'very poor';
    } else {
      score = 0;
      grade = 'failing (timeout)';
    }

    const passed = latencyMs <= (prompt.maxLatencyMs ?? thresholds.poor);

    return this.buildResult(
      score,
      `Response latency: ${latencyMs}ms (${grade})`,
      passed,
      {
        latencyMs,
        grade,
        thresholds: {
          excellent: thresholds.excellent,
          acceptable: thresholds.acceptable,
          poor: thresholds.poor,
          failing: failingThreshold,
        },
      }
    );
  }
}
