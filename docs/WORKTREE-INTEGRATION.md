# Git Worktree Integration — conductor v1.0.5+

## Overview

Claude Conductor now supports isolated git worktrees for parallel agent dispatches. This prevents file conflicts when multiple agents modify the same codebase simultaneously.

## Architecture

### Components

1. **worktree-manager.js** (`hooks/`)
   - Core module for worktree lifecycle
   - Zero dependencies (Node.js built-ins only)
   - Exports: `createWorktree()`, `removeWorktree()`, `listWorktrees()`, `pruneWorktrees()`, `getWorktreeEnv()`

2. **CLI Scripts** (`scripts/`)
   - `worktree-create.js` — Create a new worktree
   - `worktree-cleanup.js` — Remove a worktree
   - `worktree-list.js` — List active worktrees
   - `worktree-prune.js` — Prune orphaned worktrees

3. **Hooks**
   - `cleanup-worktrees.js` — SessionStop hook for automatic cleanup
   - `hooks.json` — Updated to register cleanup hook

4. **Commands**
   - `/conductor:dispatch ... --worktree` — Dispatch with isolation
   - `/conductor:worktree <command>` — Manage worktrees manually

## Usage

### Automatic (Recommended)

Dispatch with `--worktree` flag:

```
/conductor:dispatch matos "Refactor auth module" --worktree
```

The system will:
1. Create `.worktrees/matos-<timestamp>/`
2. Inject `CONDUCTOR_WORKTREE_PATH` into the agent prompt
3. Clean up automatically after dispatch (SessionStop hook)

### Manual

Create a worktree explicitly:

```bash
node scripts/worktree-create.js my-agent
# Output: /project/.worktrees/my-agent-1719384625
#         CONDUCTOR_WORKTREE_PATH=/project/.worktrees/my-agent-1719384625
```

List active worktrees:

```bash
node scripts/worktree-list.js
```

Clean up when done:

```bash
node scripts/worktree-cleanup.js my-agent
```

Prune orphaned worktrees:

```bash
node scripts/worktree-prune.js
```

## Implementation Details

### Worktree Location

```
project-root/
├── .git/
├── .worktrees/                  ← conductor worktrees directory
│   ├── matos-1719384625/        ← agent worktree (detached HEAD)
│   └── janus-1719384631/        ← another agent worktree
├── .conductor-worktrees.json    ← registry of created worktrees
└── src/
```

### Environment Variable

The dispatch prompt receives:

```
CONDUCTOR_WORKTREE_PATH=/absolute/path/to/.worktrees/agent-<timestamp>
```

Agents can access the main project root via:

```javascript
const mainRoot = path.join(process.env.CONDUCTOR_WORKTREE_PATH, '..');
```

### Git State

Each worktree:
- Points to the same git object database (`.git` symlink)
- Is checked out at detached HEAD (current branch's HEAD)
- Can have independent working tree changes
- Prevents ref conflicts (each ref can only be checked out in one worktree)

### Cleanup Strategy

Worktrees are cleaned up in this order:

1. **After dispatch** — SessionStop hook calls `pruneWorktrees()` (automatic)
2. **Manual cleanup** — `worktree-cleanup.js <agent>` (explicit)
3. **Bulk prune** — `worktree-prune.js` (removes all orphaned)

### Registry File

`.conductor-worktrees.json` tracks created worktrees:

```json
{
  "worktrees": [
    {
      "agentName": "matos",
      "path": "/home/user/project/.worktrees/matos-1719384625",
      "timestamp": 1719384625,
      "created": "2026-06-20T10:30:25.000Z"
    }
  ]
}
```

## Error Handling

### Git Not Available
```
Error: Git not available or not a git repository
```
Ensure git is installed and project is a git repo.

### Worktree Already Checked Out
```
Error: failed to create worktree: pathspec is already checked out elsewhere
```
The branch is checked out in another worktree. Clean up that worktree first.

### Permission Denied
```
Error: EACCES: permission denied
```
Check file system permissions on the project directory.

## Performance Impact

- **Creation**: ~50-100ms per worktree (git worktree add)
- **Cleanup**: ~30-50ms per worktree (git worktree remove + prune)
- **Disk space**: ~5-10% per worktree (shares git objects, copies working tree)

## Limitations

1. **No nesting**: Worktrees cannot contain other worktrees
2. **Same git objects**: All worktrees share the same `.git/objects` database
3. **Branch conflicts**: A branch can only be checked out in one worktree
4. **Windows paths**: Normalized to forward slashes in environment variables

## Examples

### Sequential Dispatches with Isolation

```
/conductor:dispatch matos "Phase 1: Setup" --worktree
# matos finishes, worktree cleaned up

/conductor:dispatch matos "Phase 2: Build" --worktree
# new worktree created, matos continues work
```

### Parallel Dispatches (True Isolation)

```bash
# Terminal 1
/conductor:dispatch matos "Refactor auth" --worktree &

# Terminal 2
/conductor:dispatch janus "Update UI" --worktree &

# Terminal 3
/conductor:dispatch theia "Update specs" --worktree &

# Each agent gets isolated .worktrees/agent-<ts>/ directory
# No merge conflicts when changes are committed
```

### Emergency Cleanup

```bash
# If sessions crash and leave orphaned worktrees:
node scripts/worktree-prune.js
```

## Future Enhancements

- **Worktree pool**: Pre-create N worktrees for fast dispatch
- **Auto-merge**: After dispatch, auto-merge worktree changes to main tree
- **Conflict detection**: Warn if worktree touches same files as concurrent dispatches
- **Storage quotas**: Limit total worktree disk usage
- **Metrics**: Track worktree creation/deletion/storage in conductior telemetry

## References

- Git worktrees: https://git-scm.com/docs/git-worktree
- Claude Conductor: https://github.com/SolSolis-Sys/claude-conductor
- P-DELEGATE rule: Agents work in isolation, changes committed locally first
