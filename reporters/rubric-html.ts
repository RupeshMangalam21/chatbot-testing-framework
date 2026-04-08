import fs from "fs";
import path from "path";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBand(score: number): "excellent" | "good" | "acceptable" | "poor" {
  if (score >= 4.5) return "excellent";
  if (score >= 3.5) return "good";
  if (score >= 2.5) return "acceptable";
  return "poor";
}

function buildCaseReason(r: any): string {
  const reasons: string[] = [];
  const dims = r?.dims || {};

  const lowDims = ["accuracy", "relevance", "completeness", "consistency", "safety"]
    .filter((k) => Number(dims[k] || 0) < 3);

  if (lowDims.length) {
    reasons.push(`Low dimensions: ${lowDims.join(", ")}`);
  }

  if ((r?.policy_violations || []).length > 0) {
    reasons.push(`Policy violations: ${(r.policy_violations as string[]).join("; ")}`);
  }

  if (!reasons.length) {
    reasons.push("Strong scores across dimensions with no policy issues.");
  }

  return reasons.join(" | ");
}

function bandLabel(score: number): string {
  const band = getBand(score);
  if (band === "excellent") return "Excellent";
  if (band === "good") return "Good";
  if (band === "acceptable") return "Acceptable";
  return "Poor";
}

function bandBadgeClass(band: "excellent" | "good" | "acceptable" | "poor"): string {
  if (band === "excellent") return "badge excellent";
  if (band === "good") return "badge good";
  if (band === "acceptable") return "badge acceptable";
  return "badge poor";
}

export function generateHtmlReport(jsonPath: string) {
  const outDir = path.resolve(process.cwd(), "chatbot-reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const results = Array.isArray(data.results) ? data.results : [];
  const totalCases = results.length;
  const withPolicyViolations = results.filter((r: any) => (r.policy_violations || []).length > 0).length;
  const manualReviewCases = results.filter((r: any) => !!r.manual_review).length;
  const violationRate = totalCases ? Math.round((withPolicyViolations / totalCases) * 100) : 0;

  const avgRubric = totalCases
    ? Math.round((results.reduce((sum: number, r: any) => sum + Number(r.rubric_score || 0), 0) / totalCases) * 100) / 100
    : 0;

  const avgDim = (key: "accuracy" | "relevance" | "completeness" | "consistency" | "safety") => {
    if (!totalCases) return 0;
    const value = results.reduce((sum: number, r: any) => sum + Number(r?.dims?.[key] || 0), 0) / totalCases;
    return Math.round(value * 100) / 100;
  };

  const scoreBuckets = {
    excellent: results.filter((r: any) => Number(r.rubric_score || 0) >= 4.5).length,
    good: results.filter((r: any) => Number(r.rubric_score || 0) >= 3.5 && Number(r.rubric_score || 0) < 4.5).length,
    acceptable: results.filter((r: any) => Number(r.rubric_score || 0) >= 2.5 && Number(r.rubric_score || 0) < 3.5).length,
    poor: results.filter((r: any) => Number(r.rubric_score || 0) < 2.5).length,
  };

  const passRate = totalCases
    ? Math.round((results.filter((r: any) => Number(r.rubric_score || 0) >= 3.5).length / totalCases) * 100)
    : 0;

  const dims = [
    { key: "accuracy", label: "Accuracy", value: avgDim("accuracy") },
    { key: "relevance", label: "Relevance", value: avgDim("relevance") },
    { key: "completeness", label: "Completeness", value: avgDim("completeness") },
    { key: "consistency", label: "Consistency", value: avgDim("consistency") },
    { key: "safety", label: "Safety", value: avgDim("safety") },
  ];

  const dimChartRows = dims.map((d) => {
    const width = Math.max(0, Math.min(100, Math.round((d.value / 5) * 100)));
    return `<div class="bar-row">
      <div class="bar-label">${d.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <div class="bar-value">${d.value}</div>
    </div>`;
  }).join("\n");

  const bandRows = [
    { key: "excellent", label: "Excellent (>= 4.5)" },
    { key: "good", label: "Good (3.5 - 4.49)" },
    { key: "acceptable", label: "Acceptable (2.5 - 3.49)" },
    { key: "poor", label: "Poor (< 2.5)" },
  ].map((band) => {
    const cases = results.filter((r: any) => getBand(Number(r.rubric_score || 0)) === band.key);

    const casesHtml = cases.length
      ? `<ul style="margin:0;padding-left:18px;">${cases
          .map((r: any) => `<li><b>${escapeHtml(r.id)}</b> (${Number(r.rubric_score || 0)}): ${escapeHtml(buildCaseReason(r))}</li>`)
          .join("")}</ul>`
      : "None";

    return `<tr>
      <td><span class="${bandBadgeClass(band.key as "excellent" | "good" | "acceptable" | "poor")}">${band.label}</span></td>
      <td>${cases.length}</td>
      <td>${casesHtml}</td>
    </tr>`;
  }).join("\n");

  const detailedCaseRows = results.map((r: any) => {
    const score = Number(r.rubric_score || 0);
    const band = getBand(score);
    const violations = (r.policy_violations || []) as string[];
    const reason = buildCaseReason(r);

    return `<tr>
      <td>${escapeHtml(r.id)}</td>
      <td><span class="${bandBadgeClass(band)}">${bandLabel(score)}</span></td>
      <td>${score}</td>
      <td>${escapeHtml((r.prompts || []).join(" | "))}</td>
      <td>${escapeHtml((r.responses || []).join(" | "))}</td>
      <td>${violations.length ? escapeHtml(violations.join("; ")) : "None"}</td>
      <td>${escapeHtml(reason)}</td>
    </tr>`;
  }).join("\n");

  const flaggedCases = results
    .filter((r: any) => Number(r.rubric_score || 0) < 3.5 || (r.policy_violations || []).length > 0)
    .map((r: any) => {
      const score = Number(r.rubric_score || 0);
      const band = getBand(score);
      const violations = (r.policy_violations || []) as string[];

      const stepItems = [
        `Prompt sent (${(r.prompts || []).length} prompt${(r.prompts || []).length === 1 ? "" : "s"})`,
        `Response captured (${(r.responses || []).length} response${(r.responses || []).length === 1 ? "" : "s"})`,
        `Dimension scoring computed: A=${Number(r?.dims?.accuracy || 0)}, R=${Number(r?.dims?.relevance || 0)}, C=${Number(r?.dims?.completeness || 0)}, K=${Number(r?.dims?.consistency || 0)}, S=${Number(r?.dims?.safety || 0)}`,
        violations.length ? `Policy checks flagged: ${violations.join("; ")}` : "Policy checks passed",
        r.manual_review ? "Manual review required" : "No manual review required",
      ];

      return `<div class="case-steps">
        <div class="case-steps-title"><b>${escapeHtml(r.id)}</b> <span class="${bandBadgeClass(band)}">${bandLabel(score)}</span> <span class="muted">Score: ${score}</span></div>
        <ul>${stepItems.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>`;
    })
    .join("\n");

  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><title>Rubric Results</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #f4f7f9;
      --surface: #ffffff;
      --text: #183039;
      --muted: #5f6f75;
      --line: #dde5ea;
      --accent: #1f6f8b;
      --excellent: #1f8a4d;
      --good: #1565c0;
      --acceptable: #b26b00;
      --poor: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Calibri", sans-serif;
      background: radial-gradient(circle at top right, #dceef7 0%, var(--bg) 35%, var(--bg) 100%);
      color: var(--text);
    }
    .container {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: linear-gradient(120deg, #ffffff 0%, #f2fbff 100%);
      padding: 20px;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: 2rem;
      letter-spacing: 0.2px;
    }
    .meta {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 14px 0;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: var(--surface);
      box-shadow: 0 2px 8px rgba(8, 38, 54, 0.04);
    }
    .metric {
      font-size: 1.9rem;
      font-weight: 700;
      margin: 6px 0 2px 0;
      color: var(--accent);
    }
    .label {
      color: var(--muted);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .panel {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
      box-shadow: 0 2px 8px rgba(8, 38, 54, 0.04);
      padding: 14px;
      margin-top: 12px;
    }
    .panel h2 {
      margin: 0 0 10px 0;
      font-size: 1.1rem;
    }
    .bar-row {
      display: grid;
      grid-template-columns: 130px 1fr 52px;
      align-items: center;
      gap: 10px;
      margin: 8px 0;
    }
    .bar-label { color: var(--text); font-size: 0.95rem; }
    .bar-track {
      width: 100%;
      height: 12px;
      border-radius: 999px;
      background: #e8eff3;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #44a9c8 0%, #1f6f8b 100%);
    }
    .bar-value {
      text-align: right;
      font-weight: 600;
      color: var(--muted);
    }
    table { border-collapse: collapse; width: 100%; margin-top: 4px; }
    td, th {
      border: 1px solid var(--line);
      padding: 10px;
      text-align: left;
      vertical-align: top;
      font-size: 0.95rem;
    }
    th {
      background: #f0f5f8;
      color: #25414b;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.2px;
      border: 1px solid transparent;
    }
    .badge.excellent { color: var(--excellent); background: #e6f6ec; border-color: #bfe6ce; }
    .badge.good { color: var(--good); background: #e8f2ff; border-color: #c3dbff; }
    .badge.acceptable { color: var(--acceptable); background: #fff4e5; border-color: #ffd9a6; }
    .badge.poor { color: var(--poor); background: #ffebea; border-color: #ffc7c3; }
    .muted { color: var(--muted); font-size: 0.9rem; }
    details { margin-top: 12px; }
    details > summary {
      cursor: pointer;
      font-weight: 600;
      color: #174b5e;
      padding: 6px 0;
    }
    .case-steps {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fcfeff;
      padding: 10px;
      margin: 10px 0;
    }
    .case-steps-title { margin-bottom: 6px; }
    .case-steps ul { margin: 0; padding-left: 18px; }
    .scale {
      margin-top: 12px;
      border: 1px dashed #c9d7df;
      border-radius: 10px;
      padding: 10px 12px;
      background: #f8fbfd;
    }
    .scale ul { margin: 8px 0 0 18px; padding: 0; }
    .footer {
      margin-top: 16px;
      color: var(--muted);
      font-size: 0.85rem;
    }
    @media (max-width: 760px) {
      .container { padding: 14px; }
      .bar-row { grid-template-columns: 1fr; gap: 4px; }
      .bar-value { text-align: left; }
    }
    @media print {
      body { background: #fff; }
      .container { max-width: none; padding: 0; }
      .card, .panel, .hero { box-shadow: none; }
      .hero { border: 1px solid #bbb; }
      .panel { page-break-inside: avoid; }
      .badge { border: 1px solid #999 !important; color: #000 !important; background: #fff !important; }
      a[href]:after { content: ""; }
    }
  </style>
  </head><body><div class="container">
  <section class="hero">
    <h1>Rubric Summary</h1>
    <p class="meta">Run at: ${escapeHtml(data.run_at)} | Cases: ${totalCases}</p>
  </section>

  <div class="grid">
    <div class="card"><div class="label">Average Rubric Score</div><div class="metric">${avgRubric}</div></div>
    <div class="card"><div class="label">Total Cases</div><div class="metric">${totalCases}</div></div>
    <div class="card"><div class="label">Pass Rate (>= 3.5)</div><div class="metric">${passRate}%</div></div>
    <div class="card"><div class="label">Policy Violation Cases</div><div class="metric">${withPolicyViolations}</div></div>
    <div class="card"><div class="label">Manual Review Cases</div><div class="metric">${manualReviewCases}</div></div>
    <div class="card"><div class="label">Violation Rate</div><div class="metric">${violationRate}%</div></div>
  </div>

  <section class="panel">
    <h2>Dimension Performance</h2>
    ${dimChartRows}
  </section>

  <section class="panel">
    <h2>Overall Rubric Band Distribution</h2>
    <table>
      <thead><tr><th>Band</th><th>Case Count</th></tr></thead>
      <tbody>
        <tr><td><span class="badge excellent">Excellent (>= 4.5)</span></td><td>${scoreBuckets.excellent}</td></tr>
        <tr><td><span class="badge good">Good (3.5 - 4.49)</span></td><td>${scoreBuckets.good}</td></tr>
        <tr><td><span class="badge acceptable">Acceptable (2.5 - 3.49)</span></td><td>${scoreBuckets.acceptable}</td></tr>
        <tr><td><span class="badge poor">Poor (< 2.5)</span></td><td>${scoreBuckets.poor}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Why Cases Landed In Each Band</h2>
    <table>
    <thead><tr><th>Band</th><th>Case Count</th><th>Why Cases Landed Here</th></tr></thead>
    <tbody>${bandRows}</tbody>
    </table>
  </section>

  <details class="panel">
    <summary>Show Case-Level Details</summary>
    <table>
      <thead><tr><th>Case ID</th><th>Band</th><th>Score</th><th>Prompt(s)</th><th>Response(s)</th><th>Policy Violations</th><th>Placement Reason</th></tr></thead>
      <tbody>${detailedCaseRows}</tbody>
    </table>
  </details>

  <details class="panel">
    <summary>Show Flagged-Case Test Run Steps (score < 3.5 or policy violation)</summary>
    ${flaggedCases || "<p class=\"muted\">No flagged cases in this run.</p>"}
  </details>

  <div class="scale">
    <strong>Score Scale Reference:</strong>
    <ul style="margin:0.5em 0 0 1.5em;padding:0;">
      <li><b>5</b> – Excellent / Fully Satisfies</li>
      <li><b>4</b> – Good / Minor Issues</li>
      <li><b>3</b> – Acceptable / Some Gaps</li>
      <li><b>2</b> – Poor / Major Gaps</li>
      <li><b>1</b> – Unacceptable / Fails</li>
    </ul>
  </div>

  <p class="footer">Generated by rubric-html reporter.</p>
  </div></body></html>`;

  const outPath = path.join(outDir, `rubric-report-${Date.now()}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Wrote HTML report to ${outPath}`);
  return outPath;
}
