---
description: Guide step-by-step creation of a conductor blueprint: analyze workflow → generate blueprint.json → validate schema → create README.md → update catalog.json → submit PR. Use when a user wants to create and publish a new conductor blueprint.
origin: conductor-blueprints
tools: Read, Write, Edit, Bash, Glob, Grep
categorie: orchestration
version: 1.0.0
---

# Blueprint Creator

Guides the creation of a new conductor blueprint from workflow description to ready-to-submit PR.

## Process

### Step 1 — Analyze Workflow
Read user's workflow description. Extract:
- Number of agents needed (and their roles)
- Loop pattern (rounds, exit condition)
- Required inputs (user-provided variables)
- Cost estimate (low <10k tokens, medium 10-100k, high >100k)

### Step 2 — Generate blueprint.json
Follow schema: `https://raw.githubusercontent.com/SolSolis-Sys/conductor-blueprints/main/schemas/blueprint.v1.json`

Required fields: id (author/name), name, version, title, description, authors, inputs, cost_profile, permissions, agents, loop

Template reference: `conductor-blueprints/docs/CREATE-BLUEPRINT.md`

### Step 3 — Validate Schema
Check blueprint.json against blueprint.v1.json schema.
Verify: all required fields present, agent roles unique, exit_condition references valid agent role, cost_profile.tier matches token estimate.

### Step 4 — Create README.md
Required (by spec). Include:
- Title + 1-line description
- When to use (trigger conditions)
- Inputs table (name, type, required, description)
- Agent flow diagram (text ASCII)
- Cost estimate
- Example usage

### Step 5 — Update catalog.json
Add entry: { id, name, version, description, author, tags, cost_tier }
Bump catalog version (patch).

### Step 6 — Validate & Commit
Run: grep -r "SolSolis-Sys" blueprint.json (should be 0 hits for non-SolSolis blueprints)
Confirm: README.md exists, blueprint.json validates, catalog.json updated.

## Output Format

Return:
```
BLUEPRINT CREATED: <name>
├── blueprint.json ✓ (schema valid)
├── README.md ✓
└── catalog.json updated ✓
Cost tier: <low|medium|high>
Ready for: conductor hub install <raw-url>
```

## Anti-patterns
- Never create skills/ in conductor-blueprints (static public repo)
- Never hardcode SolSolis-Sys in user-contributed blueprints
- Never skip README.md (required by spec)
- Never set cost_tier without token estimate
