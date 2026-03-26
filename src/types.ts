// --- Agent Roles ---

export type DebaterRole =
  | "debater:architect"
  | "debater:pragmatist"
  | "debater:auditor";
export type CoderRole = "coder";
export type ReviewerRole =
  | "reviewer:correctness"
  | "reviewer:style"
  | "reviewer:patterns";
export type AgentRole = DebaterRole | CoderRole | ReviewerRole;

// --- Configuration ---

export interface AgentConfig {
  roles: Record<string, string>;
  personas?: Record<string, string>;
  sources?: {
    tickets?: { provider: string; fetchCommand: string };
    docs?: { provider: string; fetchCommand: string };
  };
  qualityGates?: { name: string; command: string }[];
  settings?: {
    maxDebateRounds?: number;
    maxReviewCycles?: number;
    correctionsLogPath?: string;
  };
}

export interface PersonaConfig {
  name: string;
  perspective: string;
  systemPrompt: string;
}

// --- Requirements ---

export interface Requirement {
  id: string;
  source: "jira" | "confluence" | "adr";
  description: string;
  acceptanceCriteria: string[];
}

export interface RequirementsTraceability {
  requirements: Requirement[];
  stepMapping: Record<string, string[]>;
}

// --- Debate ---

export type VoteType = "agree" | "disagree" | "amend";

export interface Position {
  agent: DebaterRole;
  content: string;
  reasoning: string;
}

export interface Vote {
  agent: DebaterRole;
  vote: VoteType;
  counter?: string;
}

export interface RoundDecision {
  topic: string;
  positions: Position[];
  votes: Vote[];
  outcome: string;
  dissents: string[];
}

export interface DebateOutput {
  decisions: RoundDecision[];
  implementationSteps: ImplementationStep[];
  traceability: RequirementsTraceability;
  auditorWarnings: string[];
}

// --- Implementation Steps ---

export interface ImplementationStep {
  id: string;
  title: string;
  description: string;
  filesToTouch: string[];
  acceptanceCriteria: string[];
  relevantWarnings: string[];
  requirementIds: string[];
}

// --- Review ---

export type ReviewVerdict = "approve" | "request_changes";

export interface ReviewResult {
  verdict: ReviewVerdict;
  items: ReviewItem[];
}

export interface ReviewItem {
  severity: "blocker" | "suggestion" | "nit";
  file: string;
  line?: number;
  message: string;
}

// --- Pipeline State ---

export interface PipelineState {
  ticketKey: string;
  phase: "debate" | "coding" | "final-review" | "complete";
  currentStep: number;
  totalSteps: number;
  debateOutput?: DebateOutput;
  completedSteps: string[];
  requirementsCovered: string[];
}
