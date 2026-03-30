#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./init.js";
import { runOrchestrator } from "./orchestrator.js";
import { runSeed } from "./seed.js";

const program = new Command();

program
  .name("agent-debate")
  .description("Multi-agent debate orchestrator for implementation planning")
  .version("0.1.0");

program
  .command("init")
  .description("Set up agent personas and role mappings")
  .action(runInit);

program
  .command("run <ticketKey>")
  .description(
    "Run the full debate -> code -> review pipeline for a Jira ticket"
  )
  .option("--debate-only", "Stop after debate phase, output the plan")
  .option("--dry-run", "Show what would happen without executing")
  .option(
    "--context-file <path>",
    "Path to pre-fetched context JSON (skip ticket/doc fetching)"
  )
  .action(runOrchestrator);

program
  .command("seed")
  .description("Index corrections log and code patterns into the vector DB")
  .option(
    "--corrections <path>",
    "Path to corrections log",
    "corrections-log.md"
  )
  .option("--code <path>", "Path to code directory to analyze for patterns")
  .action(runSeed);

program.parse();