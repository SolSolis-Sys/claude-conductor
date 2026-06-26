# claude-conductor

[![CI](https://github.com/SolSolis-Sys/claude-conductor/actions/workflows/ci.yml/badge.svg)](https://github.com/SolSolis-Sys/claude-conductor/actions/workflows/ci.yml)

> Multi-agent orchestration plugin for Claude Code — dispatch agents, run parallel audits, manage blueprints, and automate context cleanup.

![Version](https://img.shields.io/badge/version-0.1.10-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

> 🌐 Hub live → https://solsolis-sys.github.io/conductor-blueprints/

> ⚠️ **Alpha — work in progress. Use at your own risk.** Expect rough edges. Found a bug or have a suggestion? Please [open an issue]
> **Not affiliated with Anthropic.** This is an independent, unofficial tool — not a product of or endorsed by Anthropic.

---

## Features

- **Agent registry** — scans `~/.claude/agents/` and generates a YAML catalog with names, descriptions, and models
- **Dispatch templates** — structured prompts with identity overrides, path exclusions, and tools checklists generated automatically
- **Parallel audit** — 3-perspective parallel Explore agents (security, performance, maintainability) with a synthesized report
- **Loop patterns** — `loop-until-count`, `loop-until-dry`, `loop-until-budget` for autonomous workflows without boilerplate
- **Blueprint hub** — install and run community orchestration patterns from `conductor-blueprints`
- **Blueprint submission** — `hub submit <path>` validates a local blueprint and opens a GitHub Issue for community review
- **Agent scoring** — static keyword scoring recommends the top-3 agents for any task description
- **Metrics integration** — reads token-watch data to suggest `/compact` at 90% context
- **Calendar** — inter-session agenda with autonomous event injection (Stop hook) and 5-minute throttle
- **Zero dependencies** — pure Node.js built-ins only

## Library (lib/)

The core orchestration primitives are available as a reusable library:

- **`lib/coercion.js`** — Coerce agent config (agents[], skills[]) into deterministic gates[] (10 rules, pure function, zero-dependency)
- **`lib/validator.js`** — JSON Schema draft-07 validation hand-rolled (zero-dependency, supports type/required/properties/enum/min/max)
- **`lib/runner.js`** — Blueprint execution engine (loadBlueprint, validateGates, dryRun, validateInterGate, validateLoop)
- **`lib/on-fail.js`** — on_fail engine (stop/retry/fallback/skip/log_only + on_exhausted pattern)
- **`lib/tool-registry.js`** — Tool gates registry (write_file, read_file, update_context, run_shell with whitelist, git_add, git_commit, git_stash)

## Install

### Via Claude Code marketplace (recommended)

```bash
claude plugin marketplace add https://github.com/SolSolis-Sys/claude-conductor
claude plugin install claude-conductor
```

Then restart Claude Code to activate the plugin.

### Local development

```bash
git clone https://github.com/SolSolis-Sys/claude-conductor
claude --plugin-dir ./claude-conductor
```

Use `/reload-plugins` inside a session to reload without restarting.

> **Windows:** `~/.claude/` resolves to `C:/Users/<username>/.claude/`. On cmd.exe, use `$env:USERPROFILE/.claude/` instead.

## Quick start

**1. Build your registry**

```
/conductor:scan-agents
```

Scans `~/.claude/agents/` and writes `~/.claude/conductor-registry.yaml`.

**2. Dispatch a task**

```
/conductor:dispatch refactor the authentication module
```

Conductor reads the registry, picks best-fit agents, and generates a dispatch prompt with identity overrides and path exclusions already filled in.

**3. Run a parallel audit**

```
/conductor:audit ./src
```

Launches three Explore agents in parallel and synthesizes findings into a single report.

## Commands

| Command | Description |
|---------|-------------|
| `/conductor:scan-agents` | Scan agent directories → generate `~/.claude/conductor-registry.yaml` |
| `/conductor:dispatch <task>` | Generate a structured dispatch prompt with registry recommendations |
| `/conductor:audit <target>` | Run 3-perspective parallel audit on a path or codebase |
| `/conductor:loop <pattern>` | Reference loop patterns (count / dry / budget) |

## Hub Commands

```bash
# List all available blueprints
conductor hub list

# Search blueprints by keyword or tag
conductor hub search tdd

# Install a blueprint locally
conductor hub install tdd-bug-hunter

# Get details on a blueprint
conductor hub info adversarial-review

# Submit a blueprint to the community registry
conductor hub submit ./my-blueprint/
```

Blueprints are saved to `~/.claude/conductor/blueprints/` after install.

## Interactive Hub Commands

Two interactive modes are available for users who prefer a guided experience.

### `conductor hub discover`

An interactive assistant that helps you find the right blueprint when you're not sure where to start. It asks what you're trying to accomplish, groups blueprints by category, and offers to install your pick in one step.

```
$ conductor hub discover

Conductor Hub Discovery

What would you like to do?
  1. Audit or review code
  2. Test & fix bugs
  3. Plan & spec features
  4. Deploy or verify infrastructure
  5. Improve skills or configuration
  6. Other (browse by category)

Choice (1-6): 3

Recommended blueprint: idea-to-spec
   Description: Turn a raw idea into a structured spec with agent review
   Tags: planning, spec, agents
   Cost tier: low

Install? (y/n): y

conductor hub: blueprint 'idea-to-spec' v1.0.0 installed
Location: /home/user/.claude/conductor/blueprints/idea-to-spec/blueprint.json
```

Choosing option 6 lists every blueprint by number so you can browse freely.

### `conductor hub submit --interactive`

A step-by-step wizard for submitting a blueprint you've built. It reads your local `blueprint.json`, validates it, collects a short description and category, then opens a GitHub Issue in the community registry on your behalf.

Requires the [gh CLI](https://cli.github.com/) to be installed and authenticated (`gh auth login`).

```
$ conductor hub submit --interactive

Blueprint Submission Wizard

Blueprint name (e.g., my-blueprint): my-review-flow
Path to blueprint.json (or directory): ./my-review-flow/

Description (short): Multi-agent code review with security and perf passes

Category:
  1. code
  2. test
  3. docs
  4. ops
  5. other
Choice (1-5): 1

Blueprint 'my-review-flow' v1.0.0 submitted
Issue: https://github.com/SolSolis-Sys/conductor-blueprints/issues/42
```

The wizard validates required fields (`name`, `version`, `agents`) before submitting. If anything is missing it prints the error and exits without creating an issue.

## Blueprint Registry

Browse, search and install community blueprints at:
**[conductor-blueprints hub →](https://solsolis-sys.github.io/conductor-blueprints/)**

Click **Install** on any blueprint to copy its URL, then reference it in your workflow.

## Calendar (v0.1.11)

Track work events across sessions. Events are stored in `~/.claude/conductor-calendar/agenda.json` and injected automatically as a system message at each session close (Stop hook) when events are within 2 hours.

**Agenda file** (managed by hooks — direct editing supported):
```json
{
  "version": "1.0",
  "events": [
    {
      "id": "<uuid>",
      "title": "Sprint planning",
      "start": "2026-06-27T10:00:00Z",
      "done": false,
      "tags": ["project"]
    }
  ]
}
```

**Automatic behaviors:**
- **SessionStart** — creates `~/.claude/conductor-calendar/` and `agenda.json` if absent (idempotent)
- **Stop** — injects upcoming events (2h window, max 2) as system message; throttled to once per 5 minutes; auto-prunes done + events older than 24h

**Commands** — available in v0.1.12 (Phase 1):
- `/conductor:calendar:add "<title>" "<ISO8601>"` — add event
- `/conductor:calendar:list [today|week|all]` — list events
- `/conductor:calendar:done <id>` — mark event done

## Context Guard

When used alongside [claude-token-watch](https://github.com/SolSolis-Sys/claude-token-watch), conductor reads the live metrics file (`~/.claude/token-watch/metrics.json`) and emits a `/compact` advisory when:

- Context window exceeds 90%
- 5h quota exceeds 90%

Install both plugins for full autonomous monitoring.

## Ecosystem

- **[claude-token-watch](https://github.com/SolSolis-Sys/claude-token-watch)** — token monitoring, required for context guard feature
- **[conductor-blueprints](https://github.com/SolSolis-Sys/conductor-blueprints)** — community blueprint registry

## Prompt for your AI agent

```
Please install the claude-conductor plugin for Claude Code.
1. Run: claude plugin marketplace add https://github.com/SolSolis-Sys/claude-conductor
2. Then: claude plugin install claude-conductor
3. Optionally install claude-token-watch for context monitoring integration.
4. Restart Claude Code. Run: conductor hub list  to verify.
```

---

*Built with [Claude](https://claude.ai) (Anthropic) — AI pair programming.*

## License

MIT © [SolSolis-Sys](https://github.com/SolSolis-Sys)
