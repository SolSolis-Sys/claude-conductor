---
description: "Display and manage session task tree. Use: /conductor:task-tree [add|done|run|fail|clear] [label]"
---

# /conductor:task-tree $ARGUMENTS

Track active tasks as a visual ASCII tree during your session.

## Usage

**Display current tree:**
```
/conductor:task-tree
```

**Add a task:**
```
/conductor:task-tree add "audit memorie-active"
```

**Update status:**
```
/conductor:task-tree done "audit memorie-active"
/conductor:task-tree run "hub submit implementation"
/conductor:task-tree fail "relay integration"
```

**Clear all tasks (end of session):**
```
/conductor:task-tree clear
```

## Example output

```
Session tasks
├── ✓ [done   ] audit memorie-active
├── ✓ [done   ] blueprint pre-push-cohesion-check
├── ◎ [running] hub submit implementation
└── ○ [pending] gate out

```

## Auto-registration with /conductor:dispatch

When you dispatch a task, manually add it to the tree:

```
/conductor:task-tree add "matos → Auth refactor"
/conductor:dispatch matos "Auth refactor"
/conductor:task-tree run "matos → Auth refactor"
```

On completion:
```
/conductor:task-tree done "matos → Auth refactor"
```

Or if the dispatch fails:
```
/conductor:task-tree fail "matos → Auth refactor"
```

## Status icons and meanings

| Icon | Status | Meaning |
|------|--------|---------|
| ○ | `pending` | Not yet started |
| ◎ | `running` | In progress |
| ✓ | `done` | Completed successfully |
| ✗ | `failed` | Failed or blocked |

## Storage

Tasks persist to `~/.claude/conductor/task-tree.json` between prompts in the same session.

Use `/conductor:task-tree clear` to reset the tree at the end of a session.

## Examples

### Multi-task session

```bash
/conductor:task-tree add "dispatch audit on memorie-active"
/conductor:task-tree add "run security-reviewer on plugin.json"
/conductor:task-tree add "conduct pre-push cohesion check"
/conductor:task-tree add "gate out and archive session"

/conductor:task-tree  # Show current state

# After audit completes:
/conductor:task-tree done "dispatch audit on memorie-active"
/conductor:task-tree run "run security-reviewer on plugin.json"

# ... later ...
/conductor:task-tree done "run security-reviewer on plugin.json"
```

### Dispatch tracking

```bash
# Start dispatch
/conductor:task-tree add "matos → refactor auth module"
/conductor:dispatch matos "Refactor auth module"
/conductor:task-tree run "matos → refactor auth module"

# Agent returns with result
/conductor:task-tree done "matos → refactor auth module"
```

## Troubleshooting

**Task not found error**

If you see `Task '<label>' not found.`, ensure:
- The label matches exactly (case-sensitive)
- Quotes are consistent
- Use the full label including agent prefix if you used it

**Task tree looks empty**

The file persists in `~/.claude/conductor/task-tree.json`. Check:
- Current session has no tasks yet (add some!)
- If you cleared the tree earlier, use `add` to recreate tasks
