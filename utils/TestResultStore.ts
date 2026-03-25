/**
 * utils/TestResultStore.ts
 *
 * Accumulates evaluation results during test execution and persists them
 * so the ChatbotReporter can include per-test evaluation data in the final report.
 */

import fs from 'fs';
import path from 'path';
import { TurnEvaluation } from '../core/types';
import { FrameworkConfig } from '../config/framework.config';

export class TestResultStore {
  private readonly outputDir: string;
  private readonly buffer: Array<{ category: string; evaluation: TurnEvaluation }> = [];

  constructor() {
    this.outputDir = path.join(FrameworkConfig.reporting.outputDir, 'evaluations');
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  async save(category: string, evaluation: TurnEvaluation): Promise<void> {
    this.buffer.push({ category, evaluation });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const timestamp = Date.now();
    const filePath = path.join(this.outputDir, `eval-${timestamp}.json`);

    fs.writeFileSync(filePath, JSON.stringify(this.buffer, null, 2));
    this.buffer.length = 0; // Clear buffer
  }
}
