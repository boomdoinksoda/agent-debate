import { readFile } from "fs/promises";
import { resolve } from "path";
import type {
  DebaterRole,
  DebateOutput,
  PipelineState,
  PersonaConfig,
} from "./types.js";
import { loadConfig, getProjectRoot } from "./config.js";
import { loadPersona } from "./agents/persona-loader.js";
import {
  fetchTicket,
  extractRequirementsFromTicket,
} from "./parsers/jira.js";
import {
  fetchDocPage,
  extractRequirementsFromDoc,
} from "./parsers/confluence.js";
import { buildTraceabilityMatrix } from "./parsers/requirements.js";
import {
  runDebateRound,
  getDebateTopics,
  type DebateTopic,
} from "./debate/round.js";
import {
  checkDebateCoverage,
  extractStepsFromDebate,
} from "./debate/coverage.js";
import { runStep } from "./coding/step-runner.js";
import { runFinalReview, formatFinalReport } from "./review/final-review.js";
import {
  indexCorrectionsLog,
  indexSpike,
  indexReviewOutcome,
} from "./vectordb/collections.js";

interface RunOptions {
  debateOnly?: boolean;
  dryRun?: boolean;
  contextFile?: string;
}

export interface PreFetchedContext {
  ticket: {
    key: string;
    summary: string;
    description: string;
    acceptanceCriteria: string[];
    linkedDocs: string[];
    subtasks: { key: string; summary: string }[];
  };
  docs: { title: string; url: string; content: string }[];
}

export async function runOrchestrator(
  ticketKey: string,
  options: RunOptions
): Promise<void> {
  const projectRoot = getProjectRoot();
  const config = await loadConfig(projectRoot);

  console.log(`\nAgent Debate — ${ticketKey}\n`);

  // --- Phase 0: Gather context ---

  console.log("Gathering context...");

  let ticket;
  let docContent = "";

  if (options.contextFile) {
    // Use pre-fetched context from the skill layer
    console.log(`  Loading pre-fetched context from ${options.contextFile}`);
    const raw = await readFile(resolve(options.contextFile), "utf-8");
    const preFetched = JSON.parse(raw) as PreFetchedContext;

    ticket = preFetched.ticket;
    console.log(`  Ticket: ${ticket.summary}`);

    for (const doc of preFetched.docs) {
      docContent += `\n\n## ${doc.title}\n${doc.content}`;
      await indexSpike(projectRoot, doc);
      console.log(`  Indexed doc in vector DB: ${doc.title}`);
    }
  } else {
    // Fetch live from configured sources
    ticket = await fetchTicket(ticketKey, config);
    console.log(`  Ticket: ${ticket.summary}`);

    for (const url of ticket.linkedDocs) {
      console.log(`  Fetching doc: ${url}`);
      const page = await fetchDocPage(url, config);
      docContent += `\n\n## ${page.title}\n${page.content}`;

      await indexSpike(projectRoot, page);
      console.log(`  Indexed doc in vector DB: ${page.title}`);
    }
  }

  const requirements = [
    ...extractRequirementsFromTicket(ticket),
    ...(docContent
      ? extractRequirementsFromDoc({
          title: "Doc",
          url: "",
          content: docContent,
        })
      : []),
  ];

  console.log(`  Found ${requirements.length} requirements\n`);

  let correctionsLog = "";
  try {
    const logPath =
      config.settings?.correctionsLogPath ?? "corrections-log.md";
    correctionsLog = await readFile(resolve(projectRoot, logPath), "utf-8");

    // Index corrections log in vector DB for semantic search
    const indexed = await indexCorrectionsLog(projectRoot, logPath);
    if (indexed > 0) {
      console.log(`  Indexed ${indexed} corrections in vector DB`);
    }
  } catch {
    // No log yet
  }

  // --- Phase 1: Debate ---

  console.log("=== Phase 1: Debate ===\n");

  const personas = new Map<DebaterRole, PersonaConfig>();
  const debaterRoles: DebaterRole[] = [
    "debater:architect",
    "debater:pragmatist",
    "debater:auditor",
  ];

  for (const role of debaterRoles) {
    const personaPath =
      config.personas?.[role] ?? `personas/${role.split(":")[1]}.md`;
    const persona = await loadPersona(personaPath, projectRoot);
    personas.set(role, persona);
  }

  const debateContext = {
    requirements,
    ticketSummary: `${ticket.key}: ${ticket.summary}\n\n${ticket.description}`,
    spikeContent: docContent,
    adrContent: "",
    correctionsLog,
    projectRoot,
  };

  const decisions = [];
  const topics = getDebateTopics();

  for (const topic of topics) {
    console.log(`  Round: ${topic}`);

    const decision = await runDebateRound(
      topic as DebateTopic,
      personas,
      debateContext,
      decisions
    );

    decisions.push(decision);

    const coverage = await checkDebateCoverage(decisions, requirements);
    if (coverage.uncovered.length > 0) {
      console.log(
        `    ${coverage.uncovered.length} requirements not yet addressed`
      );
    } else {
      console.log(`    All requirements covered`);
    }

    if (decision.dissents.length > 0) {
      console.log(`    ${decision.dissents.length} dissent(s) logged`);
    }
  }

  const implementationSteps = await extractStepsFromDebate(
    decisions,
    requirements
  );

  const traceability = buildTraceabilityMatrix(requirements);
  for (const step of implementationSteps) {
    for (const reqId of step.requirementIds) {
      if (traceability.stepMapping[reqId]) {
        traceability.stepMapping[reqId].push(step.id);
      }
    }
  }

  const debateOutput: DebateOutput = {
    decisions,
    implementationSteps,
    traceability,
    auditorWarnings: decisions.flatMap((d) => d.dissents),
  };

  console.log(
    `\nImplementation Plan: ${implementationSteps.length} steps`
  );
  for (const step of implementationSteps) {
    console.log(`  ${step.id}: ${step.title}`);
    console.log(`    Files: ${step.filesToTouch.join(", ")}`);
    console.log(`    Criteria: ${step.acceptanceCriteria.length} items`);
  }

  if (options.debateOnly || options.dryRun) {
    console.log("\nDebate phase complete. Plan ready for approval.");
    return;
  }

  console.log("\nProceeding to coding phase...\n");

  // --- Phase 2: Coding ---

  console.log("=== Phase 2: Coding ===\n");

  const state: PipelineState = {
    ticketKey,
    phase: "coding",
    currentStep: 0,
    totalSteps: implementationSteps.length,
    debateOutput,
    completedSteps: [],
    requirementsCovered: [],
  };

  for (let i = 0; i < implementationSteps.length; i++) {
    state.currentStep = i + 1;
    const step = implementationSteps[i];

    const result = await runStep(step, config, state, implementationSteps);

    if (result.escalate) {
      console.log(
        `\nStep ${step.id} requires manual intervention. Halting.`
      );
      return;
    }

    if (result.success) {
      state.completedSteps.push(step.id);
      state.requirementsCovered.push(...step.requirementIds);

      // Index review outcome for future reference
      await indexReviewOutcome(projectRoot, {
        ticketKey,
        stepId: step.id,
        reviewerAgent: config.roles["reviewer:correctness"] ?? "reviewer",
        feedback: `Step ${step.id} completed successfully`,
        resolved: true,
      });
    }
  }

  // --- Phase 3: Final Review ---

  console.log("\n=== Phase 3: Final Review ===\n");
  state.phase = "final-review";

  const finalReview = await runFinalReview(debateOutput, config, projectRoot);
  const report = formatFinalReport(finalReview);

  console.log(report);

  if (!finalReview.allGatesPassed) {
    console.log(
      "\nQuality gate failures detected. Sending back for fixes...\n"
    );
  }

  state.phase = "complete";
  console.log("\nPipeline complete.");
}
