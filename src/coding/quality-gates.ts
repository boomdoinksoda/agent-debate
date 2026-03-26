import { execSync } from "child_process";
import { readFile } from "fs/promises";
import { resolve } from "path";

export interface GateResult {
  gate: string;
  passed: boolean;
  output: string;
}

export interface GateDefinition {
  name: string;
  command: string;
}

/**
 * Run user-defined quality gates from agent-config.json.
 * Gates are language-agnostic — users configure their own
 * linters, formatters, and test runners.
 */
export async function runQualityGates(
  touchedFiles: string[],
  projectRoot?: string
): Promise<GateResult[]> {
  const root = projectRoot ?? process.env.PROJECT_ROOT ?? process.cwd();
  const gates = await loadGateDefinitions(root);

  if (gates.length === 0) return [];

  const results: GateResult[] = [];
  for (const gate of gates) {
    // Replace $FILES placeholder with actual touched files
    const command = gate.command.replace(
      "$FILES",
      touchedFiles.join(" ")
    );
    results.push(runGate(gate.name, command, root));
  }

  return results;
}

function runGate(name: string, command: string, cwd: string): GateResult {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 120000,
      cwd,
    });
    return { gate: name, passed: true, output };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    return {
      gate: name,
      passed: false,
      output: (error.stdout ?? "") + (error.stderr ?? ""),
    };
  }
}

async function loadGateDefinitions(
  projectRoot: string
): Promise<GateDefinition[]> {
  try {
    const configPath = resolve(projectRoot, "agent-config.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      qualityGates?: GateDefinition[];
    };
    return config.qualityGates ?? [];
  } catch {
    return [];
  }
}
