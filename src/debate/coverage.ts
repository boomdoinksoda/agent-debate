import Anthropic from "@anthropic-ai/sdk";
import type {
  RoundDecision,
  Requirement,
  ImplementationStep,
} from "../types.js";

const client = new Anthropic();

export async function checkDebateCoverage(
  decisions: RoundDecision[],
  requirements: Requirement[]
): Promise<{ covered: string[]; uncovered: string[] }> {
  const allDecisionText = decisions.map((d) => d.outcome).join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `## Requirements
${requirements.map((r) => `- [${r.id}] ${r.description}`).join("\n")}

## Decisions made so far
${allDecisionText}

## Task
Which requirements have been addressed by the decisions? Return a JSON object:
{
  "covered": ["req-id-1", "req-id-2"],
  "uncovered": ["req-id-3"]
}`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return JSON.parse(content) as { covered: string[]; uncovered: string[] };
  } catch {
    return { covered: [], uncovered: requirements.map((r) => r.id) };
  }
}

export async function extractStepsFromDebate(
  decisions: RoundDecision[],
  requirements: Requirement[]
): Promise<ImplementationStep[]> {
  const allDecisionText = decisions.map((d) => d.outcome).join("\n\n");
  const dissents = decisions.flatMap((d) => d.dissents);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `## Debate decisions
${allDecisionText}

## Requirements
${requirements.map((r) => `- [${r.id}] ${r.description}`).join("\n")}

## Auditor warnings
${dissents.join("\n")}

## Task
Convert the debate decisions into an ordered list of implementation steps. Return a JSON array:
[
  {
    "id": "step-1",
    "title": "Short title",
    "description": "What to implement",
    "filesToTouch": ["pkg/service/file.go"],
    "acceptanceCriteria": ["criterion 1"],
    "relevantWarnings": ["warning from auditor if applicable"],
    "requirementIds": ["req-id-1"]
  }
]

Every requirement must appear in at least one step's requirementIds.`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(content) as ImplementationStep[];
}