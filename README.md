# claude-conductor

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Claude%20Code-blue.svg)](https://claude.ai/code)
[![Plugin](https://img.shields.io/badge/type-plugin-red.svg)](https://docs.anthropic.com/claude-code)

> Orchestration primitives for multi-agent Claude Code workflows.

A Claude Code plugin that provides structured patterns for dispatching agents, auditing codebases, running autonomous loops, and maintaining an agent registry.

---

## Why conductor?

- **Stop reinventing dispatch prompts** — every multi-agent workflow needs identity overrides, path exclusions, and tools checklists. Conductor generates them for you.
- **Registry-aware recommendations** — scans your actual `~/.claude/agents/` and recommends the right agent for each task rather than guessing.
- **Proven loop patterns** — `loop-until-count`, `loop-until-dry`, and `loop-until-budget` cover the three most common autonomous workflows without boilerplate.

---

## What it does

| Primitive | Description |
|-----------|-------------|
| **Agent registry** | Scans `~/.claude/agents/` and generates `conductor-registry.yaml` with names, descriptions, and models |
| **Dispatch templates** | Structured prompts with identity overrides, path exclusions, and tools checklists |
| **Audit pattern** | 3-perspective parallel Explore agents with synthesis |
| **Loop patterns** | `loop-until-count` / `loop-until-dry` / `loop-until-budget` for autonomous workflows |

---

## Commands

| Command | Description |
|---------|-------------|
| `/conductor:scan-agents` | Scan agent directories → generate `~/.claude/conductor-registry.yaml` |
| `/conductor:dispatch <task>` | Generate a structured dispatch prompt with registry recommendations |
| `/conductor:audit <target>` | Run 3-perspective parallel audit on a path or codebase |
| `/conductor:loop <pattern>` | Reference loop patterns (count / dry / budget) |

> **Windows note:** `~/.claude/` resolves to `C:/Users/<username>/.claude/`. On non-Bash shells (cmd.exe), resolve the path via `$env:USERPROFILE/.claude/` instead.

---

## Skills (auto-invoked)

- **orchestration-patterns** — guides agent dispatch decisions (workflow vs Agent tool vs parallel calls)
- **agent-registry** — reads registry to recommend the right agent for a task

---

## Installation

```bash
claude plugin marketplace add https://github.com/SolSolis-Sys/claude-conductor
claude plugin install claude-conductor
```

Then **restart Claude Code** to activate the plugin.

### Local development / testing

```bash
git clone https://github.com/SolSolis-Sys/claude-conductor
claude --plugin-dir ./claude-conductor
```

Use `/reload-plugins` inside a Claude Code session to reload without restarting.

> **Windows note:** `~/.claude/` resolves to `C:/Users/<username>/.claude/`. On non-Bash shells (cmd.exe), resolve the path via `$env:USERPROFILE/.claude/` instead.

---

## Quick start

**Step 1 — Build your registry**

```
/conductor:scan-agents
```

Scans `~/.claude/agents/` and writes `~/.claude/conductor-registry.yaml` with every agent's name, description, and model.

**Step 2 — Dispatch a task**

```
/conductor:dispatch refactor the authentication module
```

Conductor reads the registry, picks the best-fit agents, and generates a dispatch prompt with identity overrides and path exclusions already filled in.

**Step 3 — Run a parallel audit**

```
/conductor:audit ./src
```

Launches three Explore agents in parallel (security, performance, maintainability perspectives) and synthesizes findings into a single report.

---

## License

MIT — [SolSolis-Sys](https://github.com/SolSolis-Sys)
