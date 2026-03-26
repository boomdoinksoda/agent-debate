import { execSync } from "child_process";
import type { Requirement, AgentConfig } from "../types.js";

export interface Ticket {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  linkedDocs: string[];
  subtasks: { key: string; summary: string }[];
}

/**
 * Fetch a ticket using the configured source provider.
 * Works with Jira, Linear, GitHub Issues, Notion, or any tool
 * reachable via the CLI command configured in agent-config.json.
 */
export async function fetchTicket(
  ticketKey: string,
  config: AgentConfig
): Promise<Ticket> {
  const sourceConfig = config.sources?.tickets;
  let command: string;

  if (sourceConfig?.fetchCommand) {
    command = sourceConfig.fetchCommand.replace("$TICKET_KEY", ticketKey);
  } else {
    // Default: ask Claude to figure it out via available tools
    command = `claude --print "Fetch the ticket ${ticketKey}. Return ONLY a JSON object with fields: key, summary, description, acceptanceCriteria (array of strings), linkedDocs (array of URLs), subtasks (array of {key, summary}). No markdown formatting, just raw JSON."`;
  }

  const result = execSync(command, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
    timeout: 60000,
  });

  return JSON.parse(result.trim()) as Ticket;
}

export function extractRequirementsFromTicket(
  ticket: Ticket
): Requirement[] {
  const requirements: Requirement[] = [];

  if (ticket.description) {
    requirements.push({
      id: `ticket:${ticket.key}:desc`,
      source: "jira",
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
    });
  }

  for (const sub of ticket.subtasks) {
    requirements.push({
      id: `ticket:${sub.key}`,
      source: "jira",
      description: sub.summary,
      acceptanceCriteria: [],
    });
  }

  return requirements;
}
