import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { createInterface } from "readline";
import { scanForAgents, type FoundAgent } from "./agents/agent-scanner.js";
import {
  generateFromDescription,
  generateFromCodeReference,
} from "./agents/agent-generator.js";

// --- Step 1: Debate Personas ---

const DEBATE_PERSONAS: {
  role: string;
  name: string;
  description: string;
  defaultFile: string;
}[] = [
  {
    role: "debater:architect",
    name: "Architect",
    description:
      "Focuses on system design, data flow, layer boundaries, and API contracts",
    defaultFile: "personas/architect.md",
  },
  {
    role: "debater:pragmatist",
    name: "Pragmatist",
    description:
      "Focuses on simplicity, reusing existing patterns, and shipping fast",
    defaultFile: "personas/pragmatist.md",
  },
  {
    role: "debater:auditor",
    name: "Auditor",
    description:
      "Focuses on past mistakes, risk flags, error handling gaps, and test coverage",
    defaultFile: "personas/auditor.md",
  },
];

// --- Step 2: Execution Agents ---

const EXECUTION_ROLES: { role: string; description: string }[] = [
  { role: "coder", description: "Writes implementation code" },
  {
    role: "reviewer:correctness",
    description: "Reviews for correctness and error handling",
  },
  {
    role: "reviewer:style",
    description: "Reviews for code style and patterns",
  },
  {
    role: "reviewer:patterns",
    description: "Reviews for architectural patterns (final review)",
  },
];

// --- Step 3: Quality Gates ---

const QUALITY_GATE_PRESETS: Record<
  string,
  { name: string; command: string }[]
> = {
  go: [
    { name: "fmt", command: "gofmt -l $FILES" },
    { name: "vet", command: "go vet ./..." },
    { name: "test", command: "go test -race ./..." },
  ],
  typescript: [
    { name: "lint", command: "npx eslint ." },
    { name: "typecheck", command: "npx tsc --noEmit" },
    { name: "test", command: "npx vitest run" },
  ],
  python: [
    { name: "ruff", command: "ruff check ." },
    { name: "mypy", command: "mypy ." },
    { name: "pytest", command: "pytest" },
  ],
  ruby: [
    { name: "rubocop", command: "bundle exec rubocop" },
    { name: "rspec", command: "bundle exec rspec" },
  ],
  node: [
    { name: "lint", command: "npm run lint" },
    { name: "test", command: "npm test" },
  ],
};

export async function runInit(): Promise<void> {
  console.log("\n========================================");
  console.log("  Agent Debate — Setup");
  console.log("========================================\n");
  console.log("This will walk you through configuring:\n");
  console.log("  1. Debate personas (Architect, Pragmatist, Auditor)");
  console.log("  2. Execution agents (coder + reviewers)");
  console.log("  3. Quality gates (linters, formatters, test runners)");
  console.log("  4. Ticket and doc sources\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  const existingAgents = await scanForAgents();

  const configPath = resolve(process.cwd(), "agent-config.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    // No existing config
  }

  // ========================================
  // Step 1: Debate Personas
  // ========================================

  console.log("\n--- Step 1: Debate Personas ---");
  console.log("These three agents debate HOW to implement your tickets.\n");

  const personas: Record<string, string> = {
    ...(existing.personas as Record<string, string>),
  };

  for (let i = 0; i < DEBATE_PERSONAS.length; i++) {
    const p = DEBATE_PERSONAS[i];
    console.log(`\n  Persona ${i + 1}/${DEBATE_PERSONAS.length}: ${p.name}`);
    console.log(`  ${p.description}\n`);
    console.log("  A) Use the default persona");
    console.log("  B) Create from description (describe the perspective you want)");
    console.log("  C) Create from code reference (learn from a repo or PRs)\n");

    const choice = (await ask("  Choice [A/B/C]: ")).trim().toUpperCase();

    switch (choice) {
      case "B": {
        const desc = await ask(
          "  Describe this persona's perspective and priorities: "
        );
        console.log("  Generating persona...");
        const personaPath = await generateFromDescription(
          p.role,
          desc.trim(),
          resolve(process.cwd(), "personas")
        );
        personas[p.role] = personaPath;
        console.log(`  Generated: ${personaPath}`);
        break;
      }
      case "C": {
        const ref = await ask("  Enter GitHub repo, PR URL, or local path: ");
        console.log("  Analyzing patterns...");
        const personaPath = await generateFromCodeReference(
          p.role,
          ref.trim(),
          resolve(process.cwd(), "personas")
        );
        personas[p.role] = personaPath;
        console.log(`  Generated: ${personaPath}`);
        break;
      }
      case "A":
      default:
        personas[p.role] = p.defaultFile;
        console.log(`  Using default: ${p.defaultFile}`);
        break;
    }
  }

  // ========================================
  // Step 2: Execution Agents
  // ========================================

  console.log("\n\n--- Step 2: Execution Agents ---");
  console.log("These agents write code and review it during implementation.\n");

  const roles: Record<string, string> = {
    ...(existing.roles as Record<string, string>),
  };

  for (let i = 0; i < EXECUTION_ROLES.length; i++) {
    const { role, description } = EXECUTION_ROLES[i];
    console.log(
      `\n  Role ${i + 1}/${EXECUTION_ROLES.length}: ${role}`
    );
    console.log(`  ${description}\n`);
    console.log("  A) Use an existing Claude Code agent");
    console.log("  B) Create from code reference (repo, PRs, branch)");
    console.log("  C) Create from description");
    console.log("  D) Skip (use default)\n");

    const choice = (await ask("  Choice [A/B/C/D]: ")).trim().toUpperCase();

    switch (choice) {
      case "A": {
        const agentName = await pickExistingAgent(existingAgents, ask);
        if (agentName) roles[role] = agentName;
        break;
      }
      case "B": {
        const ref = await ask("  Enter GitHub repo, PR URL, or local path: ");
        console.log("  Analyzing code patterns...");
        const personaPath = await generateFromCodeReference(
          role,
          ref.trim(),
          resolve(process.cwd(), "personas")
        );
        roles[role] = personaPath;
        console.log(`  Generated: ${personaPath}`);
        break;
      }
      case "C": {
        const desc = await ask("  Describe the style you want: ");
        console.log("  Generating persona...");
        const personaPath = await generateFromDescription(
          role,
          desc.trim(),
          resolve(process.cwd(), "personas")
        );
        roles[role] = personaPath;
        console.log(`  Generated: ${personaPath}`);
        break;
      }
      case "D":
      default:
        console.log("  Skipped — will use default.");
        break;
    }
  }

  // ========================================
  // Step 3: Quality Gates
  // ========================================

  console.log("\n\n--- Step 3: Quality Gates ---");
  console.log(
    "Configure linters, formatters, and test runners to check code after each step.\n"
  );

  const presetNames = Object.keys(QUALITY_GATE_PRESETS);
  console.log("  Available presets:");
  presetNames.forEach((name, i) => {
    const gates = QUALITY_GATE_PRESETS[name];
    const cmds = gates.map((g) => g.name).join(", ");
    console.log(`    ${i + 1}) ${name} (${cmds})`);
  });
  console.log(`    ${presetNames.length + 1}) Custom (enter your own commands)`);
  console.log(`    ${presetNames.length + 2}) Skip (no quality gates)\n`);

  const gateChoice = (await ask("  Choice: ")).trim();
  const gateIdx = parseInt(gateChoice, 10) - 1;

  let qualityGates: { name: string; command: string }[] = [];

  if (gateIdx >= 0 && gateIdx < presetNames.length) {
    qualityGates = QUALITY_GATE_PRESETS[presetNames[gateIdx]];
    console.log(`  Using ${presetNames[gateIdx]} preset:`);
    qualityGates.forEach((g) => console.log(`    - ${g.name}: ${g.command}`));
  } else if (gateIdx === presetNames.length) {
    // Custom
    console.log("  Enter quality gates (empty name to stop):\n");
    while (true) {
      const name = (await ask("    Gate name: ")).trim();
      if (!name) break;
      const command = (await ask("    Command: ")).trim();
      if (command) {
        qualityGates.push({ name, command });
      }
    }
  } else {
    console.log("  Skipped — no quality gates configured.");
  }

  // ========================================
  // Step 4: Sources
  // ========================================

  console.log("\n\n--- Step 4: Ticket & Doc Sources ---");
  console.log(
    "How should Agent Debate fetch tickets and documentation?\n"
  );
  console.log("  Tickets:");
  console.log("    A) Jira");
  console.log("    B) Linear");
  console.log("    C) GitHub Issues");
  console.log("    D) Custom command");
  console.log("    E) Skip (use auto-detect)\n");

  const ticketChoice = (await ask("  Choice [A/B/C/D/E]: "))
    .trim()
    .toUpperCase();

  let ticketCommand: string | undefined;
  switch (ticketChoice) {
    case "A":
      ticketCommand = `claude --print "Fetch the Jira ticket $TICKET_KEY. Return ONLY JSON with fields: key, summary, description, acceptanceCriteria (string[]), linkedDocs (URL[]), subtasks ({key, summary}[]). No markdown."`;
      break;
    case "B":
      ticketCommand = `claude --print "Fetch the Linear ticket $TICKET_KEY. Return ONLY JSON with fields: key, summary, description, acceptanceCriteria (string[]), linkedDocs (URL[]), subtasks ({key, summary}[]). No markdown."`;
      break;
    case "C":
      ticketCommand = `claude --print "Fetch the GitHub issue $TICKET_KEY. Return ONLY JSON with fields: key, summary, description, acceptanceCriteria (string[]), linkedDocs (URL[]), subtasks ({key, summary}[]). No markdown."`;
      break;
    case "D": {
      ticketCommand = (
        await ask("  Enter command (use $TICKET_KEY as placeholder): ")
      ).trim();
      break;
    }
    default:
      break;
  }

  console.log("\n  Documentation:");
  console.log("    A) Confluence");
  console.log("    B) Notion");
  console.log("    C) Local files (Obsidian, markdown, etc.)");
  console.log("    D) Custom command");
  console.log("    E) Skip (use auto-detect)\n");

  const docChoice = (await ask("  Choice [A/B/C/D/E]: "))
    .trim()
    .toUpperCase();

  let docCommand: string | undefined;
  switch (docChoice) {
    case "A":
      docCommand = `claude --print "Fetch the Confluence page at $DOC_URL. Return ONLY JSON with fields: title, url, content. No markdown."`;
      break;
    case "B":
      docCommand = `claude --print "Fetch the Notion page at $DOC_URL. Return ONLY JSON with fields: title, url, content. No markdown."`;
      break;
    case "C":
      docCommand = `cat "$DOC_URL"`;
      break;
    case "D": {
      docCommand = (
        await ask("  Enter command (use $DOC_URL as placeholder): ")
      ).trim();
      break;
    }
    default:
      break;
  }

  // ========================================
  // Save config
  // ========================================

  const sources: Record<string, unknown> = {
    ...(existing.sources as Record<string, unknown>),
  };
  if (ticketCommand) {
    sources.tickets = { provider: "cli", fetchCommand: ticketCommand };
  }
  if (docCommand) {
    sources.docs = { provider: "cli", fetchCommand: docCommand };
  }

  const finalConfig = {
    ...existing,
    roles,
    personas,
    sources,
    qualityGates:
      qualityGates.length > 0
        ? qualityGates
        : (existing.qualityGates ?? []),
    settings: existing.settings ?? {
      maxDebateRounds: 4,
      maxReviewCycles: 3,
      correctionsLogPath: "corrections-log.md",
    },
  };

  await writeFile(configPath, JSON.stringify(finalConfig, null, 2), "utf-8");

  console.log("\n========================================");
  console.log("  Setup Complete!");
  console.log("========================================\n");
  console.log(`  Config saved to: ${configPath}\n`);
  console.log("  Debate personas:");
  for (const p of DEBATE_PERSONAS) {
    console.log(`    ${p.name}: ${personas[p.role]}`);
  }
  console.log("\n  Execution agents:");
  for (const r of EXECUTION_ROLES) {
    console.log(`    ${r.role}: ${roles[r.role] ?? "default"}`);
  }
  if (qualityGates.length > 0) {
    console.log("\n  Quality gates:");
    for (const g of qualityGates) {
      console.log(`    ${g.name}: ${g.command}`);
    }
  }
  console.log("");

  rl.close();
}

async function pickExistingAgent(
  agents: FoundAgent[],
  ask: (q: string) => Promise<string>
): Promise<string | undefined> {
  if (agents.length === 0) {
    console.log("  No existing agents found.");
    return undefined;
  }

  console.log("  Found agents:");
  agents.forEach((a, i) => {
    console.log(`    ${i + 1}) ${a.name}`);
  });

  const pick = await ask(`  Select [1-${agents.length}]: `);
  const idx = parseInt(pick.trim(), 10) - 1;

  if (idx >= 0 && idx < agents.length) {
    console.log(`  Selected: ${agents[idx].name}`);
    return agents[idx].name;
  }

  console.log("  Invalid selection.");
  return undefined;
}
