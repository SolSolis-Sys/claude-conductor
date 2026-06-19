---
description: Guides agent dispatch decisions — when to use workflow scripts vs Agent tool vs parallel calls. Auto-invoked when orchestrating multiple agents, planning dispatch, or choosing between execution patterns.
---

# Orchestration Patterns

## Overview

This skill guides dispatch decisions for multi-agent Claude Code workflows. Apply it when deciding how to break work across agents, whether to run them in parallel or sequentially, and which execution primitive to use.

## When to Use `workflow` (Workflow Tool)

Use the `workflow` tool when:
- The task involves more than 5 agents
- Control flow is deterministic (loops, conditional branches, pipeline stages)
- Structured output is required via a `schema` option
- The orchestration must be isolated from the current session context

Default to `pipeline()` for sequential stages. Use `parallel()` only when a real synchronization barrier is needed — not just because tasks are independent.

## When to Use `Agent` Tool Directly

Use the `Agent` tool when:
- Running a single task or 2–4 independent agents
- Immediate output is required in the current session
- The overhead of a workflow script is not warranted

For parallel execution: send N `Agent` tool calls in a single message. The runtime executes them concurrently.

## Canonical Dispatch Pattern

Before dispatching any agent, work through these four checks:

1. **Independence check** — Are tasks truly independent (parallel) or does output A feed input B (sequential)? Choose accordingly.
2. **Identity check** — Every dispatched agent must have an explicit `subagent_type`. Never dispatch to `general-purpose` without a specific identity override.
3. **Exclusion check** — The dispatch prompt must explicitly exclude heavy directories: `venv/`, `node_modules/`, `__pycache__/`, `.git/`, `dist/`, `build/`. Without this, agents crawl recursively and saturate tool calls.
4. **Return format** — Specify the expected output: files created/modified, done condition, confidence score.

## Parallel vs Sequential Decision Table

| Scenario | Pattern |
|----------|---------|
| Tasks share no state | Parallel — N Agent calls in 1 message |
| Task B needs Task A output | Sequential — chain with `&&` or stage dependency |
| >5 agents, structured output | `workflow` tool with `pipeline()` |
| Loop until condition met | `workflow` tool with loop construct |
| Single agent, result needed now | Direct `Agent` call, foreground |

## Anti-Patterns

- **Sequential when parallel is possible** — wastes wall-clock time with no benefit.
- **`workflow` for atomic tasks** — adds overhead with no gain; use `Agent` tool directly.
- **Dispatch without `subagent_type`** — agent inherits orchestrator identity, applies orchestrator rules (e.g. "never edit production files") to itself, and returns zero deliverables.
- **No path exclusions** — agents crawl `node_modules/` or `venv/` and exhaust tool call budgets before reaching the actual target.
- **Missing done condition** — no way to detect silent failures (agent returns 0 writes).

## Verifying Agent Output

After every agent returns, apply these checks before proceeding:

1. Count `Write`/`Edit` calls in the returned summary. If 0 — treat as a silent failure, not a success.
2. Spot-read a key output file to confirm physical existence.
3. Assign a confidence score (1–10). Score < 5 → re-escalate immediately; do not proceed to the next stage.

## Using the Agent Registry

If `/conductor:scan-agents` has been run, `~/.claude/conductor-registry.yaml` lists all available agents with their descriptions and configured models. Read this file before dispatching to choose the best-fit agent rather than guessing.

## Additional Resources

Invoke `/conductor:dispatch <task>` to generate a ready-to-use structured dispatch prompt including identity override, path exclusions, and a done-condition checklist.
