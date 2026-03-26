import Anthropic from "@anthropic-ai/sdk";
import type {
  DebaterRole,
  Position,
  RoundDecision,
  Requirement,
  PersonaConfig,
} from "../types.js";
import { collectVotes, synthesizeOutcome } from "./voting.js";
import {
  findRelevantCorrections,
  findRelevantPatterns,
  findRelevantReviews,
} from "../vectordb/collections.js";

const client = new Anthropic();

const DEBATE_TOPICS = [
  "architecture",
  "approach-per-requirement",
  "risks-and-mitigations",
  "step-ordering",
] as const;

export type DebateTopic = (typeof DEBATE_TOPICS)[number];

export function getDebateTopics(): readonly string[] {
  return DEBATE_TOPICS;
}

export interface DebateContext {
  requirements: Requirement[];
  ticketSummary: string;
  spikeContent: string;
  adrContent: string;
  correctionsLog: string;
  projectRoot: string;
}

export async function runDebateRound(
  topic: DebateTopic,
  personas: Map<DebaterRole, PersonaConfig>,
  context: DebateContext,
  previousDecisions: RoundDecision[]
): Promise<RoundDecision> {
  const roles: DebaterRole[] = [
    "debater:architect",
    "debater:pragmatist",
    "debater:auditor",
  ];

  // Phase 1: All agents propose their position (parallel)
  const positions = await Promise.all(
    roles.map((role) =>
      getPosition(role, personas.get(role)!, topic, context, previousDecisions)
    )
  );

  // Phase 2: All agents see others' positions and vote (parallel)
  const votes = await collectVotes(
    roles,
    personas,
    topic,
    positions,
    context
  );

  // Phase 3: Synthesize outcome
  const outcome = synthesizeOutcome(positions, votes);

  return {
    topic,
    positions,
    votes,
    outcome: outcome.decision,
    dissents: outcome.dissents,
  };
}

async function getPosition(
  role: DebaterRole,
  persona: PersonaConfig,
  topic: DebateTopic,
  context: DebateContext,
  previousDecisions: RoundDecision[]
): Promise<Position> {
  const previousContext =
    previousDecisions.length > 0
      ? `\n\nPrevious decisions made:\n${previousDecisions.map((d) => `- ${d.topic}: ${d.outcome}`).join("\n")}`
      : "";

  // Enrich auditor context with semantic search from vector DB
  let auditorEnrichment = "";
  if (role === "debater:auditor") {
    const searchQuery = `${context.ticketSummary} ${context.requirements.map((r) => r.description).join(" ")}`;

    const [relevantCorrections, relevantReviews] = await Promise.all([
      findRelevantCorrections(context.projectRoot, searchQuery, 5),
      findRelevantReviews(context.projectRoot, searchQuery, 3),
    ]);

    if (relevantCorrections.length > 0) {
      auditorEnrichment += `\n\nRelevant past mistakes (semantic match):\n${relevantCorrections.map((c) => `- ${c.text}`).join("\n")}`;
    }
    if (relevantReviews.length > 0) {
      auditorEnrichment += `\n\nRelevant past reviews:\n${relevantReviews.map((r) => `- ${r.text}`).join("\n")}`;
    }
  }

  // Enrich all agents with relevant code patterns
  let patternEnrichment = "";
  const patterns = await findRelevantPatterns(
    context.projectRoot,
    context.ticketSummary,
    3
  );
  if (patterns.length > 0) {
    patternEnrichment = `\n\nRelevant code patterns from this codebase:\n${patterns.map((p) => `- ${p.text}`).join("\n")}`;
  }

  const topicPrompts: Record<DebateTopic, string> = {
    architecture:
      "How should we architect the implementation? Consider service tiers, data flow, layer boundaries, and component relationships.",
    "approach-per-requirement": `For each requirement below, propose the specific implementation approach. Follow established codebase patterns.\n\nRequirements:\n${context.requirements.map((r) => `- [${r.id}] ${r.description}`).join("\n")}`,
    "risks-and-mitigations": `What could go wrong during implementation? Flag specific risks and propose mitigations.${auditorEnrichment || (role === "debater:auditor" ? `\n\nCorrections log (past mistakes):\n${context.correctionsLog}` : "")}`,
    "step-ordering":
      "Propose an ordered list of implementation steps. Consider dependencies, commit boundaries, and PR scope.",
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: persona.systemPrompt,
    messages: [
      {
        role: "user",
        content: `## Context\n\nTicket: ${context.ticketSummary}\n\nSpike:\n${context.spikeContent}\n\nADR:\n${context.adrContent}${patternEnrichment}${previousContext}\n\n## Your Task\n\nTopic: ${topic}\n\n${topicPrompts[topic]}\n\nProvide your position with clear reasoning. Be specific and actionable.`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    agent: role,
    content,
    reasoning: content,
  };
}