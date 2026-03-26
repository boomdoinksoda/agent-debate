import { readdir, readFile } from "fs/promises";
import { resolve, join } from "path";
import { homedir } from "os";

export interface FoundAgent {
  name: string;
  description: string;
  path: string;
}

export async function scanForAgents(): Promise<FoundAgent[]> {
  const agents: FoundAgent[] = [];

  const globalDir = resolve(homedir(), ".claude", "agents");
  agents.push(...(await scanDirectory(globalDir)));

  const projectDir = resolve(process.cwd(), ".claude", "agents");
  agents.push(...(await scanDirectory(projectDir)));

  return agents;
}

async function scanDirectory(dir: string): Promise<FoundAgent[]> {
  const agents: FoundAgent[] = [];
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const fullPath = join(dir, file);
      const content = await readFile(fullPath, "utf-8");
      const name = extractField(content, "name") ?? file.replace(".md", "");
      const description =
        extractField(content, "description")?.slice(0, 100) ?? "";
      agents.push({ name, description, path: fullPath });
    }
  } catch {
    // Directory doesn't exist, skip
  }
  return agents;
}

function extractField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}