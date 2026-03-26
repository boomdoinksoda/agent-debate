import { resolve } from "path";
import { indexCorrectionsLog, indexCodePatterns } from "./vectordb/collections.js";
import { listCollections } from "./vectordb/store.js";
import { execSync } from "child_process";

interface SeedOptions {
  corrections?: string;
  code?: string;
}

export async function runSeed(options: SeedOptions): Promise<void> {
  const projectRoot = process.cwd();

  console.log("\nAgent Debate — Seed Vector DB\n");

  // Index corrections log
  if (options.corrections) {
    console.log(`Indexing corrections log: ${options.corrections}`);
    const count = await indexCorrectionsLog(projectRoot, options.corrections);
    console.log(`  Indexed ${count} correction entries`);
  }

  // Analyze and index code patterns
  if (options.code) {
    console.log(`Analyzing code patterns: ${options.code}`);
    const patterns = await analyzeCodePatterns(options.code);
    const count = await indexCodePatterns(projectRoot, patterns);
    console.log(`  Indexed ${count} code patterns`);
  }

  // Show what's in the store
  const collections = await listCollections(projectRoot);
  console.log(`\nVector DB collections: ${collections.join(", ") || "(empty)"}`);
  console.log("Seed complete.\n");
}

async function analyzeCodePatterns(
  codePath: string
): Promise<
  { id: string; pattern: string; example: string; source: string }[]
> {
  const absPath = resolve(process.cwd(), codePath);

  const prompt = `Analyze the Go code at "${absPath}" and extract coding patterns. For each pattern found, return a JSON array of objects with fields:
- id: short kebab-case identifier
- pattern: name of the pattern (e.g., "handler-structure", "error-handling", "test-factory")
- example: a brief code example or description
- source: the file path where this pattern was observed

Return ONLY the JSON array, no markdown.`;

  try {
    const result = execSync(
      `claude --print "${prompt.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 120000,
      }
    );

    return JSON.parse(result.trim()) as {
      id: string;
      pattern: string;
      example: string;
      source: string;
    }[];
  } catch {
    console.log("  Could not analyze code patterns automatically");
    return [];
  }
}
