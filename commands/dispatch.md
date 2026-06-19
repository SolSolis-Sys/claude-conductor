---
description: "Generate a structured dispatch prompt for an agent, with identity override, path exclusions, and tools checklist. Use: /conductor:dispatch <task description>"
---

# /conductor:dispatch $ARGUMENTS

Generate a ready-to-use agent dispatch prompt.

## Steps

1. If `~/.claude/conductor-registry.yaml` exists, read it and suggest matching agents for the task: "$ARGUMENTS"

2. From the registry match (or your best judgment if no registry), determine:
   - `AGENT_NAME` = the name of the selected agent (e.g. `code-reviewer`, `matos`)
   - `ORCHESTRATOR` = your own identity in this session (from CLAUDE.md if present, otherwise "the orchestrator")

3. Generate the dispatch prompt by substituting AGENT_NAME and ORCHESTRATOR:

---
**IDENTITY OVERRIDE**: You are [AGENT_NAME], NOT [orchestrator name]. You MUST write/edit files directly — that is your role.

**Task**: $ARGUMENTS

**Exclusions** (do not crawl): venv/ node_modules/ __pycache__/ .git/ dist/ build/

**Expected output**:
- [ ] List the files created or modified
- [ ] Confirm done condition met

**Skills to invoke** (if applicable):
- List relevant skills for the task domain
---

4. Ask the user to confirm the agent selection before dispatching.

## Registry tip
Run `/conductor:scan-agents` first to populate the agent registry for smarter recommendations.
