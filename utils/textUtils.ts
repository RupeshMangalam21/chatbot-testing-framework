/**
 * utils/textUtils.ts — Text processing utilities for evaluators
 */

// Common English stop words to exclude from similarity calculations
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its',
  'our', 'their', 'what', 'which', 'who', 'how', 'when', 'where', 'why',
  'not', 'no', 'so', 'if', 'then', 'than', 'more', 'also', 'just', 'up',
]);

/**
 * Normalizes text for comparison:
 * - Lowercase
 * - Removes punctuation (except apostrophes in contractions)
 * - Trims whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes normalized text into meaningful terms.
 * Removes stop words and very short tokens.
 */
export function tokenize(text: string, removeStopWords: boolean = true): string[] {
  const tokens = text.split(/\s+/).filter(t => t.length >= 2);

  if (!removeStopWords) return tokens;

  return tokens.filter(t => !STOP_WORDS.has(t));
}

/**
 * Counts occurrences of each token in a text.
 */
export function countTermFrequency(text: string): Map<string, number> {
  const tokens = tokenize(normalizeText(text));
  const freq = new Map<string, number>();

  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  return freq;
}

/**
 * Checks if any of the given patterns appear in the text.
 */
export function containsAny(text: string, patterns: RegExp[]): boolean {
  const normalized = normalizeText(text);
  return patterns.some(p => p.test(normalized));
}

/**
 * Returns the percentage of keywords found in the text.
 */
export function keywordCoverage(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const normalizedText = normalizeText(text);
  const found = keywords.filter(kw => normalizedText.includes(normalizeText(kw)));
  return found.length / keywords.length;
}
