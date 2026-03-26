import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { createInterface } from "readline";
import { scanForAgents, type FoundAgent } from "./agents/agent-scanner.js";
import {
  generateFromDescription,
  generateFromCodeReference,
} from "./agents/agent-generator.js";

const ROLES_TO_CONFIGURE: { role: string; description: string }[] = [
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

export async function runInit(): Promise<void> {
  console.log("\nAgent Debate — Setup\n");
  console.log("Configure an agent for each role in the pipeline.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  const existingAgents = await scanForAgents();
  const config: Record<string, string> = {};

  for (let i = 0; i < ROLES_TO_CONFIGURE.length; i++) {
    const { role, description } = ROLES_TO_CONFIGURE[i];
    console.log(
      `\n--- Role ${i + 1}/${ROLES_TO_CONFIGURE.length}: ${role} ---`
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
        if (agentName) config[role] = agentName;
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
        config[role] = personaPath;
        console.log(`  Generated persona at ${personaPath}`);
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
        config[role] = personaPath;
        console.log(`  Generated persona at ${personaPath}`);
        break;
      }
      case "D":
      default:
        console.log("  Skipped — will use default.");
        break;
    }
  }

  const configPath = resolve(process.cwd(), "agent-config.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    // No existing config
  }

  const finalConfig = {
    ...existing,
    roles: { ...(existing.roles as Record<string, string>), ...config },
  };

  await writeFile(configPath, JSON.stringify(finalConfig, null, 2), "utf-8");
  console.log(`\nConfiguration saved to ${configPath}\n`);

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
