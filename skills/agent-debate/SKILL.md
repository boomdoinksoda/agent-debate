---
name: agent-debate
description: Run the multi-agent debate orchestrator for a ticket. Coordinates debate agents to plan implementation, coding agents to build, and review agents to verify.
---

# Agent Debate Orchestrator

Run the full debate -> code -> review pipeline for a project ticket.

## Arguments

The user provides a ticket key as `$ARGUMENTS`. If no arguments are provided, ask the user for a ticket key.

## First Run Setup

Before running the orchestrator, check if dependencies are installed:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && [ -d node_modules ] || npm install
```

Then read `${CLAUDE_PLUGIN_ROOT}/agent-config.json` to check if setup is needed. If roles still show `default-coder` or `default-reviewer`, run the **Conversational Init** below. Do NOT shell out to the init CLI — handle it conversationally.

### Conversational Init

Walk the user through all 4 setup steps as a conversation. Ask one question at a time. After each answer, update the config file directly.

**Step 1: Debate Personas (3 agents)**

For each persona (Architect, Pragmatist, Auditor), ask:

> **Persona: [Name]** — [description]
>
> A) Use the default persona
> B) Create from a description (you describe the perspective)
> C) Create from code reference (analyze a repo or PRs)

- If A: keep the default path in `personas` config (`personas/architect.md`, etc.)
- If B: ask them to describe the perspective, then generate a persona markdown file at `${CLAUDE_PLUGIN_ROOT}/personas/` using Claude, and update config
- If C: ask for a repo/path, analyze it, generate a persona file, update config

**Step 2: Execution Agents (4 roles)**

For each role (coder, reviewer:correctness, reviewer:style, reviewer:patterns), ask:

> **Role: [name]** — [description]
>
> A) Use an existing Claude Code agent
> B) Create from code reference
> C) Create from description
> D) Skip (use default)

- If A: scan `~/.claude/agents/` for `.md` files, list them by name, let user pick by number. Multiple roles can be assigned in one answer (e.g., "1, 2, and 3" assigns them in order to remaining roles).
- If B/C: generate a persona and save it
- If D: leave as default

**Step 3: Quality Gates**

Ask:

> What language/stack does your project use? This determines which linters, formatters, and test runners run after each implementation step.
>
> 1) Go (gofmt, go vet, go test)
> 2) TypeScript (eslint, tsc, vitest)
> 3) Python (ruff, mypy, pytest)
> 4) Ruby (rubocop, rspec)
> 5) Node (npm run lint, npm test)
> 6) Custom (enter your own commands)
> 7) Skip (no quality gates)

If custom, ask for each gate: name and command. Save to `qualityGates` array in config.

**Step 4: Ticket & Doc Sources**

Ask:

> Where do you track tickets?
>
> A) Jira
> B) Linear
> C) GitHub Issues
> D) Custom command
> E) Auto-detect (let Claude figure it out)

Then ask:

> Where is your documentation?
>
> A) Confluence
> B) Notion
> C) Local files (Obsidian, markdown)
> D) Custom command
> E) Auto-detect

Save the appropriate fetch commands to `sources` in config.

**After all steps**, write the final config to `${CLAUDE_PLUGIN_ROOT}/agent-config.json` and show a summary of what was configured.

## Execution

After setup is complete (or if config is already configured):

### Step 1: Fetch context using MCP tools

The orchestrator subprocess cannot access authenticated services (Jira, Confluence, etc.) because MCP tools only work in this session. So YOU must fetch the ticket and docs first, then pass them to the orchestrator via a context file.

1. Use available MCP tools (Atlassian, GitHub, etc.) to fetch the ticket details for `$ARGUMENTS`
2. If the ticket has linked documents (Confluence pages, Notion pages, etc.), fetch those too
3. Write everything to a JSON file at `/tmp/agent-debate-context.json` with this structure:

```json
{
  "ticket": {
    "key": "PROJ-123",
    "summary": "...",
    "description": "...",
    "acceptanceCriteria": ["..."],
    "linkedDocs": ["url1", "url2"],
    "subtasks": [{"key": "PROJ-124", "summary": "..."}]
  },
  "docs": [
    {"title": "Spike: ...", "url": "...", "content": "full text..."}
  ]
}
```

### Step 2: Run the orchestrator with context file

For debate-only (recommended first):

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts run $ARGUMENTS --debate-only --context-file /tmp/agent-debate-context.json
```

For the full pipeline:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts run $ARGUMENTS --context-file /tmp/agent-debate-context.json
```

Present the implementation plan to the user. Ask: "Approve this plan and proceed to coding, or adjust?"

### Seed Vector DB

If the user wants to seed their corrections log or code patterns:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts seed --corrections <path> --code <path>
```

## After Completion

Present the final review report. Flag prominently:
- Uncovered requirements
- Corrections log matches
- Unresolved Auditor dissents

Ask the user if they want to commit the changes.
