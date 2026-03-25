/**
 * evaluations/ResponseQualityEvaluator.ts
 *
 * Scores the overall quality of the bot response (0–5) based on:
 *  - Response length (not too short, not excessively long)
 *  - Linguistic coherence (no garbled text)
 *  - Presence of actionable content
 *  - Appropriate tone (healthcare context)
 *  - Absence of placeholder/error text
 */

import { ConversationTurn, EvaluationResult } from '../core/types';
import { BaseEvaluator } from './BaseEvaluator';
import { FrameworkConfig } from '../config/framework.config';
import { normalizeText } from '../utils/textUtils';

export class ResponseQualityEvaluator extends BaseEvaluator {
  readonly name = 'ResponseQualityEvaluator';
  readonly maxScore = 5;

  // Patterns that indicate poor/broken responses
  private readonly BAD_RESPONSE_PATTERNS = [
    /undefined|null|NaN/,               // JavaScript errors leaked
    /\[object Object\]/,                 // Serialization failures
    /error:? \d{3}/i,                    // HTTP error codes
    /internal server error/i,            // Server errors
    /something went wrong/i,             // Generic error
    /<[^>]+>/,                          // Raw HTML tags (shouldn't appear in chat)
    /^\.{1,3}$/,                         // Just ellipsis
    /^(ok|okay|yes|no|sure)\.?$/i,      // One-word non-answers
  ];

  // Phrases suggesting actionable/helpful content
  private readonly HELPFUL_PATTERNS = [
    /you can|to (book|schedule|cancel|reschedule)/i,
    /please (visit|go to|click|navigate|select)/i,
    /follow these steps/i,
    /here('s| is| are)/i,
    /contact|reach out|support/i,
    /your (appointment|doctor|account)/i,
  ];

  async evaluate(turn: ConversationTurn): Promise<EvaluationResult> {
    const { botResponse } = turn;
    const normalized = normalizeText(botResponse);

    if (!botResponse || botResponse.trim().length === 0) {
      return this.buildResult(0, 'Empty response.', false);
    }

    let score = 0;
    const reasons: string[] = [];

    // ── 1. Length check (0–1) ─────────────────────────────────────────────────
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 10 && wordCount <= 300) {
      score += 1;
      reasons.push(`Good length (${wordCount} words) (+1)`);
    } else if (wordCount < 5) {
      reasons.push(`Too short (${wordCount} words) (+0)`);
    } else if (wordCount > 500) {
      score += 0.5;
      reasons.push(`Very long response (${wordCount} words) (+0.5)`);
    } else {
      score += 0.5;
      reasons.push(`Acceptable length (${wordCount} words) (+0.5)`);
    }

    // ── 2. No bad patterns (0–1) ──────────────────────────────────────────────
    const badPatternsFound = this.BAD_RESPONSE_PATTERNS.filter(p => p.test(botResponse));
    if (badPatternsFound.length === 0) {
      score += 1;
      reasons.push('No error/placeholder patterns detected (+1)');
    } else {
      reasons.push(`Bad patterns found: ${badPatternsFound.length} (+0)`);
    }

    // ── 3. Helpful content (0–1) ──────────────────────────────────────────────
    const helpfulPatternsFound = this.HELPFUL_PATTERNS.filter(p => p.test(botResponse));
    if (helpfulPatternsFound.length >= 2) {
      score += 1;
      reasons.push('Multiple helpful action phrases (+1)');
    } else if (helpfulPatternsFound.length === 1) {
      score += 0.5;
      reasons.push('One helpful action phrase (+0.5)');
    } else {
      reasons.push('No clear actionable phrases (+0)');
    }

    // ── 4. Healthcare-appropriate tone (0–1) ─────────────────────────────────
    const inappropriatePatterns = [
      /\b(lol|wtf|omg|ngl)\b/i,
      /[!]{3,}/,                     // Excessive exclamation
      /\b(dumb|stupid|idiot)\b/i,    // Rude language
    ];
    const toneIssues = inappropriatePatterns.filter(p => p.test(botResponse));
    if (toneIssues.length === 0) {
      score += 1;
      reasons.push('Appropriate professional tone (+1)');
    } else {
      reasons.push(`Tone issues detected (+0)`);
    }

    // ── 5. Coherent sentences (0–1) ───────────────────────────────────────────
    const sentences = botResponse.split(/[.!?]+/).filter(s => s.trim().length > 3);
    const avgWordsPerSentence = wordCount / Math.max(sentences.length, 1);
    if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 40) {
      score += 1;
      reasons.push(`Coherent sentences (avg ${avgWordsPerSentence.toFixed(1)} words/sentence) (+1)`);
    } else {
      reasons.push(`Sentence structure concerns (avg ${avgWordsPerSentence.toFixed(1)} words/sentence) (+0)`);
    }

    score = Math.min(Math.round(score), this.maxScore);
    const passed = score >= FrameworkConfig.scoring.correctness.passingThreshold;

    return this.buildResult(score, reasons.join('; '), passed, {
      wordCount,
      sentenceCount: sentences.length,
      badPatternsFound: badPatternsFound.length,
      helpfulPatternsFound: helpfulPatternsFound.length,
    });
  }
}
