# claude-conductor


> Multi-agent orchestration plugin for Claude Code — dispatch agents, run parallel audits, manage blueprints, and automate context cleanup.

![Version](https://img.shields.io/badge/version-1.0.4-blue)
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
- **Metrics integration** — reads token-watch data to suggest `/compact` at 90% context
- **Zero dependencies** — pure Node.js built-ins only

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
```

Blueprints are saved to `~/.claude/conductor/blueprints/` after install.

## Blueprint Registry

Browse, search and install community blueprints at:
**[conductor-blueprints hub →](https://solsolis-sys.github.io/conductor-blueprints/)**

Click **Install** on any blueprint to copy its URL, then reference it in your workflow.

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
