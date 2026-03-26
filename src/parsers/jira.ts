import { execSync } from "child_process";
import type { Requirement } from "../types.js";

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  linkedConfluencePages: string[];
  linkedADRs: string[];
  subtasks: { key: string; summary: string }[];
}

export async function fetchJiraTicket(ticketKey: string): Promise<JiraTicket> {
  const result = execSync(
    `claude --print "Fetch the Jira ticket ${ticketKey}. Return ONLY a JSON object with fields: key, summary, description, acceptanceCriteria (array of strings), linkedConfluencePages (array of URLs), linkedADRs (array of URLs), subtasks (array of {key, summary}). No markdown formatting, just raw JSON."`,
    { encoding: "utf-8", maxBuffer: 1024 * 1024, timeout: 60000 }
  );

  return JSON.parse(result.trim()) as JiraTicket;
}

export function extractRequirementsFromTicket(
  ticket: JiraTicket
): Requirement[] {
  const requirements: Requirement[] = [];

  if (ticket.description) {
    requirements.push({
      id: `jira:${ticket.key}:desc`,
      source: "jira",
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
    });
  }

  for (const sub of ticket.subtasks) {
    requirements.push({
      id: `jira:${sub.key}`,
      source: "jira",
      description: sub.summary,
      acceptanceCriteria: [],
    });
  }

  return requirements;
}
