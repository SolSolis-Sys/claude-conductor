---
description: "Generate a structured dispatch prompt for an agent, with identity override, path exclusions, and tools checklist. Use: /conductor:dispatch <task description> [--worktree]"
---

# /conductor:dispatch $ARGUMENTS [--worktree]

Generate a ready-to-use agent dispatch prompt.

## Steps

1. If `~/.claude/conductor-registry.yaml` exists, read it and suggest matching agents for the task: "$ARGUMENTS"

2. From the registry match (or your best judgment if no registry), determine:
   - `AGENT_NAME` = the name of the selected agent (e.g. `code-reviewer`, `matos`)
   - `ORCHESTRATOR` = your own identity in this session (from CLAUDE.md if present, otherwise "the orchestrator")

3. Parse options:
   - If `--worktree` flag present:
     - Load `/hooks/worktree-manager.js` module
     - Call `createWorktree(AGENT_NAME)`
     - If successful: inject `CONDUCTOR_WORKTREE_PATH` environment variable into the dispatch
     - If failed: warn user and proceed without worktree isolation

4. Generate the dispatch prompt by substituting AGENT_NAME and ORCHESTRATOR:

---
**IDENTITY OVERRIDE**: You are [AGENT_NAME], NOT [orchestrator name]. You MUST write/edit files directly — that is your role.

**Task**: $ARGUMENTS

**Exclusions** (do not crawl): venv/ node_modules/ __pycache__/ .git/ dist/ build/

[WORKTREE SECTION — only if --worktree flag present]:
**Worktree Isolation**:
This dispatch runs in an isolated git worktree to prevent conflicts with parallel dispatches.
- Location: $CONDUCTOR_WORKTREE_PATH
- All file modifications must occur within this directory.
- After dispatch completes, this worktree will be automatically cleaned up.
- If you need the main project root, use: `path.join(process.env.CONDUCTOR_WORKTREE_PATH, '..')`

**Expected output**:
- [ ] List the files created or modified
- [ ] Confirm done condition met

**Skills to invoke** (if applicable):
- List relevant skills for the task domain
---

5. Ask the user to confirm the agent selection before dispatching.

## Examples

### Basic dispatch (no isolation)
```
/conductor:dispatch matos "Refactor auth module"
```

### Dispatch with worktree isolation
```
/conductor:dispatch matos "Refactor auth module" --worktree
```

When `--worktree` is used, the agent works in `.worktrees/matos-<timestamp>/` and changes are isolated from other concurrent dispatches.

### Parallel dispatches (with isolation)
```
/conductor:dispatch matos "Refactor auth" --worktree &
/conductor:dispatch janus "Update UI components" --worktree &
/conductor:dispatch theia "Update specs" --worktree &
```

Each agent gets its own isolated worktree, preventing merge conflicts.

## Registry tip
Run `/conductor:scan-agents` first to populate the agent registry for smarter recommendations.
