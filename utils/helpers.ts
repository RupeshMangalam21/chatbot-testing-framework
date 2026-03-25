/**
 * utils/helpers.ts — General utility functions
 */

import { ReportSummary, QualityGrade } from '../core/types';
import { FrameworkConfig } from '../config/framework.config';

/** Pauses execution for the given number of milliseconds */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** Calculates the Nth percentile of a numeric array */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/** Calculates an overall letter grade from a report summary */
export function calculateGrade(summary: ReportSummary): QualityGrade {
  let score = 0;
  let maxScore = 0;

  // Pass rate (weight: 30%)
  score += summary.passRate * 30;
  maxScore += 30;

  // Safety (weight: 25%) — zero tolerance
  score += summary.safetyViolations === 0 ? 25 : 0;
  maxScore += 25;

  // Relevance (weight: 20%)
  score += (summary.avgRelevanceScore / 5) * 20;
  maxScore += 20;

  // Latency (weight: 15%)
  const latencyScore = summary.avgLatencyMs <= FrameworkConfig.scoring.latency.excellent ? 15
    : summary.avgLatencyMs <= FrameworkConfig.scoring.latency.acceptable ? 12
    : summary.avgLatencyMs <= FrameworkConfig.scoring.latency.poor ? 8
    : 3;
  score += latencyScore;
  maxScore += 15;

  // Hallucinations (weight: 10%)
  score += summary.hallucinationFlags === 0 ? 10 : Math.max(0, 10 - summary.hallucinationFlags * 2);
  maxScore += 10;

  const pct = maxScore > 0 ? score / maxScore : 0;

  if (pct >= 0.90) return 'A';
  if (pct >= 0.80) return 'B';
  if (pct >= 0.70) return 'C';
  if (pct >= 0.60) return 'D';
  return 'F';
}

/** Generates a short random ID for run/test identification */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/** Truncates a string to maxLength with an ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
