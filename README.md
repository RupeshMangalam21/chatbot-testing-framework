# 🤖 Chatbot Testing Framework

A production-grade Playwright testing framework for AI chatbot quality evaluation, designed for the healthcare platform's ChatBot.com widget.

---

## Architecture Overview

```
chatbot-testing-framework/
│
├── config/                    # Framework configuration
│   ├── framework.config.ts    # All tuneable constants (timeouts, thresholds, quality gates)
│   ├── global-setup.ts        # Pre-suite: app health check, directory setup
│   └── global-teardown.ts     # Post-suite: cleanup
│
├── core/
│   └── types.ts               # Shared TypeScript types (single source of truth)
│
├── drivers/
│   └── ChatbotWidgetDriver.ts # Low-level iframe interaction (DOM selectors isolated here)
│
├── pages/                     # Page Object Model
│   ├── LandingPage.ts         # Next.js landing page POM
│   └── ChatbotWidget.ts       # Chatbot widget POM (wraps the driver)
│
├── evaluations/               # AI response evaluation engine
│   ├── BaseEvaluator.ts       # Abstract base class
│   ├── EvaluationEngine.ts    # Orchestrates all evaluators
│   ├── RelevanceEvaluator.ts  # Keyword + intent match scoring
│   ├── ResponseQualityEvaluator.ts  # Length, tone, actionability
│   ├── SafetyEvaluator.ts     # Injection, PII, jailbreak detection
│   ├── LatencyEvaluator.ts    # Response time scoring
│   ├── HallucinationDetector.ts  # Fabricated facts detection
│   ├── LLMJudge.ts            # Optional AI-powered evaluation (OpenAI/Anthropic/local)
│   └── SemanticSimilarity.ts  # Cosine + Jaccard for regression detection
│
├── test-data/
│   ├── datasets/
│   │   ├── happy-path.json        # Normal user scenarios
│   │   ├── safety-adversarial.json  # Injection, jailbreak, PII requests
│   │   ├── edge-cases.json        # Empty, emoji, long, multilingual
│   │   └── doctor-onboarding.json # Doctor/admin flows
│   └── baselines/                 # Captured baseline responses (gitignored by default)
│
├── tests/
│   ├── ui/                    # Widget visibility, rendering, accessibility
│   ├── conversation/          # Real conversation flow tests
│   ├── safety/                # Adversarial prompt tests
│   ├── latency/               # Response time benchmarks
│   ├── regression/            # Baseline comparison tests
│   └── edge-cases/            # Unusual input handling
│
├── reporters/
│   ├── ChatbotReporter.ts     # Custom Playwright reporter
│   └── HTMLReportTemplate.ts  # HTML report generator
│
├── utils/
│   ├── Logger.ts              # Structured logger
│   ├── helpers.ts             # calculateGrade, calculatePercentile, etc.
│   ├── textUtils.ts           # normalizeText, tokenize, keywordCoverage
│   └── TestResultStore.ts     # Persists evaluation data during test runs
│
├── scripts/
│   ├── capture-baseline.ts    # Captures baseline responses for regression tests
│   └── generate-report.ts    # Standalone report generator
│
├── .github/workflows/
│   └── chatbot-tests.yml      # CI/CD pipeline (parallel matrix by suite)
│
├── playwright.config.ts       # Playwright configuration (projects, reporters, timeouts)
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Quick Start

### 1. Install Dependencies

```bash
cd chatbot-testing-framework
npm install
npx playwright install chromium
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env — set APP_BASE_URL to your running Next.js app
```

### 3. Run All Tests

```bash
npm run chatbot:test
```
```bash
npx ts-node scripts/run-rubric.ts
```
### 4. View Reports

```bash
# Open HTML quality report
open chatbot-reports/chatbot-report-*.html

# Or use Playwright's built-in reporter
npm run chatbot:open-report
```

---

## Test Suites

| Suite | Command | What It Tests |
|-------|---------|---------------|
| UI | `npm run chatbot:test:ui` | Widget loads, input visible, messages render |
| Conversation | `npm run chatbot:test:conversation` | Real appointment/doctor flows |
| Safety | `npm run chatbot:test:safety` | Injections, jailbreaks, PII requests |
| Latency | `npm run chatbot:test:latency` | Response time benchmarks |
| Regression | `npm run chatbot:test:regression` | Baseline comparison |
| Edge Cases | `npm run chatbot:test:edge` | Empty, emoji, long prompts |
| Unrelated Queries | `npm run chatbot:test:unrelated` | Out-of-scope prompts and graceful redirection |

---

## Test Run Commands

Use these during local development and demos (PowerShell/Windows):

```bash
# Run full test pack
npm run chatbot:test

# Run only one suite
npm run chatbot:test:ui
npm run chatbot:test:conversation
npm run chatbot:test:safety
npm run chatbot:test:latency
npm run chatbot:test:regression
npm run chatbot:test:edge
npm run chatbot:test:unrelated

# Run headed for live walkthrough/demo
npm run chatbot:test:headed

# Run a single focused test by grep
npx playwright test tests/conversation/appointment-flows.spec.ts --project=chromium-desktop --headed --workers=1 --grep "responds to appointment booking query"

##################################################################################
# Run rubric evaluation (without LLM judge)
npx ts-node scripts/run-rubric.ts 

# Stable demo run in headed mode 
npx playwright test tests/ui/widget-ui.spec.ts tests/conversation/appointment-flows.spec.ts --project=chromium-desktop --workers=2 --headed

# Open Playwright HTML report
npm run chatbot:open-report



npx playwright test tests/safety/ --project=chromium-desktop --headed --workers=1 --retries=0
```


If you want to keep the LLM judge disabled during demos, set this in `.env`:

```bash
LLM_JUDGE_ENABLED=false
```

---

## Evaluation Scoring

Each bot response is evaluated by multiple independent evaluators:

| Evaluator | Scale | Passing | What It Measures |
|-----------|-------|---------|-----------------|
| RelevanceEvaluator | 0–5 | ≥ 3 | Keyword match + intent detection |
| ResponseQualityEvaluator | 0–5 | ≥ 3 | Length, tone, actionable content |
| SafetyEvaluator | 0–1 | = 1 | Injection/jailbreak/PII detection |
| LatencyEvaluator | 0–5 | ≥ 3 | Response time vs thresholds |
| HallucinationDetector | 0–3 | ≥ 2 | Fabricated facts/claims |

### Latency Thresholds

| Grade | Threshold |
|-------|-----------|
| Excellent | ≤ 3s |
| Acceptable | ≤ 8s |
| Poor | ≤ 15s |
| Failing | > 30s |

---

## Quality Gates (CI Enforcement)

The CI pipeline fails if any of these gates are not met:

| Gate | Threshold |
|------|-----------|
| Pass Rate | ≥ 80% |
| Avg Relevance Score | ≥ 3.0 / 5 |
| Safety Violations | = 0 (zero tolerance) |
| Avg Latency | ≤ 10,000ms |

---

## Regression Testing

### Capture Baselines

Before running regression tests, capture a baseline:

```bash
npm run chatbot:baseline
```

This will save responses to `test-data/baselines/*.json`.

### Run Regression Tests

```bash
npm run chatbot:test:regression
```

Regression detection uses a combined Cosine + Jaccard similarity score. A similarity below **65%** flags a regression.

---

## LLM-as-a-Judge (Optional)

Enable AI-powered evaluation using a judge model:

```bash
# In .env:
LLM_JUDGE_ENABLED=true
LLM_JUDGE_PROVIDER=anthropic
LLM_JUDGE_MODEL=claude-3-haiku-20240307
ANTHROPIC_API_KEY=your_key_here
```

The judge independently scores:
- Relevance (0–5)
- Correctness (0–5)
- Completeness (0–5)
- Safety (pass/fail)

---

## Adding New Test Prompts

Add entries to the appropriate dataset JSON:

```json
{
  "id": "HP-999",
  "prompt": "How do I view my lab results?",
  "expectedIntent": "view lab results",
  "expectedKeywords": ["lab", "results", "view", "portal"],
  "category": "healthcare-query",
  "tags": ["patient-portal"],
  "maxLatencyMs": 15000
}
```

---

## CI/CD Integration

The GitHub Actions workflow (`.github/workflows/chatbot-tests.yml`):

1. Runs test suites in parallel (ui, conversation, safety, edge, latency)
2. Generates quality reports per suite
3. Aggregates and checks quality gates
4. Comments on PRs with a grade summary
5. Has a dedicated **zero-tolerance safety gate** job
6. Runs nightly to detect chatbot drift over time

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `APP_BASE_URL` | URL of the deployed Next.js app |
| `ANTHROPIC_API_KEY` | For LLM judge (optional) |
| `LLM_JUDGE_ENABLED` | `true` to enable judge (optional) |

---

## Extending the Framework

### Add a New Evaluator

```typescript
// evaluations/MyEvaluator.ts
import { BaseEvaluator } from './BaseEvaluator';
import { ConversationTurn, EvaluationResult } from '../core/types';

export class MyEvaluator extends BaseEvaluator {
  readonly name = 'MyEvaluator';
  readonly maxScore = 5;

  async evaluate(turn: ConversationTurn): Promise<EvaluationResult> {
    // Your scoring logic here
    return this.buildResult(score, reasoning, passed);
  }
}
```

Register it in `EvaluationEngine.ts`:
```typescript
this.evaluators = [
  // ...existing evaluators,
  new MyEvaluator(),
];
```

### Add a New Test Suite

1. Create `tests/my-suite/my-tests.spec.ts`
2. Import `LandingPage` and `ChatbotWidget`
3. Use `chatbot.executePrompt()` and `evaluationEngine.evaluate()`
4. Add a new npm script in `package.json`

---

## Troubleshooting

**Widget not detected:**
- Verify `APP_BASE_URL` is correct and the app is running
- Check `FrameworkConfig.widget.iframeSelector` matches the actual DOM
- Run with `--headed` flag to watch: `npm run chatbot:test:headed`

**All tests timing out:**
- Increase `botResponseTimeoutMs` in `framework.config.ts`
- Check the ChatBot.com widget is properly configured

**Safety tests flaky:**
- Safety tests have `retries: 0` — a failure is genuine
- Review the specific violation in the test output

---

## License

Internal use — healthcare platform chatbot testing team.
