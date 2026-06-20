---
description: "Manage git worktree isolation for parallel agent dispatches. Use: /conductor:worktree <command>"
---

# /conductor:worktree $ARGUMENTS

Manage git worktree isolation for parallel multi-agent dispatches.

## Overview

When multiple agents modify files in parallel, conflicts arise if they share the same working directory. Git worktrees provide isolated filesystems for each agent, preventing interference.

## Commands

### list
```
/conductor:worktree list
```
List all active worktrees created by conductor.

Output format:
```
Worktree: .worktrees/agent-name-<timestamp>
  Branch: <branch-name>
  Detached: true/false
  Prunable: true/false
```

### create
```
/conductor:worktree create <agent-name>
```
Create an isolated worktree for a specific agent.

Returns the absolute path to the worktree root.

**Example output**:
```
Worktree created: /home/user/project/.worktrees/matos-1719384625
Branch: main (detached)
```

### cleanup
```
/conductor:worktree cleanup <agent-name>
```
Remove a worktree after the agent dispatch completes.

**Example output**:
```
Worktree removed: /home/user/project/.worktrees/matos-1719384625
Pruned 1 worktree(s)
```

### prune
```
/conductor:worktree prune
```
Remove all orphaned worktrees (no working tree / broken references).

**Example output**:
```
Pruned 3 orphaned worktree(s)
```

## Integration with /conductor:dispatch

When dispatching with `--worktree`, the system automatically:

1. **Creates** an isolated worktree: `.worktrees/<agent>-<timestamp>`
2. **Injects** the worktree path into the agent prompt: `WORKTREE_PATH=/path/to/.worktrees/agent-<timestamp>`
3. **Schedules** cleanup after dispatch completes (via SessionStop hook or manual call)

### Dispatch with Worktree Example

```
/conductor:dispatch agent=matos task="Refactor Python module" --worktree
```

The dispatch prompt will include:

```
**Worktree Isolation**:
This dispatch runs in an isolated git worktree:
  WORKTREE_PATH: /home/user/project/.worktrees/matos-1719384625

All file modifications should be made within this directory.
After dispatch, the worktree will be automatically cleaned up.
```

## Use Cases

### Parallel refactoring
Multiple agents refactoring different modules simultaneously without conflicts.

```
/conductor:dispatch agent=matos task="Refactor auth module" --worktree &
/conductor:dispatch agent=janus task="Refactor UI components" --worktree &
/conductor:dispatch agent=theia task="Refactor spec docs" --worktree &
```

### Isolated experimentation
Test breaking changes in isolation without affecting the main tree.

```
/conductor:worktree create experimenter
# Agent experiments in .worktrees/experimenter-<ts>
/conductor:worktree cleanup experimenter
```

### Feature branch isolation
Each feature branch gets its own worktree, cleanly separated.

```
/conductor:worktree create feature-x
# Agent works on feature in isolation
git worktree prune  # cleanup after feature complete
```

## Cleanup Rules

Worktrees are automatically cleaned up:
- **After dispatch**: SessionStop hook removes the worktree
- **Manual cleanup**: Call `/conductor:worktree cleanup <agent>`
- **Bulk prune**: `/conductor:worktree prune` removes orphaned worktrees

## Limitations

- Git must be initialized in the project root
- Worktrees cannot be nested
- Each worktree points to the same git object database (ref: `git worktree` documentation)
- Windows paths use forward slashes in environment variables for compatibility

## Troubleshooting

### Worktree is "prunable"
```
/conductor:worktree prune
```
Removes worktrees with missing working trees.

### Cannot create worktree: "already checked out"
A ref is already checked out in another worktree. List active worktrees:
```
/conductor:worktree list
```
Then cleanup the conflicting one before retrying.

### Git command not found
Ensure `git` is installed and in PATH. Worktree operations are disabled if git is unavailable.

## Technical Details

- **Storage**: `.worktrees/` directory in project root
- **Naming**: `<agent>-<unix-timestamp>` format
- **Branch**: Detached HEAD at current commit (default behavior)
- **Reference**: Uses symbolic-ref to track across sessions

When cleanup is called:
1. Switch away from worktree
2. Run `git worktree remove .worktrees/<path>`
3. Prune orphaned references: `git worktree prune`
