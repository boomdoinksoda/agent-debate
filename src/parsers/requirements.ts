import type { Requirement, RequirementsTraceability } from "../types.js";

export function buildTraceabilityMatrix(
  requirements: Requirement[]
): RequirementsTraceability {
  return {
    requirements,
    stepMapping: Object.fromEntries(requirements.map((r) => [r.id, []])),
  };
}

export function checkCoverage(traceability: RequirementsTraceability): {
  covered: string[];
  uncovered: string[];
} {
  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const req of traceability.requirements) {
    const steps = traceability.stepMapping[req.id] ?? [];
    if (steps.length > 0) {
      covered.push(req.id);
    } else {
      uncovered.push(req.id);
    }
  }

  return { covered, uncovered };
}

export function formatUncoveredRequirements(
  traceability: RequirementsTraceability,
  uncoveredIds: string[]
): string {
  return uncoveredIds
    .map((id) => {
      const req = traceability.requirements.find((r) => r.id === id);
      return req ? `- [${req.id}] ${req.description}` : `- ${id}`;
    })
    .join("\n");
}