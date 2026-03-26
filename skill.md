---
name: agent-debate
description: Run the multi-agent debate orchestrator for a Jira ticket. Coordinates debate agents to plan implementation, coding agents to build, and review agents to verify.
---

# Agent Debate Orchestrator

Run the full debate -> code -> review pipeline for a Jira ticket.

## Usage

The user provides a Jira ticket key. The skill:

1. Fetches the ticket, linked Confluence spikes, and ADRs
2. Runs three debate agents (Architect, Pragmatist, Auditor) to create an implementation plan
3. Presents the plan for user approval
4. On approval, executes each step with coding + review loops
5. Runs final quality gates and corrections-log review
6. Presents the final report

## Execution

Run the orchestrator:

```bash
cd agent-debate && npx tsx src/index.ts run <TICKET_KEY>
```

For debate-only (no coding):
```bash
cd agent-debate && npx tsx src/index.ts run <TICKET_KEY> --debate-only
```

## After Debate

Present the implementation plan to the user and ask for approval before proceeding to the coding phase. If the user requests changes to the plan, re-run with adjusted parameters.

## After Completion

Present the final review report. If there are uncovered requirements, corrections-log matches, or unresolved Auditor dissents, flag them prominently for the user.
