import { readFile } from "fs/promises";
import { resolve } from "path";
import type { DebateOutput, AgentConfig } from "../types.js";
import { runClaudeSubagent } from "../agents/cli-agent.js";
import { runQualityGates, type GateResult } from "../coding/quality-gates.js";
import { checkCoverage } from "../parsers/requirements.js";

export interface FinalReviewOutput {
  gatesResult: GateResult[];
  allGatesPassed: boolean;
  requirementsCoverage: { covered: string[]; uncovered: string[] };
  correctionsMatches: string[];
  unresolvedDissents: string[];
  summary: string;
}

export async function runFinalReview(
  debateOutput: DebateOutput,
  config: AgentConfig,
  projectRoot: string
): Promise<FinalReviewOutput> {
  const touchedFiles = debateOutput.implementationSteps.flatMap(
    (s) => s.filesToTouch
  );

  // Pass 1: Mechanical quality gates
  console.log("\n=== Final Review: Pass 1 (Quality Gates) ===\n");
  const gatesResult = await runQualityGates(touchedFiles, projectRoot);
  const allGatesPassed = gatesResult.every((g) => g.passed);

  if (!allGatesPassed) {
    console.log("  Quality gate failures found:");
    for (const g of gatesResult.filter((g) => !g.passed)) {
      console.log(`    - ${g.gate}: ${g.output.slice(0, 200)}`);
    }
  } else {
    console.log("  All quality gates passed");
  }

  // Pass 2: Judgment review
  console.log("\n=== Final Review: Pass 2 (Judgment) ===\n");

  let correctionsLog = "";
  try {
    const logPath =
      config.settings?.correctionsLogPath ?? "corrections-log.md";
    correctionsLog = await readFile(resolve(projectRoot, logPath), "utf-8");
  } catch {
    correctionsLog = "(no corrections log found)";
  }

  const coverage = checkCoverage(debateOutput.traceability);
  console.log(
    `  Requirements: ${coverage.covered.length} covered, ${coverage.uncovered.length} uncovered`
  );

  const patternsReviewer =
    config.roles["reviewer:patterns"] ?? "sean-style-reviewer";

  const judgmentPrompt = `## Final Review — Judgment Pass

### Original Requirements
${debateOutput.traceability.requirements.map((r) => `- [${r.id}] ${r.description}`).join("\n")}

### Corrections Log (past mistakes)
${correctionsLog}

### Auditor Dissents from Debate
${debateOutput.auditorWarnings.map((w) => `- ${w}`).join("\n")}

### Instructions
Review ALL recent changes (use git diff from the branch base). Check:
1. **Requirements coverage** — every requirement has implementing code and test coverage
2. **Past mistakes** — does this change repeat anything from the corrections log?
3. **Dissent review** — were the Auditor's concerns addressed?

Return a JSON object:
{
  "correctionsMatches": ["description of any match with corrections log"],
  "unresolvedDissents": ["any auditor dissent that was NOT addressed"],
  "summary": "Overall assessment in 2-3 sentences"
}`;

  const judgmentResult = runClaudeSubagent(patternsReviewer, judgmentPrompt, {
    timeout: 600000,
  });

  let correctionsMatches: string[] = [];
  let unresolvedDissents: string[] = [];
  let summary = "";

  try {
    const parsed = JSON.parse(judgmentResult.output) as {
      correctionsMatches: string[];
      unresolvedDissents: string[];
      summary: string;
    };
    correctionsMatches = parsed.correctionsMatches;
    unresolvedDissents = parsed.unresolvedDissents;
    summary = parsed.summary;
  } catch {
    summary = judgmentResult.output;
  }

  return {
    gatesResult,
    allGatesPassed,
    requirementsCoverage: coverage,
    correctionsMatches,
    unresolvedDissents,
    summary,
  };
}

export function formatFinalReport(output: FinalReviewOutput): string {
  const sections: string[] = [];

  sections.push("# Final Review Report\n");

  sections.push("## Quality Gates");
  for (const g of output.gatesResult) {
    sections.push(`- ${g.passed ? "PASS" : "FAIL"} ${g.gate}`);
  }

  sections.push("\n## Requirements Coverage");
  sections.push(`- Covered: ${output.requirementsCoverage.covered.length}`);
  sections.push(`- Uncovered: ${output.requirementsCoverage.uncovered.length}`);
  if (output.requirementsCoverage.uncovered.length > 0) {
    sections.push(
      `- Missing: ${output.requirementsCoverage.uncovered.join(", ")}`
    );
  }

  if (output.correctionsMatches.length > 0) {
    sections.push("\n## Corrections Log Matches");
    for (const m of output.correctionsMatches) {
      sections.push(`- ${m}`);
    }
  }

  if (output.unresolvedDissents.length > 0) {
    sections.push("\n## Unresolved Auditor Dissents");
    for (const d of output.unresolvedDissents) {
      sections.push(`- ${d}`);
    }
  }

  sections.push(`\n## Summary\n${output.summary}`);

  return sections.join("\n");
}