---
description: Scan all Claude Code agent directories and generate a conductor-registry.yaml with agent names, descriptions, and configured models.
---

# /conductor:scan-agents

Scan agent directories and generate the conductor registry.

## What this command does

1. Scans these directories for `.md` agent files:
   - `~/.claude/agents/` (user-level agents)
   - `.claude/agents/` (project-level agents, if present)

2. For each agent, extracts from frontmatter:
   - `name` (or filename without .md)
   - `description`
   - `model` (optional — only if explicitly declared)

3. Writes `~/.claude/conductor-registry.yaml`

## Steps to execute

Read all `.md` files in `~/.claude/agents/` and `.claude/agents/` (if exists).
If `~/.claude/agents/` does not exist, record `count: 0` for that source and continue without error.
If `.claude/agents/` (project-level) does not exist, record `count: 0` and continue.
For each file, parse the YAML frontmatter between `---` delimiters.
Extract: name (from frontmatter `name:` or filename), description, model (if present).
Write the registry to `~/.claude/conductor-registry.yaml`.

Format:
```yaml
generated: YYYY-MM-DD
sources:
  - path: ~/.claude/agents/
    count: N
  - path: .claude/agents/
    count: N
agents:
  - name: agent-name
    description: "extracted description"
    model: model-id  # only if present in frontmatter
```

Report how many agents were found and where the registry was written.
