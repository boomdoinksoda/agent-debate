---
name: agent-debate
description: Run the multi-agent debate orchestrator for a Jira ticket. Coordinates debate agents to plan implementation, coding agents to build, and review agents to verify.
---

# Agent Debate Orchestrator

Run the full debate -> code -> review pipeline for a Jira ticket.

## Arguments

The user provides a Jira ticket key as `$ARGUMENTS`. If no arguments are provided, ask the user for a ticket key.

## First Run Setup

Before running the orchestrator, check if dependencies are installed:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && [ -d node_modules ] || npm install
```

If `agent-config.json` has not been customized (roles still show `default-coder`), offer to run the init flow:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts init
```

## Execution

### Debate Only (recommended first)

Run the debate phase and present the plan for approval:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts run $ARGUMENTS --debate-only
```

Present the implementation plan to the user. Ask: "Approve this plan and proceed to coding, or adjust?"

### Full Pipeline

On approval, run the full pipeline:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && npx tsx src/index.ts run $ARGUMENTS
```

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
