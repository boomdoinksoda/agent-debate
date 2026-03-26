import { execSync } from "child_process";

export interface SubagentResult {
  output: string;
  exitCode: number;
}

export function runClaudeSubagent(
  agentName: string,
  prompt: string,
  options: { timeout?: number } = {}
): SubagentResult {
  const timeout = options.timeout ?? 300000;
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\$/g, "\\$");

  try {
    const output = execSync(
      `claude --agent "${agentName}" --print "${escapedPrompt}"`,
      {
        encoding: "utf-8",
        maxBuffer: 5 * 1024 * 1024,
        timeout,
      }
    );
    return { output, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; status?: number };
    return {
      output: error.stdout ?? String(err),
      exitCode: error.status ?? 1,
    };
  }
}
