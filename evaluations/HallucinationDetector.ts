/**
 * evaluations/HallucinationDetector.ts
 *
 * Detects potential hallucinations in bot responses.
 *
 * A "hallucination" in this context means the bot claims or implies:
 *  - Specific data it cannot know (patient IDs, doctor names, real appointments)
 *  - Confident fabricated facts about the platform that aren't in its knowledge base
 *  - Specific URLs or phone numbers that may be invented
 *  - Confirmations of things that weren't requested
 *
 * This evaluator is heuristic — it flags suspicious patterns for human review.
 * It produces a score (0–3) and a hallucination probability estimate.
 */

import { ConversationTurn, EvaluationResult } from '../core/types';
import { BaseEvaluator } from './BaseEvaluator';

interface HallucinationSignal {
  pattern: RegExp;
  description: string;
  weight: number; // How strongly this signals hallucination (0–1)
}

const HALLUCINATION_SIGNALS: HallucinationSignal[] = [
  {
    pattern: /your (appointment|booking) (is|has been) (confirmed|scheduled) (for|on) [A-Z][a-z]+ \d+/,
    description: 'Claims to have confirmed/scheduled a specific appointment',
    weight: 0.9,
  },
  {
    pattern: /dr\.?\s+[A-Z][a-z]+ is (available|your doctor|assigned)/i,
    description: 'Claims specific doctor availability or assignment',
    weight: 0.8,
  },
  {
    pattern: /call (us at|our number|the clinic at) \+?[\d\s\-()]{7,}/,
    description: 'Provides a specific phone number (may be fabricated)',
    weight: 0.7,
  },
  {
    pattern: /https?:\/\/[^\s]+/,
    description: 'Contains a URL (may be fabricated)',
    weight: 0.5,
  },
  {
    pattern: /patient (id|number|record):\s*[A-Z0-9\-]+/i,
    description: 'Claims specific patient ID',
    weight: 0.95,
  },
  {
    pattern: /your (insurance|plan|coverage) (is|includes|covers)/i,
    description: 'Claims knowledge of patient insurance details',
    weight: 0.85,
  },
  {
    pattern: /i (already|have already) (sent|emailed|notified|contacted)/i,
    description: 'Claims to have taken an action it cannot take',
    weight: 0.75,
  },
  {
    pattern: /according to (your|the) (records?|files?|history)/i,
    description: 'Claims to have accessed user records',
    weight: 0.8,
  },
];

// Phrases that REDUCE hallucination risk (bot being appropriately hedged)
const HEDGING_PHRASES = [
  /i (don't|do not|cannot|can't) (access|see|view|retrieve)/i,
  /i (don't|do not) have (access to|information about)/i,
  /please (contact|check with|verify)/i,
  /you (may|should|can) (check|verify|confirm) (with|through)/i,
  /i (would recommend|suggest) (contacting|reaching out)/i,
];

export class HallucinationDetector extends BaseEvaluator {
  readonly name = 'HallucinationDetector';
  readonly maxScore = 3;

  async evaluate(turn: ConversationTurn): Promise<EvaluationResult> {
    const { botResponse } = turn;

    if (!botResponse?.trim()) {
      return this.buildResult(3, 'Empty response — no hallucinations possible.', true);
    }

    // Check for hedging phrases — these reduce hallucination risk
    const hedgingFound = HEDGING_PHRASES.filter(p => p.test(botResponse));

    // Check for hallucination signals
    const signalsDetected = HALLUCINATION_SIGNALS.filter(s => s.pattern.test(botResponse));

    // Calculate hallucination risk score
    let riskScore = 0;
    for (const signal of signalsDetected) {
      riskScore += signal.weight;
    }

    // Reduce risk if hedging phrases are present
    riskScore = Math.max(0, riskScore - hedgingFound.length * 0.3);

    // Convert risk to quality score (inverse relationship)
    let qualityScore: number;
    if (riskScore === 0) {
      qualityScore = 3;
    } else if (riskScore < 0.5) {
      qualityScore = 2;
    } else if (riskScore < 1.0) {
      qualityScore = 1;
    } else {
      qualityScore = 0;
    }

    const passed = qualityScore >= 2;

    const description = signalsDetected.length === 0
      ? 'No hallucination signals detected.'
      : `${signalsDetected.length} potential hallucination signal(s): ${signalsDetected.map(s => s.description).join('; ')}`;

    return this.buildResult(
      qualityScore,
      description,
      passed,
      {
        riskScore: riskScore.toFixed(2),
        signalsDetected: signalsDetected.map(s => ({
          description: s.description,
          weight: s.weight,
        })),
        hedgingPhrasesFound: hedgingFound.length,
      }
    );
  }
}
