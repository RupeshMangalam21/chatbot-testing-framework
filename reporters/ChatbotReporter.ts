/**
 * reporters/ChatbotReporter.ts
 *
 * Custom Playwright reporter that generates a Chatbot Quality Report.
 *
 * Aggregates test results, computes quality scores, applies quality gates,
 * and exports both JSON and HTML reports.
 */

import {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  Suite,
} from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import {
  ChatbotQualityReport,
  ReportSummary,
  CategoryBreakdown,
  QualityGateResult,
  QualityGrade,
  PromptCategory,
} from '../core/types';
import { FrameworkConfig } from '../config/framework.config';
import { generateHTMLReport } from './HTMLReportTemplate';
import { calculateGrade } from '../utils/helpers';

interface ReporterOptions {
  outputDir?: string;
  reportName?: string;
}

interface AggregatedTestData {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  latencies: number[];
  relevanceScores: number[];
  correctnessScores: number[];
  completenessScores: number[];
  safetyViolations: number;
  hallucinationFlags: number;
  regressionFlags: number;
  categoryData: Map<string, { tests: number; passed: number; scores: number[]; latencies: number[] }>;
}

class ChatbotReporter implements Reporter {
  private readonly outputDir: string;
  private readonly reportName: string;
  private readonly data: AggregatedTestData;
  private readonly isListMode: boolean;
  private startTime: number = 0;
  private discoveredTestCount: number = 0;

  constructor(options: ReporterOptions = {}) {
    this.outputDir = options.outputDir || 'chatbot-reports';
    this.reportName = options.reportName || `chatbot-report-${Date.now()}`;
    this.isListMode = process.argv.includes('--list');
    this.data = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      latencies: [],
      relevanceScores: [],
      correctnessScores: [],
      completenessScores: [],
      safetyViolations: 0,
      hallucinationFlags: 0,
      regressionFlags: 0,
      categoryData: new Map(),
    };
  }

  onBegin(_config: unknown, suite: Suite): void {
    this.startTime = Date.now();
    const testCount = suite.allTests().length;
    this.discoveredTestCount = testCount;

    if (this.isListMode) {
      return;
    }
    console.log(`\n🤖 Chatbot Testing Framework`);
    console.log(`   Running ${testCount} tests...`);
    console.log(`   Reports will be saved to: ${this.outputDir}/\n`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {

    if (this.isListMode) {
      return;
    }
    this.data.totalTests++;

    if (result.status === 'passed') {
      this.data.passed++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      this.data.failed++;
    } else {
      this.data.skipped++;
    }

    // Extract metadata from test attachments (populated by TestResultStore)
    for (const attachment of result.attachments) {
      if (attachment.name === 'evaluation-data' && attachment.body) {
        try {
          this.processEvaluationAttachment(
            JSON.parse(attachment.body.toString()),
            test,
            result
          );
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Extract latency from test annotations
    const latencyAnnotation = test.annotations.find(a => a.type === 'latency');
    if (latencyAnnotation?.description) {
      const latency = parseInt(latencyAnnotation.description, 10);
      if (!isNaN(latency)) this.data.latencies.push(latency);
    }

    // Track safety failures from test title/description
    if (result.status === 'failed' && test.title.toLowerCase().includes('safety')) {
      this.data.safetyViolations++;
    }

    // Category tracking
    const category = this.extractCategory(test.title);
    if (!this.data.categoryData.has(category)) {
      this.data.categoryData.set(category, { tests: 0, passed: 0, scores: [], latencies: [] });
    }
    const catData = this.data.categoryData.get(category)!;
    catData.tests++;
    if (result.status === 'passed') catData.passed++;
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.isListMode) {
      return;
    }

    // When tests are only enumerated/discovered but never executed, skip report generation.
    if (this.data.totalTests === 0 && this.discoveredTestCount > 0 && result.status === 'passed') {
      return;
    }
    const durationMs = Date.now() - this.startTime;

    console.log(`\n📊 Generating Chatbot Quality Report...`);

    // Build the report
    const report = this.buildReport(result, durationMs);

    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Save JSON report
    const jsonPath = path.join(this.outputDir, `${this.reportName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`   ✅ JSON report: ${jsonPath}`);

    // Save HTML report
    const htmlPath = path.join(this.outputDir, `${this.reportName}.html`);
    const html = generateHTMLReport(report);
    fs.writeFileSync(htmlPath, html);
    console.log(`   ✅ HTML report: ${htmlPath}`);

    // Print summary to console
    this.printSummary(report);

    // Check quality gates
    this.checkQualityGates(report);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private processEvaluationAttachment(data: unknown, _test: TestCase, _result: TestResult): void {
    if (!data || typeof data !== 'object') return;
    const evalData = data as Record<string, unknown>;

    if (typeof evalData.latencyMs === 'number') {
      this.data.latencies.push(evalData.latencyMs);
    }

    const evaluations = evalData.evaluations as Array<{ evaluatorName: string; score: number; passed: boolean }> | undefined;
    if (Array.isArray(evaluations)) {
      for (const evaluation of evaluations) {
        if (evaluation.evaluatorName === 'RelevanceEvaluator') {
          this.data.relevanceScores.push(evaluation.score);
        } else if (evaluation.evaluatorName === 'ResponseQualityEvaluator') {
          this.data.correctnessScores.push(evaluation.score);
        } else if (evaluation.evaluatorName === 'SafetyEvaluator' && !evaluation.passed) {
          this.data.safetyViolations++;
        } else if (evaluation.evaluatorName === 'HallucinationDetector' && !evaluation.passed) {
          this.data.hallucinationFlags++;
        }
      }
    }
  }

  private buildReport(result: FullResult, durationMs: number): ChatbotQualityReport {
    const summary = this.buildSummary();
    const categoryBreakdown = this.buildCategoryBreakdown();
    const qualityGateResults = this.buildQualityGateResults(summary);
    const overallGrade = calculateGrade(summary);

    return {
      runId: `run-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'test',
      appUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
      summary,
      categoryBreakdown,
      testResults: [], // Populated by TestResultStore in full implementation
      qualityGateResults,
      overallGrade,
    };
  }

  private buildSummary(): ReportSummary {
    const passRate = this.data.totalTests > 0
      ? this.data.passed / this.data.totalTests
      : 0;

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const p95 = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.ceil(sorted.length * 0.95) - 1;
      return sorted[Math.max(0, idx)];
    };

    return {
      totalTests: this.data.totalTests,
      passed: this.data.passed,
      failed: this.data.failed,
      skipped: this.data.skipped,
      passRate,
      avgRelevanceScore: avg(this.data.relevanceScores),
      avgCorrectnessScore: avg(this.data.correctnessScores),
      avgCompletenessScore: avg(this.data.completenessScores),
      avgLatencyMs: avg(this.data.latencies),
      p95LatencyMs: p95(this.data.latencies),
      safetyViolations: this.data.safetyViolations,
      hallucinationFlags: this.data.hallucinationFlags,
      regressionFlags: this.data.regressionFlags,
      totalEvaluations:
        this.data.relevanceScores.length +
        this.data.correctnessScores.length,
    };
  }

  private buildCategoryBreakdown(): CategoryBreakdown[] {
    return Array.from(this.data.categoryData.entries()).map(([category, data]) => ({
      category: category as PromptCategory,
      totalTests: data.tests,
      passRate: data.tests > 0 ? data.passed / data.tests : 0,
      avgScore:
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0,
      avgLatencyMs:
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0,
    }));
  }

  private buildQualityGateResults(summary: ReportSummary): QualityGateResult[] {
    const gates = FrameworkConfig.qualityGates;

    return [
      {
        gate: 'Minimum Pass Rate',
        threshold: `${(gates.minPassRate * 100).toFixed(0)}%`,
        actual: `${(summary.passRate * 100).toFixed(1)}%`,
        passed: summary.passRate >= gates.minPassRate,
      },
      {
        gate: 'Average Relevance Score',
        threshold: gates.minAvgRelevanceScore,
        actual: summary.avgRelevanceScore.toFixed(2),
        passed: summary.avgRelevanceScore >= gates.minAvgRelevanceScore,
      },
      {
        gate: 'Safety Violations',
        threshold: 0,
        actual: summary.safetyViolations,
        passed: summary.safetyViolations === 0,
      },
      {
        gate: 'Average Latency',
        threshold: `${gates.maxAvgLatencyMs}ms`,
        actual: `${summary.avgLatencyMs.toFixed(0)}ms`,
        passed: summary.avgLatencyMs <= gates.maxAvgLatencyMs,
      },
    ];
  }

  private printSummary(report: ChatbotQualityReport): void {
    const s = report.summary;
    const gradeColor = {
      A: '\x1b[32m', B: '\x1b[32m', C: '\x1b[33m', D: '\x1b[31m', F: '\x1b[31m',
    }[report.overallGrade];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🤖 CHATBOT QUALITY REPORT`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Total Tests:         ${s.totalTests}`);
    console.log(`  Pass Rate:           ${(s.passRate * 100).toFixed(1)}% (${s.passed}/${s.totalTests})`);
    console.log(`  Avg Relevance:       ${s.avgRelevanceScore.toFixed(2)}/5`);
    console.log(`  Avg Latency:         ${s.avgLatencyMs.toFixed(0)}ms`);
    console.log(`  p95 Latency:         ${s.p95LatencyMs.toFixed(0)}ms`);
    console.log(`  Safety Violations:   ${s.safetyViolations}`);
    console.log(`  Hallucination Flags: ${s.hallucinationFlags}`);
    console.log(`  Overall Grade:       ${gradeColor}${report.overallGrade}\x1b[0m`);
    console.log(`${'═'.repeat(60)}\n`);

    // Quality gates summary
    console.log(`  Quality Gates:`);
    for (const gate of report.qualityGateResults) {
      const icon = gate.passed ? '✅' : '❌';
      console.log(`  ${icon} ${gate.gate}: ${gate.actual} (threshold: ${gate.threshold})`);
    }
    console.log('');
  }

  private checkQualityGates(report: ChatbotQualityReport): void {
    const failures = report.qualityGateResults.filter(g => !g.passed);

    if (failures.length > 0) {
      console.log(`\n⛔ QUALITY GATE FAILURES:`);
      for (const failure of failures) {
        console.log(`   - ${failure.gate}: ${failure.actual} (required: ${failure.threshold})`);
      }

      if (process.env.CI === 'true') {
        console.log(`\n💥 Build failing due to quality gate violations.\n`);
        process.exitCode = 1;
      }
    } else {
      console.log(`✅ All quality gates passed.\n`);
    }
  }

  private extractCategory(testTitle: string): string {
    if (testTitle.toLowerCase().includes('safety')) return 'safety';
    if (testTitle.toLowerCase().includes('latency')) return 'latency';
    if (testTitle.toLowerCase().includes('edge')) return 'edge-case';
    if (testTitle.toLowerCase().includes('regression')) return 'regression';
    if (testTitle.toLowerCase().includes('doctor')) return 'doctor-onboarding';
    if (testTitle.toLowerCase().includes('appointment')) return 'appointment';
    return 'general';
  }
}

export default ChatbotReporter;
