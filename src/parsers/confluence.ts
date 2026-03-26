import { execSync } from "child_process";
import type { Requirement, AgentConfig } from "../types.js";

export interface DocPage {
  title: string;
  url: string;
  content: string;
}

/**
 * Fetch a document page using the configured source provider.
 * Works with Confluence, Notion, Obsidian (via local files),
 * Google Docs, or any tool reachable via CLI.
 */
export async function fetchDocPage(
  url: string,
  config: AgentConfig
): Promise<DocPage> {
  const sourceConfig = config.sources?.docs;
  let command: string;

  if (sourceConfig?.fetchCommand) {
    command = sourceConfig.fetchCommand.replace("$DOC_URL", url);
  } else {
    command = `claude --print "Fetch the document at ${url}. Return ONLY a JSON object with fields: title, url, content (the full text content of the page). No markdown formatting, just raw JSON."`;
  }

  const result = execSync(command, {
    encoding: "utf-8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60000,
  });

  return JSON.parse(result.trim()) as DocPage;
}

export function extractRequirementsFromDoc(
  page: DocPage
): Requirement[] {
  const result = execSync(
    `claude --print "Extract all requirements from this document. Return a JSON array of objects with fields: id (short slug), description (one sentence), acceptanceCriteria (array of strings). Document:\n\n${page.content.replace(/"/g, '\\"').slice(0, 10000)}"`,
    { encoding: "utf-8", maxBuffer: 1024 * 1024, timeout: 60000 }
  );

  const parsed = JSON.parse(result.trim()) as Array<{
    id: string;
    description: string;
    acceptanceCriteria: string[];
  }>;

  return parsed.map((r) => ({
    id: `doc:${r.id}`,
    source: "confluence" as const,
    description: r.description,
    acceptanceCriteria: r.acceptanceCriteria,
  }));
}
