import type {
  ImplementationStep,
  ReviewResult,
  PipelineState,
  AgentConfig,
} from "../types.js";
import { runClaudeSubagent } from "../agents/cli-agent.js";

const MAX_REVIEW_CYCLES = 3;

export async function runStep(
  step: ImplementationStep,
  config: AgentConfig,
  state: PipelineState,
  allSteps: ImplementationStep[]
): Promise<{ success: boolean; escalate: boolean }> {
  const coderAgent = config.roles["coder"] ?? "grae-style-coder";
  const reviewerAgent =
    config.roles["reviewer:correctness"] ?? "nick-style-reviewer";

  console.log(`\n=== Step ${step.id}: ${step.title} ===\n`);

  const codingPrompt = buildCodingPrompt(step, state, allSteps);

  for (let cycle = 0; cycle < MAX_REVIEW_CYCLES; cycle++) {
    console.log(
      cycle === 0
        ? "  Implementing..."
        : `  Fixing review feedback (cycle ${cycle + 1})...`
    );

    const codeResult = runClaudeSubagent(coderAgent, codingPrompt);
    if (codeResult.exitCode !== 0) {
      console.log("  Coding agent failed");
      return { success: false, escalate: true };
    }

    console.log("  Reviewing...");
    const reviewResult = runReview(step, reviewerAgent);

    if (reviewResult.verdict === "approve") {
      console.log("  Approved");
      return { success: true, escalate: false };
    }

    console.log(
      `  Changes requested (${reviewResult.items.length} items)`
    );
    const fixPrompt = buildFixPrompt(step, reviewResult);

    const fixResult = runClaudeSubagent(coderAgent, fixPrompt);
    if (fixResult.exitCode !== 0 && cycle === MAX_REVIEW_CYCLES - 1) {
      console.log("  Max review cycles reached");
      return { success: false, escalate: true };
    }
  }

  return { success: false, escalate: true };
}

function runReview(
  step: ImplementationStep,
  reviewerAgent: string
): ReviewResult {
  const reviewPrompt = `Review the changes made for this implementation step.

## Step: ${step.title}
${step.description}

## Acceptance Criteria
${step.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

## Auditor Warnings
${step.relevantWarnings.map((w) => `- ${w}`).join("\n")}

## Instructions
Review the recent changes (use git diff). Check:
1. Acceptance criteria are met
2. Code follows quality gates (logging, error handling, naming, etc.)
3. Auditor warnings are addressed

Respond with a JSON object:
{
  "verdict": "approve" | "request_changes",
  "items": [{"severity": "blocker|suggestion|nit", "file": "path", "message": "what to fix"}]
}`;

  const result = runClaudeSubagent(reviewerAgent, reviewPrompt);

  try {
    return JSON.parse(result.output) as ReviewResult;
  } catch {
    return { verdict: "approve", items: [] };
  }
}

function buildCodingPrompt(
  step: ImplementationStep,
  state: PipelineState,
  _allSteps: ImplementationStep[]
): string {
  return `## Implementation Task

### Step: ${step.title}
${step.description}

### Files to touch
${step.filesToTouch.map((f) => `- ${f}`).join("\n")}

### Acceptance Criteria
${step.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}

### Auditor Warnings (address these)
${step.relevantWarnings.map((w) => `- ${w}`).join("\n")}

### Requirements this step covers
${step.requirementIds.map((id) => `- ${id}`).join("\n")}

### Context
This is step ${state.currentStep} of ${state.totalSteps}.
Previously completed: ${state.completedSteps.join(", ") || "none"}

### Instructions
Implement this step completely. Write production-ready code. Run tests to verify. Do not skip any acceptance criteria.`;
}

function buildFixPrompt(
  step: ImplementationStep,
  review: ReviewResult
): string {
  const items = review.items
    .map((i) => `- [${i.severity}] ${i.file}: ${i.message}`)
    .join("\n");

  return `## Fix Review Feedback

### Step: ${step.title}

### Review feedback to address:
${items}

### Instructions
Fix each item listed above. Run tests after fixing. Do not introduce new issues.`;
}