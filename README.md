# Agent Debate

A multi-agent orchestration tool that coordinates AI agents to **debate**, **implement**, and **review** code changes from your project tickets. Three debate agents argue over the best implementation approach, coding agents build it step by step, review agents verify each step, and a final review catches regressions and past mistakes.

**Bring your own tools.** Agent Debate is language-agnostic and tool-agnostic. It works with whatever project tracker, documentation platform, language, linter, and test runner your team already uses.

Built on the [Anthropic SDK](https://docs.anthropic.com/en/docs/sdks) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) subagents, with [LanceDB](https://lancedb.github.io/lancedb/) for semantic search over your team's history.

## How It Works

```
Ticket (Jira, Linear, GitHub Issues, etc.)
    │
    ▼
┌─────────────────────────────────────────────┐
│  Phase 1: Debate                            │
│                                             │
│  Architect ◄──► Pragmatist ◄──► Auditor     │
│                                             │
│  4 rounds of structured voting:             │
│  1. Architecture                            │
│  2. Approach per requirement                │
│  3. Risks & mitigations                     │
│  4. Step ordering                           │
│                                             │
│  Output: Implementation plan with           │
│  requirements traceability matrix           │
├─────────────────────────────────────────────┤
│  Phase 2: Code                              │
│                                             │
│  For each step:                             │
│  Coding Agent ──► Review Agent              │
│       ▲               │                     │
│       └── Fix ◄── Changes requested?        │
│                                             │
│  Max 3 review cycles per step,              │
│  then escalates to you                      │
├─────────────────────────────────────────────┤
│  Phase 3: Final Review                      │
│                                             │
│  Pass 1: Your quality gates (configurable)  │
│  Pass 2: Judgment review                    │
│    - Requirements coverage check            │
│    - Corrections log match detection        │
│    - Auditor dissent resolution check       │
│                                             │
│  Output: Final report with actionable items │
└─────────────────────────────────────────────┘
```

## The Three Debate Agents

| Agent | Role | Perspective |
|---|---|---|
| **Architect** | System design | Data flow, layer boundaries, API contracts, migration safety |
| **Pragmatist** | Simplicity | Reuse existing patterns, minimize complexity, ship fast |
| **Auditor** | Risk prevention | Past mistakes, corrections log, error handling gaps, test coverage |

All requirements from your ticket and linked documents are treated as **fixed scope**. The agents debate *how* to implement — never *whether* to implement. Every requirement must appear in the final plan.

### Structured Voting

Each debate round follows the same process:

1. All three agents independently propose their position (parallel)
2. Each agent sees the other two positions
3. Each agent votes: **agree**, **disagree + counter**, or **amend**
4. Majority wins. Dissents are logged and tracked through implementation.

After each round, the orchestrator runs a **requirements coverage check** to ensure nothing has been missed.

## Vector Database

Agent Debate uses LanceDB to build a semantic memory of your team's history. This makes the Auditor smarter over time.

| Collection | What's Stored | When It's Indexed | Who Uses It |
|---|---|---|---|
| `corrections` | Past mistakes from your corrections log | `seed` command or pipeline start | Auditor during debate |
| `code-patterns` | Naming, error handling, test patterns | `seed --code` or during init | All debate agents |
| `review-history` | Review outcomes per implementation step | After each successful step | Auditor in future runs |
| `docs` | Document/spike content (chunked) | When fetching during pipeline run | Debate agents via search |

Instead of dumping your entire corrections log into the Auditor's context, the vector DB does semantic search to find only the *relevant* past mistakes for the current ticket. This scales as your history grows.

## Prerequisites

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`claude` command available)
- **Anthropic API key** set as `ANTHROPIC_API_KEY` environment variable

## Installation

### As a Claude Code Plugin (Recommended)

Add the marketplace and install:

```bash
/plugin marketplace add boomdoinksoda/agent-debate
/plugin install agent-debate@agent-debate-marketplace
```

Then use it:

```bash
/agent-debate PROJ-12345
```

The first run will automatically install dependencies and offer to run the init flow.

### From Source

If you prefer to clone and hack on it:

```bash
git clone https://github.com/boomdoinksoda/agent-debate.git
cd agent-debate
npm install
```

## Setup

### 1. Configure Your Agents

If installed as a plugin, the `/agent-debate` skill handles setup automatically on first run. To run setup manually:

```bash
# Plugin install
/agent-debate init

# From source
npx tsx src/index.ts init
```

This walks you through configuring an agent for each role in the pipeline:

```
Agent Debate — Setup

Configure an agent for each role in the pipeline.

--- Role 1/4: coder ---
  Writes implementation code

  A) Use an existing Claude Code agent
  B) Create from code reference (repo, PRs, branch)
  C) Create from description
  D) Skip (use default)

  Choice [A/B/C/D]:
```

For each role you choose independently:

- **Option A** — Select from your existing Claude Code agents (scans `~/.claude/agents/`)
- **Option B** — Point at a GitHub repo, PR author, or local code directory. The tool analyzes the code for patterns (naming, error handling, file organization, test structure) and generates an agent persona from what it observes.
- **Option C** — Describe the coding style you want in plain English. The tool generates an agent persona from your description.
- **Option D** — Use the generic default.

### 2. Configure Your Tools

Edit `agent-config.json` to tell Agent Debate how to fetch tickets and docs from your tools, and what quality gates to run.

**Ticket source** — works with Jira, Linear, GitHub Issues, Notion databases, or anything reachable via CLI:

```json
{
  "sources": {
    "tickets": {
      "provider": "cli",
      "fetchCommand": "claude --print \"Fetch the Jira ticket $TICKET_KEY. Return ONLY JSON with fields: key, summary, description, acceptanceCriteria (string[]), linkedDocs (URL[]), subtasks ({key, summary}[]). No markdown.\""
    }
  }
}
```

**Doc source** — works with Confluence, Notion, Obsidian (local files), Google Docs, or any URL:

```json
{
  "sources": {
    "docs": {
      "provider": "cli",
      "fetchCommand": "claude --print \"Fetch the document at $DOC_URL. Return ONLY JSON with fields: title, url, content. No markdown.\""
    }
  }
}
```

**Quality gates** — configure whatever linters, formatters, and test runners your project uses:

```json
{
  "qualityGates": [
    { "name": "lint", "command": "npm run lint" },
    { "name": "test", "command": "npm test" },
    { "name": "typecheck", "command": "npx tsc --noEmit" }
  ]
}
```

<details>
<summary>Example configs for different stacks</summary>

**Go:**
```json
{
  "qualityGates": [
    { "name": "fmt", "command": "gofmt -l $FILES" },
    { "name": "vet", "command": "go vet ./..." },
    { "name": "test", "command": "go test -race ./..." }
  ]
}
```

**Ruby:**
```json
{
  "qualityGates": [
    { "name": "rubocop", "command": "bundle exec rubocop" },
    { "name": "rspec", "command": "bundle exec rspec" }
  ]
}
```

**Python:**
```json
{
  "qualityGates": [
    { "name": "ruff", "command": "ruff check ." },
    { "name": "mypy", "command": "mypy ." },
    { "name": "pytest", "command": "pytest" }
  ]
}
```

**TypeScript/React:**
```json
{
  "qualityGates": [
    { "name": "eslint", "command": "npx eslint ." },
    { "name": "typecheck", "command": "npx tsc --noEmit" },
    { "name": "test", "command": "npx vitest run" }
  ]
}
```

**Frontend E2E:**
```json
{
  "qualityGates": [
    { "name": "lint", "command": "npm run lint" },
    { "name": "unit", "command": "npm test" },
    { "name": "e2e", "command": "npx cypress run" }
  ]
}
```

</details>

### 3. Seed the Vector Database (Optional)

If you have an existing corrections log or a codebase you want the agents to learn from:

```bash
# Index your corrections/mistakes log
npx tsx src/index.ts seed --corrections path/to/corrections-log.md

# Analyze a codebase for patterns
npx tsx src/index.ts seed --code path/to/your/project/src/

# Both at once
npx tsx src/index.ts seed --corrections corrections-log.md --code ../my-project/src/
```

The vector DB is stored in `.agent-debate-db/` (gitignored by default).

### 4. Customize Debate Personas (Optional)

The three debate personas live in `personas/`. Edit them to match your team's priorities:

- `personas/architect.md` — What architectural concerns matter most to your team?
- `personas/pragmatist.md` — What does "simple" mean in your codebase?
- `personas/auditor.md` — What categories of mistakes does your team make?

Each file has YAML frontmatter and a system prompt body:

```markdown
---
name: auditor
role: debater:auditor
perspective: Past mistakes, risk flags, corrections log, known pitfalls
---

You are the Auditor. Your job is to prevent the team from repeating past mistakes.
...
```

## Usage

### Full Pipeline

Run the complete debate -> code -> review pipeline:

```bash
# As plugin
/agent-debate PROJ-12345

# From source
npx tsx src/index.ts run PROJ-12345
```

The orchestrator will:
1. Fetch the ticket and any linked documents
2. Extract all requirements
3. Run 4 debate rounds with structured voting
4. Present the implementation plan for your approval
5. Execute each step with coding + review loops
6. Run your configured quality gates
7. Run the judgment review (corrections log, requirements coverage, dissent check)
8. Present the final report

### Debate Only

Generate an implementation plan without executing it:

```bash
npx tsx src/index.ts run PROJ-12345 --debate-only
```

### Dry Run

See what would happen without making any API calls:

```bash
npx tsx src/index.ts run PROJ-12345 --dry-run
```

## Claude Code Plugin

Agent Debate is distributed as a Claude Code plugin. Once installed via the marketplace, the `/agent-debate` slash command is available in all your projects.

```bash
# Add the marketplace (one-time)
/plugin marketplace add boomdoinksoda/agent-debate

# Install the plugin (one-time)
/plugin install agent-debate@agent-debate-marketplace

# Use it
/agent-debate PROJ-12345
```

## Project Structure

```
agent-debate/
├── .claude-plugin/
│   ├── plugin.json            # Plugin manifest
│   └── marketplace.json       # Marketplace definition
├── skills/
│   └── agent-debate/
│       └── SKILL.md           # Slash command definition
├── agent-config.json          # Your tool and agent config
├── personas/                  # Debate agent persona definitions
│   ├── architect.md
│   ├── pragmatist.md
│   └── auditor.md
├── src/
│   ├── index.ts               # CLI entry point (init, run, seed)
│   ├── init.ts                # Interactive agent onboarding
│   ├── orchestrator.ts        # Main pipeline coordinator
│   ├── seed.ts                # Vector DB seeding
│   ├── config.ts              # Configuration loader
│   ├── types.ts               # Shared TypeScript types
│   ├── agents/
│   │   ├── agent-scanner.ts   # Scans for existing Claude Code agents
│   │   ├── agent-generator.ts # Generates personas from code/descriptions
│   │   ├── cli-agent.ts       # Claude Code CLI subagent wrapper
│   │   └── persona-loader.ts  # Loads persona markdown files
│   ├── debate/
│   │   ├── round.ts           # Single debate round logic
│   │   ├── voting.ts          # Vote collection and synthesis
│   │   └── coverage.ts        # Requirements coverage checking
│   ├── coding/
│   │   ├── step-runner.ts     # Per-step implement -> review loop
│   │   └── quality-gates.ts   # Runs your configured quality checks
│   ├── review/
│   │   └── final-review.ts    # Two-pass final review
│   ├── parsers/
│   │   ├── jira.ts            # Ticket fetching (configurable source)
│   │   ├── confluence.ts      # Doc fetching (configurable source)
│   │   └── requirements.ts    # Requirements extraction and traceability
│   └── vectordb/
│       ├── embeddings.ts      # Text -> vector embedding generation
│       ├── store.ts           # LanceDB read/write operations
│       └── collections.ts     # Collection-specific indexing and search
├── package.json
└── tsconfig.json
```

## How the Review Loop Works

For each implementation step, the orchestrator runs a tight loop:

1. **Coding agent** implements the step with full context (acceptance criteria, auditor warnings, requirements mapping)
2. **Review agent** checks the diff against acceptance criteria, quality gates, and auditor warnings
3. If approved -> commit and move to next step
4. If changes requested -> coding agent fixes, review agent re-reviews
5. After 3 cycles with no approval -> escalates to you

The review agent is stateless — fresh context on every invocation, preventing drift.

## Escalation

The orchestrator halts and asks for your input when:

- A coding agent fails to produce working code
- A review loop hits 3 cycles without approval
- A step's changes break a previous step's tests
- The final review finds uncovered requirements

It will never silently push through a failure.

## Configuration Reference

### agent-config.json

| Field | Description | Default |
|---|---|---|
| `roles.coder` | Claude Code agent for writing code | `default-coder` |
| `roles.reviewer:correctness` | Agent for correctness reviews | `default-reviewer` |
| `roles.reviewer:style` | Agent for style reviews | `default-reviewer` |
| `roles.reviewer:patterns` | Agent for pattern reviews (final) | `default-reviewer` |
| `personas.debater:*` | Path to debate persona markdown files | `personas/*.md` |
| `sources.tickets` | How to fetch tickets (`$TICKET_KEY` is replaced) | Claude auto-detect |
| `sources.docs` | How to fetch documents (`$DOC_URL` is replaced) | Claude auto-detect |
| `qualityGates` | Array of `{name, command}` checks to run | `[]` (none) |
| `settings.maxDebateRounds` | Number of debate rounds | `4` |
| `settings.maxReviewCycles` | Max review attempts per step | `3` |
| `settings.correctionsLogPath` | Path to corrections/mistakes log | `corrections-log.md` |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | API key for the Anthropic SDK (debate agents) |
| `PROJECT_ROOT` | No | Override the working directory for quality gates |

## Contributing

Contributions welcome. If you build custom debate personas, add quality gate presets for new languages, or integrate with additional project management tools, consider opening a PR.

## License

MIT
