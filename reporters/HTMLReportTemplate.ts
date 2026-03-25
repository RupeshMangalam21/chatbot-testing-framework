/**
 * reporters/HTMLReportTemplate.ts
 *
 * Generates a professional HTML chatbot quality report.
 */

import { ChatbotQualityReport, QualityGrade } from '../core/types';

const GRADE_COLORS: Record<QualityGrade, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

export function generateHTMLReport(report: ChatbotQualityReport): string {
  const s = report.summary;
  const gradeColor = GRADE_COLORS[report.overallGrade];
  const passRatePct = (s.passRate * 100).toFixed(1);

  const categoryRows = report.categoryBreakdown
    .map(cat => `
      <tr>
        <td>${cat.category}</td>
        <td>${cat.totalTests}</td>
        <td>${(cat.passRate * 100).toFixed(1)}%</td>
        <td>${cat.avgScore.toFixed(2)}</td>
        <td>${cat.avgLatencyMs.toFixed(0)}ms</td>
      </tr>`)
    .join('');

  const gateRows = report.qualityGateResults
    .map(gate => `
      <tr class="${gate.passed ? 'gate-pass' : 'gate-fail'}">
        <td>${gate.gate}</td>
        <td>${gate.threshold}</td>
        <td>${gate.actual}</td>
        <td>${gate.passed ? '✅ PASS' : '❌ FAIL'}</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatbot Quality Report — ${report.generatedAt.split('T')[0]}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 48px 40px; border-bottom: 1px solid #334155; }
    .header h1 { font-size: 28px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    .header .meta { color: #94a3b8; font-size: 14px; }
    .grade-badge { display: inline-block; width: 80px; height: 80px; border-radius: 50%; font-size: 36px; font-weight: 900; line-height: 80px; text-align: center; color: white; background: ${gradeColor}; box-shadow: 0 0 30px ${gradeColor}40; float: right; margin-top: -10px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
    .card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 8px; }
    .card .value { font-size: 32px; font-weight: 700; color: #f8fafc; }
    .card .value.success { color: #22c55e; }
    .card .value.warning { color: #eab308; }
    .card .value.danger { color: #ef4444; }
    .section { margin-bottom: 40px; }
    .section h2 { font-size: 20px; font-weight: 600; color: #f8fafc; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #334155; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }
    th { background: #0f172a; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
    td { padding: 12px 16px; border-bottom: 1px solid #334155; font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .gate-pass td:last-child { color: #22c55e; }
    .gate-fail td:last-child { color: #ef4444; font-weight: 600; }
    .progress-bar { height: 8px; border-radius: 4px; background: #334155; margin-top: 4px; }
    .progress-fill { height: 100%; border-radius: 4px; background: ${parseFloat(passRatePct) >= 80 ? '#22c55e' : parseFloat(passRatePct) >= 60 ? '#eab308' : '#ef4444'}; width: ${passRatePct}%; }
    .footer { text-align: center; padding: 24px; color: #475569; font-size: 13px; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="header">
    <div style="max-width:1200px; margin:0 auto; position:relative;">
      <div class="grade-badge">${report.overallGrade}</div>
      <h1>🤖 Chatbot Quality Report</h1>
      <div class="meta">
        Generated: ${new Date(report.generatedAt).toLocaleString()} &nbsp;|&nbsp;
        Environment: ${report.environment} &nbsp;|&nbsp;
        App: ${report.appUrl} &nbsp;|&nbsp;
        Run ID: ${report.runId}
      </div>
    </div>
  </div>

  <div class="container">

    <!-- Summary Cards -->
    <div class="grid">
      <div class="card">
        <div class="label">Total Tests</div>
        <div class="value">${s.totalTests}</div>
      </div>
      <div class="card">
        <div class="label">Pass Rate</div>
        <div class="value ${parseFloat(passRatePct) >= 80 ? 'success' : parseFloat(passRatePct) >= 60 ? 'warning' : 'danger'}">${passRatePct}%</div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
      </div>
      <div class="card">
        <div class="label">Avg Relevance</div>
        <div class="value ${s.avgRelevanceScore >= 3 ? 'success' : 'warning'}">${s.avgRelevanceScore.toFixed(1)}/5</div>
      </div>
      <div class="card">
        <div class="label">Avg Latency</div>
        <div class="value ${s.avgLatencyMs <= 8000 ? 'success' : 'warning'}">${(s.avgLatencyMs / 1000).toFixed(1)}s</div>
      </div>
      <div class="card">
        <div class="label">Safety Violations</div>
        <div class="value ${s.safetyViolations === 0 ? 'success' : 'danger'}">${s.safetyViolations}</div>
      </div>
      <div class="card">
        <div class="label">Hallucination Flags</div>
        <div class="value ${s.hallucinationFlags === 0 ? 'success' : 'warning'}">${s.hallucinationFlags}</div>
      </div>
    </div>

    <!-- Quality Gates -->
    <div class="section">
      <h2>Quality Gates</h2>
      <table>
        <thead><tr><th>Gate</th><th>Threshold</th><th>Actual</th><th>Status</th></tr></thead>
        <tbody>${gateRows}</tbody>
      </table>
    </div>

    <!-- Category Breakdown -->
    ${categoryRows ? `
    <div class="section">
      <h2>Category Breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th>Tests</th><th>Pass Rate</th><th>Avg Score</th><th>Avg Latency</th></tr></thead>
        <tbody>${categoryRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Stats -->
    <div class="section">
      <h2>Latency Statistics</h2>
      <div class="grid">
        <div class="card">
          <div class="label">P50 Latency</div>
          <div class="value">${(s.avgLatencyMs / 1000).toFixed(1)}s</div>
        </div>
        <div class="card">
          <div class="label">P95 Latency</div>
          <div class="value ${s.p95LatencyMs <= 15000 ? 'success' : 'danger'}">${(s.p95LatencyMs / 1000).toFixed(1)}s</div>
        </div>
        <div class="card">
          <div class="label">Tests Passed</div>
          <div class="value success">${s.passed}</div>
        </div>
        <div class="card">
          <div class="label">Tests Failed</div>
          <div class="value ${s.failed === 0 ? 'success' : 'danger'}">${s.failed}</div>
        </div>
      </div>
    </div>

  </div>

  <div class="footer">
    Generated by Chatbot Testing Framework &nbsp;|&nbsp; Playwright + TypeScript
  </div>
</body>
</html>`;
}
