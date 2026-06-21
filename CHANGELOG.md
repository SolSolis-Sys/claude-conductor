# Changelog — Git Worktree Integration (Issue #1)

## [0.1.7] — 2026-06-21

### Changed
- Downgrade versioning to v0.x.y scheme

## [0.1.6] — 2026-06-20

### Added
- `conductor task-tree` — session task tracking with ASCII visual tree (closes #3)
  - Display current tree: `/conductor:task-tree`
  - Add task: `/conductor:task-tree add <label>`
  - Update status: `/conductor:task-tree done|run|fail <label>`
  - Clear tree: `/conductor:task-tree clear`
  - Persistent task list in `~/.claude/conductor/task-tree.json`
  - Statuses: pending (○) → running (◎) → done (✓) / failed (✗)
  - Zero external dependencies — Node.js built-ins only

## [1.0.6] — 2026-06-20

### Added
- `conductor hub submit <path>` — submit a local blueprint to the community registry via GitHub Issue
  - Validates blueprint.json locally before submission
  - Creates a labeled GitHub Issue with blueprint details and JSON
  - Requires `gh` CLI authentication
  - Supports both directory and direct blueprint.json paths

## Version 1.0.5 — 2026-06-20

### Feature: Git Worktree Isolation for Parallel Dispatches

Implements isolated git worktrees to enable true parallel multi-agent dispatches without file conflicts.

#### Changes

**New Files**

1. **`hooks/worktree-manager.js`** (407 lines)
   - Core module for worktree lifecycle management
   - Exports: `createWorktree()`, `removeWorktree()`, `listWorktrees()`, `pruneWorktrees()`, `getWorktreeEnv()`
   - Zero external dependencies (Node.js built-ins only)
   - Git availability checks and error handling

2. **`hooks/cleanup-worktrees.js`** (18 lines)
   - SessionStop hook for automatic cleanup
   - Prunes orphaned worktrees on session end
   - Silent failures to avoid hook crashes

3. **`scripts/worktree-create.js`** (27 lines)
   - CLI: Create isolated worktree for an agent
   - Usage: `node scripts/worktree-create.js <agent-name>`
   - Outputs path and environment variable

4. **`scripts/worktree-cleanup.js`** (26 lines)
   - CLI: Remove worktree after dispatch
   - Usage: `node scripts/worktree-cleanup.js <agent-name>`
   - Finds most recent worktree by agent name

5. **`scripts/worktree-list.js`** (40 lines)
   - CLI: List active conductor-managed worktrees
   - Usage: `node scripts/worktree-list.js`
   - Shows path, creation time, validity status

6. **`scripts/worktree-prune.js`** (27 lines)
   - CLI: Prune orphaned worktrees
   - Usage: `node scripts/worktree-prune.js`
   - Removes broken references

7. **`commands/worktree.md`** (180 lines)
   - Command documentation for `/conductor:worktree`
   - Covers: list, create, cleanup, prune subcommands
   - Use cases, troubleshooting, technical details

8. **`test/worktree-manager.test.js`** (106 lines)
   - Smoke tests for worktree-manager module
   - Tests: git availability, path handling, env formatting
   - Run: `node test/worktree-manager.test.js`

9. **`WORKTREE-INTEGRATION.md`** (220 lines)
   - Integration guide and architecture documentation
   - Component overview, CLI usage, examples
   - Performance metrics and troubleshooting

10. **`CHANGELOG-WORKTREE.md`** (this file)
    - Feature changelog and implementation summary

**Modified Files**

1. **`commands/dispatch.md`**
   - Added `[--worktree]` option to command signature
   - Step 3: Parse `--worktree` flag and create worktree if present
   - Added worktree section to dispatch prompt template
   - Added examples for dispatch with isolation

2. **`hooks/hooks.json`**
   - Added `cleanup-worktrees.js` to SessionStop hooks
   - Maintains execution order (metrics-poller first, cleanup last)

#### Architecture

```
.worktrees/
├── agent-1-<timestamp>/    (detached HEAD, isolated working tree)
├── agent-2-<timestamp>/
└── ...

.conductor-worktrees.json   (registry of created worktrees)
```

Environment variable injected into dispatch prompt:
```
CONDUCTOR_WORKTREE_PATH=/absolute/path/to/.worktrees/agent-<timestamp>
```

#### Workflow

1. User calls: `/conductor:dispatch agent=matos task="Refactor" --worktree`
2. Dispatch command loads `worktree-manager.js`
3. Creates `.worktrees/matos-1719384625/` at detached HEAD
4. Injects `CONDUCTOR_WORKTREE_PATH` into prompt
5. Agent works in isolated directory
6. SessionStop hook calls `pruneWorktrees()` automatically
7. Worktree removed and references cleaned up

#### Parallel Execution Example

```bash
/conductor:dispatch matos "Auth refactor" --worktree &
/conductor:dispatch janus "UI updates" --worktree &
/conductor:dispatch theia "Spec docs" --worktree &

# Each agent works in .worktrees/agent-<ts>/ without conflicts
# SessionStop cleanup removes all worktrees
```

#### Testing

```bash
# Unit tests
node test/worktree-manager.test.js

# Manual testing
node scripts/worktree-create.js test-agent
node scripts/worktree-list.js
node scripts/worktree-cleanup.js test-agent
node scripts/worktree-prune.js
```

#### Breaking Changes

None. Feature is opt-in with `--worktree` flag.

#### Dependencies

Zero new dependencies. Uses Node.js built-ins:
- `child_process.execSync` (git commands)
- `fs` (file operations)
- `path` (path resolution)
- `os` (home directory)

#### Performance

- Create worktree: ~50-100ms
- Remove worktree: ~30-50ms
- Disk overhead: ~5-10% per worktree (shared git objects)

#### Limitations

- Requires git to be installed and project to be a git repository
- Cannot nest worktrees
- Branch refs cannot be checked out in multiple worktrees simultaneously
- Windows paths normalized to forward slashes

#### Future Enhancements

- Worktree pooling for faster reuse
- Auto-merge after dispatch completion
- Conflict detection across concurrent worktrees
- Storage quotas and metrics
- Integration with conductor telemetry

#### References

- Issue #1: Git Worktree isolation per agent dispatch
- https://git-scm.com/docs/git-worktree
- P-DELEGATE rule: agents work in isolation
- R-CLEAN rule: no temporary files left behind
