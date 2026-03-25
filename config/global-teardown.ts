/**
 * config/global-teardown.ts
 *
 * Runs once after the entire test suite completes.
 * Triggers report generation and quality gate evaluation.
 */
import { FullConfig } from '@playwright/test';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log(`\n📊 Chatbot Testing Framework — Global Teardown`);
  console.log(`   Finalizing reports...`);

  // The custom reporter handles most finalization.
  // Add any post-suite cleanup here (e.g., purging temp sessions, notifying Slack).
  console.log(`✅ Teardown complete.\n`);
}
