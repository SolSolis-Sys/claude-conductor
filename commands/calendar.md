---
description: "Manage work agenda (add, list, mark done). Use: /conductor:calendar:add|list|done"
---

# /conductor:calendar $ARGUMENTS

Manage the inter-session work agenda stored at `~/.claude/conductor-calendar/agenda.json`.

## Sub-commands

### `calendar:add <title> <isoStart> [tags]`

Add an event to the agenda.

- `title` — event title (required, non-empty)
- `isoStart` — start datetime in ISO 8601 format (e.g. `2026-06-28T14:00:00Z`)
- `tags` — comma-separated tags, optional (e.g. `meeting,urgent`)

```
/conductor:calendar:add "Team standup" "2026-06-28T09:00:00Z" "meeting,daily"
```

Output:
```
✓ Event added: <uuid>
  Team standup @ 2026-06-28 09:00 (UTC)
  Tags: meeting, daily
```

Errors: `✗ Title required` · `✗ Invalid date: "..."`

---

### `calendar:list [today|week|all]`

List non-done events with optional time filter (default: `all`).

- `today` — events from 00:00 to 23:59 UTC today
- `week` — events from now to +7 days
- `all` — all non-done events (default)

```
/conductor:calendar:list week
```

Output: ASCII table with `ID (8 chars) | Start | Title | Tags`.

Empty state: `No events found for filter: <filter>`

---

### `calendar:done <eventId>`

Mark an event as done. Accepts full UUID or first 8 characters.

```
/conductor:calendar:done abc12345
```

Output:
```
✓ Marked done: Team standup (abc12345)
  Pruned N old events.
```

Error: `✗ Event not found: <id>` with hint to run `/calendar:list all`.

---

## Storage

Events are persisted at `~/.claude/conductor-calendar/agenda.json` (auto-created by the SessionStart hook).
The Stop hook automatically injects upcoming events (2h window) and prunes done/expired events.
