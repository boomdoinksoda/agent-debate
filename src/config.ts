import { readFile } from "fs/promises";
import { resolve } from "path";
import type { AgentConfig } from "./types.js";

const CONFIG_FILENAME = "agent-config.json";

export async function loadConfig(projectRoot: string): Promise<AgentConfig> {
  const configPath = resolve(projectRoot, CONFIG_FILENAME);
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as AgentConfig;
}

export function getProjectRoot(): string {
  return process.cwd();
}