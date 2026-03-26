import { execSync } from "child_process";
import type { Requirement } from "../types.js";

export interface ConfluencePage {
  title: string;
  url: string;
  content: string;
}

export async function fetchConfluencePage(
  url: string
): Promise<ConfluencePage> {
  const result = execSync(
    `claude --print "Fetch the Confluence page at ${url}. Return ONLY a JSON object with fields: title, url, content (the full text content of the page). No markdown formatting, just raw JSON."`,
    { encoding: "utf-8", maxBuffer: 2 * 1024 * 1024, timeout: 60000 }
  );

  return JSON.parse(result.trim()) as ConfluencePage;
}

export function extractRequirementsFromSpike(
  page: ConfluencePage
): Requirement[] {
  const result = execSync(
    `claude --print "Extract all requirements from this spike document. Return a JSON array of objects with fields: id (short slug), description (one sentence), acceptanceCriteria (array of strings). Document:\n\n${page.content.replace(/"/g, '\\"').slice(0, 10000)}"`,
    { encoding: "utf-8", maxBuffer: 1024 * 1024, timeout: 60000 }
  );

  const parsed = JSON.parse(result.trim()) as Array<{
    id: string;
    description: string;
    acceptanceCriteria: string[];
  }>;

  return parsed.map((r) => ({
    id: `confluence:${r.id}`,
    source: "confluence" as const,
    description: r.description,
    acceptanceCriteria: r.acceptanceCriteria,
  }));
}