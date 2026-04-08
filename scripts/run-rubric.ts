#!/usr/bin/env node
import { evaluateAll } from "../core/rubric-evaluator";
import { generateHtmlReport } from "../reporters/rubric-html";

async function main() {
  const role = process.argv[2] || "patient";
  const loggedIn = (process.argv[3] || "true") === "true";
  const jsonPath = await evaluateAll({ role, loggedIn });
  generateHtmlReport(jsonPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
