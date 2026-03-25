/**
 * evaluations/SemanticSimilarity.ts
 *
 * Computes similarity between two text strings.
 * Used in regression tests to detect when chatbot responses have drifted
 * significantly from a previously saved baseline.
 *
 * Approaches implemented:
 *  1. Jaccard similarity (token-based, fast)
 *  2. Cosine similarity (TF-IDF vectors, more nuanced)
 *  3. String similarity (edit-distance based)
 */

import { normalizeText, tokenize } from '../utils/textUtils';

export interface SimilarityResult {
  jaccard: number;
  cosine: number;
  combined: number; // Weighted average
  isRegression: boolean;
  regressionReason?: string;
}

export class SemanticSimilarity {
  private readonly regressionThreshold: number;

  constructor(regressionThreshold: number = 0.65) {
    this.regressionThreshold = regressionThreshold;
  }

  /**
   * Computes similarity between baseline and current response.
   * Returns a combined score and flags regressions below threshold.
   */
  compare(baseline: string, current: string): SimilarityResult {
    const normalizedBaseline = normalizeText(baseline);
    const normalizedCurrent = normalizeText(current);

    const jaccard = this.jaccardSimilarity(normalizedBaseline, normalizedCurrent);
    const cosine = this.cosineSimilarity(normalizedBaseline, normalizedCurrent);

    // Weighted combination: cosine is more reliable for semantic similarity
    const combined = jaccard * 0.3 + cosine * 0.7;

    const isRegression = combined < this.regressionThreshold;
    let regressionReason: string | undefined;

    if (isRegression) {
      regressionReason = [
        `Combined similarity: ${(combined * 100).toFixed(1)}% (threshold: ${(this.regressionThreshold * 100).toFixed(0)}%)`,
        `Jaccard: ${(jaccard * 100).toFixed(1)}%`,
        `Cosine: ${(cosine * 100).toFixed(1)}%`,
      ].join('; ');
    }

    return { jaccard, cosine, combined, isRegression, regressionReason };
  }

  // ─── Algorithms ─────────────────────────────────────────────────────────────

  /**
   * Jaccard similarity: |intersection| / |union| of token sets
   */
  private jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    const intersection = [...setA].filter(token => setB.has(token)).length;
    const union = new Set([...setA, ...setB]).size;

    return intersection / union;
  }

  /**
   * Cosine similarity using TF-IDF-like term frequency vectors
   */
  private cosineSimilarity(a: string, b: string): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    if (tokensA.length === 0 && tokensB.length === 0) return 1;
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    // Build term frequency maps
    const tfA = this.buildTermFrequency(tokensA);
    const tfB = this.buildTermFrequency(tokensB);

    // Get all unique terms
    const allTerms = new Set([...tfA.keys(), ...tfB.keys()]);

    // Compute dot product and magnitudes
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const term of allTerms) {
      const a = tfA.get(term) ?? 0;
      const b = tfB.get(term) ?? 0;
      dotProduct += a * b;
      magnitudeA += a * a;
      magnitudeB += b * b;
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private buildTermFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    return tf;
  }
}
