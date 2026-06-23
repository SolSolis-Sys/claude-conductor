---
description: "Display and manage hierarchical session task tree. Use: /conductor:task-tree [add|add-child|done|run|fail|clear] [args]"
---

# /conductor:task-tree $ARGUMENTS

Track active tasks as a hierarchical visual tree during your session.
Tasks persist to `~/.claude/conductor/task-tree.json` across prompts.

## Usage

**Display current tree:**
```
/conductor:task-tree
```

**Add a root task:**
```
/conductor:task-tree add "audit memorie-active"
```

**Add a subtask to a parent (by id):**
```
/conductor:task-tree add-child 1 "subtask A"
/conductor:task-tree add-child 1 "subtask B"
```

**Update status (by numeric id or legacy label):**
```
/conductor:task-tree done 1
/conductor:task-tree run 2
/conductor:task-tree fail 3
```

**Clear all tasks (end of session):**
```
/conductor:task-tree clear
```

## Example output

```
Session tasks
[○]  1 — audit memorie-active
  [●]  2 — subtask A
  [○]  3 — subtask B
[○]  4 — gate out

```

Icons: `○` pending · `◎` running · `●` done · `✗` failed

## Data model

Each task: `{ id, label, status, ts, children: [] }`

IDs are auto-increment integers (1, 2, 3…) stored in the JSON.
Children can be nested to any depth.

## Backward compatibility

- `add <label>` — unchanged
- `done <label>` — still works by label (fallback after id lookup fails)
- `clear` — unchanged

## Auto-registration with /conductor:dispatch

```
/conductor:task-tree add "matos → Auth refactor"
/conductor:dispatch matos "Auth refactor"
/conductor:task-tree run 1

# Add sub-tasks as work is broken down:
/conductor:task-tree add-child 1 "write tests"
/conductor:task-tree add-child 1 "refactor service"

# On completion:
/conductor:task-tree done 2
/conductor:task-tree done 3
/conductor:task-tree done 1
```

## Status icons and meanings

| Icon | Status | Meaning |
|------|--------|---------|
| ○ | `pending` | Not yet started |
| ◎ | `running` | In progress |
| ● | `done` | Completed successfully |
| ✗ | `failed` | Failed or blocked |

## Storage

Tasks persist to `~/.claude/conductor/task-tree.json` across prompts.
Directory is created automatically if absent.

Format:
```json
{
  "nextId": 4,
  "tasks": [
    {
      "id": 1,
      "label": "audit memorie-active",
      "status": "pending",
      "ts": "2026-06-23T10:00:00.000Z",
      "children": [
        { "id": 2, "label": "subtask A", "status": "done", "ts": "...", "children": [] }
      ]
    }
  ]
}
```

Use `/conductor:task-tree clear` to reset the tree at the end of a session.
