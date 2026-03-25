/**
 * scripts/generate-report.ts
 *
 * Standalone report generator — aggregates all evaluation JSON files
 * produced during a test run and generates a unified HTML + JSON report.
 *
 * Run: npm run chatbot:report
 */

import fs from 'fs';
import path from 'path';
import { TurnEvaluation, ChatbotQualityReport, ReportSummary } from '../core/types';
import { FrameworkConfig } from '../config/framework.config';
import { generateHTMLReport } from '../reporters/HTMLReportTemplate';
import { calculateGrade, calculatePercentile } from '../utils/helpers';

const EVAL_DIR = path.join(FrameworkConfig.reporting.outputDir, 'evaluations');
const OUTPUT_DIR = FrameworkConfig.reporting.outputDir;
const REPORT_NAME = `chatbot-report-${new Date().toISOString().split('T')[0]}`;

async function generateReport(): Promise<void> {
  console.log(`\n📊 Generating Chatbot Quality Report...`);

  if (!fs.existsSync(EVAL_DIR)) {
    console.log(`  No evaluation data found at ${EVAL_DIR}`);
    console.log(`  Run "npm run chatbot:test" first.\n`);
    return;
  }

  // Load all evaluation files
  const evalFiles = fs.readdirSync(EVAL_DIR).filter(f => f.endsWith('.json'));
  console.log(`  Found ${evalFiles.length} evaluation files`);

  const allEvaluations: TurnEvaluation[] = [];

  for (const file of evalFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, file), 'utf-8'));
      if (Array.isArray(data)) {
        allEvaluations.push(...data.map((d: { evaluation: TurnEvaluation }) => d.evaluation));
      }
    } catch {
      // Skip malformed files
    }
  }

  console.log(`  Processing ${allEvaluations.length} evaluations...`);

  // Build summary
  const latencies = allEvaluations.map(e => e.turn.latencyMs);
  const relevanceScores = allEvaluations
    .flatMap(e => e.evaluations)
    .filter(ev => ev.evaluatorName === 'RelevanceEvaluator')
    .map(ev => ev.score);

  const safetyViolations = allEvaluations
    .flatMap(e => e.evaluations)
    .filter(ev => ev.evaluatorName === 'SafetyEvaluator' && !ev.passed).length;

  const hallucinationFlags = allEvaluations
    .flatMap(e => e.evaluations)
    .filter(ev => ev.evaluatorName === 'HallucinationDetector' && !ev.passed).length;

  const passed = allEvaluations.filter(e => e.passed).length;
  const total = allEvaluations.length;

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const summary: ReportSummary = {
    totalTests: total,
    passed,
    failed: total - passed,
    skipped: 0,
    passRate: total > 0 ? passed / total : 0,
    avgRelevanceScore: avg(relevanceScores),
    avgCorrectnessScore: 0,
    avgCompletenessScore: 0,
    avgLatencyMs: avg(latencies),
    p95LatencyMs: calculatePercentile(latencies, 95),
    safetyViolations,
    hallucinationFlags,
    regressionFlags: 0,
    totalEvaluations: allEvaluations.flatMap(e => e.evaluations).length,
  };

  const report: ChatbotQualityReport = {
    runId: `report-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'test',
    appUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    summary,
    categoryBreakdown: [],
    testResults: [],
    qualityGateResults: [],
    overallGrade: calculateGrade(summary),
  };

  // Save reports
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonPath = path.join(OUTPUT_DIR, `${REPORT_NAME}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const htmlPath = path.join(OUTPUT_DIR, `${REPORT_NAME}.html`);
  fs.writeFileSync(htmlPath, generateHTMLReport(report));

  console.log(`\n  ✅ JSON: ${jsonPath}`);
  console.log(`  ✅ HTML: ${htmlPath}`);
  console.log(`\n  📈 Summary:`);
  console.log(`     Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
  console.log(`     Avg Relevance: ${summary.avgRelevanceScore.toFixed(2)}/5`);
  console.log(`     Avg Latency: ${summary.avgLatencyMs.toFixed(0)}ms`);
  console.log(`     Safety Violations: ${summary.safetyViolations}`);
  console.log(`     Overall Grade: ${report.overallGrade}\n`);
}

generateReport().catch(err => {
  console.error('Report generation failed:', err);
  process.exit(1);
});
