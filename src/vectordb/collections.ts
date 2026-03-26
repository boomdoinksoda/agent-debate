import { readFile } from "fs/promises";
import { resolve } from "path";
import { addToStore, searchStore, type SearchResult } from "./store.js";

// --- Collection Names ---

export const COLLECTIONS = {
  CORRECTIONS: "corrections",
  CODE_PATTERNS: "code-patterns",
  REVIEW_HISTORY: "review-history",
  SPIKES: "spikes",
} as const;

// --- Corrections Log ---

interface CorrectionEntry {
  date: string;
  category: string;
  mistake: string;
  rootCause: string;
  rule: string;
}

/**
 * Parse and embed the corrections log into the vector store.
 * Each entry becomes a separate searchable record.
 */
export async function indexCorrectionsLog(
  projectRoot: string,
  logPath: string
): Promise<number> {
  const fullPath = resolve(projectRoot, logPath);
  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return 0;
  }

  const entries = parseCorrectionsLog(content);
  if (entries.length === 0) return 0;

  const items = entries.map((entry, i) => ({
    id: `correction-${i}-${entry.date}`,
    text: `[${entry.category}] ${entry.mistake}. Root cause: ${entry.rootCause}. Rule: ${entry.rule}`,
    metadata: {
      date: entry.date,
      category: entry.category,
      mistake: entry.mistake,
      rootCause: entry.rootCause,
      rule: entry.rule,
    },
  }));

  await addToStore(projectRoot, COLLECTIONS.CORRECTIONS, items);
  return items.length;
}

function parseCorrectionsLog(content: string): CorrectionEntry[] {
  const entries: CorrectionEntry[] = [];
  const blocks = content.split(/\n(?=##\s|\n-\s*\*\*Date)/);

  for (const block of blocks) {
    const date = extractField(block, "Date") ?? "unknown";
    const category = extractField(block, "Category") ?? "unknown";
    const mistake = extractField(block, "Mistake") ?? block.trim();
    const rootCause = extractField(block, "Root [Cc]ause") ?? "";
    const rule = extractField(block, "Rule") ?? "";

    if (mistake && mistake !== block.trim()) {
      entries.push({ date, category, mistake, rootCause, rule });
    }
  }

  // If structured parsing found nothing, treat each paragraph as an entry
  if (entries.length === 0) {
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
    for (let i = 0; i < paragraphs.length; i++) {
      entries.push({
        date: "unknown",
        category: "general",
        mistake: paragraphs[i].trim(),
        rootCause: "",
        rule: "",
      });
    }
  }

  return entries;
}

function extractField(block: string, fieldPattern: string): string | undefined {
  const regex = new RegExp(`\\*\\*${fieldPattern}\\*\\*:?\\s*(.+)`, "i");
  const match = block.match(regex);
  return match?.[1]?.trim();
}

// --- Code Patterns ---

/**
 * Index code patterns observed from a reference codebase.
 * Called during "create from code reference" in init.
 */
export async function indexCodePatterns(
  projectRoot: string,
  patterns: {
    id: string;
    pattern: string;
    example: string;
    source: string;
  }[]
): Promise<number> {
  const items = patterns.map((p) => ({
    id: `pattern-${p.id}`,
    text: `${p.pattern}: ${p.example}`,
    metadata: { source: p.source, pattern: p.pattern },
  }));

  await addToStore(projectRoot, COLLECTIONS.CODE_PATTERNS, items);
  return items.length;
}

// --- Review History ---

/**
 * Index the outcome of a review for future reference.
 * Called after each pipeline run completes.
 */
export async function indexReviewOutcome(
  projectRoot: string,
  outcome: {
    ticketKey: string;
    stepId: string;
    reviewerAgent: string;
    feedback: string;
    resolved: boolean;
  }
): Promise<void> {
  await addToStore(projectRoot, COLLECTIONS.REVIEW_HISTORY, [
    {
      id: `review-${outcome.ticketKey}-${outcome.stepId}`,
      text: `[${outcome.ticketKey}] Step ${outcome.stepId} reviewed by ${outcome.reviewerAgent}: ${outcome.feedback}`,
      metadata: outcome,
    },
  ]);
}

// --- Spikes ---

/**
 * Index spike/ADR content for future reference.
 */
export async function indexSpike(
  projectRoot: string,
  spike: { title: string; url: string; content: string }
): Promise<void> {
  // Split long content into chunks
  const chunks = chunkText(spike.content, 1500);

  const items = chunks.map((chunk, i) => ({
    id: `spike-${slugify(spike.title)}-${i}`,
    text: chunk,
    metadata: { title: spike.title, url: spike.url, chunk: i },
  }));

  await addToStore(projectRoot, COLLECTIONS.SPIKES, items);
}

// --- Search Helpers ---

/**
 * Find corrections relevant to a given context.
 */
export async function findRelevantCorrections(
  projectRoot: string,
  context: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return searchStore(projectRoot, COLLECTIONS.CORRECTIONS, context, limit);
}

/**
 * Find code patterns relevant to a given task.
 */
export async function findRelevantPatterns(
  projectRoot: string,
  context: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return searchStore(projectRoot, COLLECTIONS.CODE_PATTERNS, context, limit);
}

/**
 * Find past reviews relevant to a given area.
 */
export async function findRelevantReviews(
  projectRoot: string,
  context: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return searchStore(projectRoot, COLLECTIONS.REVIEW_HISTORY, context, limit);
}

/**
 * Find spike content relevant to a given topic.
 */
export async function findRelevantSpikes(
  projectRoot: string,
  context: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return searchStore(projectRoot, COLLECTIONS.SPIKES, context, limit);
}

// --- Utilities ---

function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += para + "\n\n";
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxLength)];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
