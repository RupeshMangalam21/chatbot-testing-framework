/**
 * evaluations/RelevanceEvaluator.ts
 *
 * Scores how relevant the bot's response is to the user's prompt.
 *
 * Scoring approach (0–5):
 *  5 — Response directly and fully addresses the prompt
 *  4 — Response addresses the prompt but includes unnecessary tangents
 *  3 — Response is partially relevant; misses some key aspects
 *  2 — Response is tangentially related
 *  1 — Response barely addresses the prompt
 *  0 — Response is completely off-topic
 *
 * Heuristics used:
 *  - Keyword overlap between prompt and response
 *  - Presence of expected intent keywords
 *  - Response length relative to prompt complexity
 *  - Whether the response contains a question (clarification = partial relevance)
 */

import { ConversationTurn, EvaluationResult } from '../core/types';
import { BaseEvaluator } from './BaseEvaluator';
import { FrameworkConfig } from '../config/framework.config';
import { tokenize, normalizeText } from '../utils/textUtils';

export class RelevanceEvaluator extends BaseEvaluator {
  readonly name = 'RelevanceEvaluator';
  readonly maxScore = 5;

  async evaluate(turn: ConversationTurn): Promise<EvaluationResult> {
    const { prompt, botResponse } = turn;

    if (!botResponse || botResponse.trim().length === 0) {
      return this.buildResult(0, 'Bot returned an empty response.', false);
    }

    let score = 0;
    const reasons: string[] = [];

    const normalizedPrompt = normalizeText(prompt.prompt);
    const normalizedResponse = normalizeText(botResponse);

    // ── 1. Expected keyword presence (0–2 points) ────────────────────────────
    const keywordsFound = prompt.expectedKeywords.filter(kw =>
      normalizedResponse.includes(normalizeText(kw))
    );
    const keywordCoverage = prompt.expectedKeywords.length > 0
      ? keywordsFound.length / prompt.expectedKeywords.length
      : 0.5; // No expected keywords = neutral

    const keywordScore = Math.round(keywordCoverage * 2);
    score += keywordScore;
    reasons.push(
      `Keywords: ${keywordsFound.length}/${prompt.expectedKeywords.length} found (+${keywordScore})`
    );

    // ── 2. Token overlap between prompt and response (0–2 points) ────────────
    const promptTokens = new Set(tokenize(normalizedPrompt));
    const responseTokens = new Set(tokenize(normalizedResponse));
    const overlapCount = [...promptTokens].filter(t => responseTokens.has(t)).length;
    const overlapRatio = promptTokens.size > 0 ? overlapCount / promptTokens.size : 0;

    const overlapScore = overlapRatio > 0.3 ? 2 : overlapRatio > 0.15 ? 1 : 0;
    score += overlapScore;
    reasons.push(`Token overlap: ${(overlapRatio * 100).toFixed(0)}% (+${overlapScore})`);

    // ── 3. Expected intent mention (0–1 point) ────────────────────────────────
    const intentTerms = prompt.expectedIntent.toLowerCase().split(/\s+/);
    const intentFound = intentTerms.some(term => normalizedResponse.includes(term));
    if (intentFound) {
      score += 1;
      reasons.push(`Intent "${prompt.expectedIntent}" detected in response (+1)`);
    } else {
      reasons.push(`Intent "${prompt.expectedIntent}" NOT detected in response (+0)`);
    }

    // ── Cap at maxScore ───────────────────────────────────────────────────────
    score = Math.min(score, this.maxScore);

    const passed = score >= FrameworkConfig.scoring.relevance.passingThreshold;

    return this.buildResult(
      score,
      reasons.join('; '),
      passed,
      {
        keywordCoverage: keywordCoverage.toFixed(2),
        tokenOverlap: overlapRatio.toFixed(2),
        keywordsFound,
        keywordsMissed: prompt.expectedKeywords.filter(kw =>
          !normalizedResponse.includes(normalizeText(kw))
        ),
      }
    );
  }
}
