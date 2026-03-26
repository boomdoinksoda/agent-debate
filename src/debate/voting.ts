import Anthropic from "@anthropic-ai/sdk";
import type {
  DebaterRole,
  Position,
  Vote,
  VoteType,
  PersonaConfig,
} from "../types.js";
import type { DebateContext } from "./round.js";

const client = new Anthropic();

export async function collectVotes(
  roles: DebaterRole[],
  personas: Map<DebaterRole, PersonaConfig>,
  topic: string,
  positions: Position[],
  context: DebateContext
): Promise<Vote[]> {
  return Promise.all(
    roles.map((role) =>
      getVote(role, personas.get(role)!, topic, positions, context)
    )
  );
}

async function getVote(
  role: DebaterRole,
  persona: PersonaConfig,
  topic: string,
  positions: Position[],
  _context: DebateContext
): Promise<Vote> {
  const otherPositions = positions
    .filter((p) => p.agent !== role)
    .map((p) => `### ${p.agent}\n${p.content}`)
    .join("\n\n");

  const myPosition = positions.find((p) => p.agent === role)!;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: persona.systemPrompt,
    messages: [
      {
        role: "user",
        content: `## Topic: ${topic}

## Your position:
${myPosition.content}

## Other positions:
${otherPositions}

## Vote

After seeing the other positions, cast your vote. Respond with EXACTLY this JSON format:
{
  "vote": "agree" | "disagree" | "amend",
  "counter": "If disagree or amend, explain what should change and why. If agree, leave empty."
}

Vote "agree" if you think the collective positions cover the topic well.
Vote "amend" if you'd adjust specific parts but the direction is right.
Vote "disagree" if you think there's a fundamental issue with the proposed approach.`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(content) as {
      vote: VoteType;
      counter?: string;
    };
    return { agent: role, vote: parsed.vote, counter: parsed.counter };
  } catch {
    const voteMatch = content.match(/"vote":\s*"(agree|disagree|amend)"/);
    return {
      agent: role,
      vote: (voteMatch?.[1] as VoteType) ?? "agree",
      counter: content,
    };
  }
}

export function synthesizeOutcome(
  positions: Position[],
  votes: Vote[]
): { decision: string; dissents: string[] } {
  const agrees = votes.filter((v) => v.vote === "agree");
  const amends = votes.filter((v) => v.vote === "amend");
  const disagrees = votes.filter((v) => v.vote === "disagree");

  const dissents: string[] = [];
  for (const v of [...disagrees, ...amends]) {
    if (v.counter) {
      dissents.push(`${v.agent}: ${v.counter}`);
    }
  }

  if (agrees.length >= 2) {
    return {
      decision: positions.map((p) => p.content).join("\n\n---\n\n"),
      dissents,
    };
  }

  if (amends.length >= 2) {
    const amendments = amends.map((a) => a.counter).filter(Boolean);
    return {
      decision:
        positions.map((p) => p.content).join("\n\n---\n\n") +
        "\n\n## Amendments\n" +
        amendments.join("\n"),
      dissents,
    };
  }

  return {
    decision:
      "FORCED SYNTHESIS (no majority)\n\n" +
      positions.map((p) => `### ${p.agent}\n${p.content}`).join("\n\n") +
      "\n\n### Counters\n" +
      votes
        .filter((v) => v.counter)
        .map((v) => `- ${v.agent}: ${v.counter}`)
        .join("\n"),
    dissents,
  };
}