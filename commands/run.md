---
name: run
description: Execute an installed blueprint or display its execution plan
---

Execute a blueprint installed locally via `conductor hub install`.

Usage: `/conductor:run <blueprint-name> [--dry-run] [--input key=value ...]`

## Steps

1. **Parse arguments** from `$ARGUMENTS`:

   - Extract `<blueprint-name>` (first positional argument)
   - Detect `--dry-run` flag (boolean)
   - Collect all `--input key=value` pairs into an inputs map

   Example: `/conductor:run tdd-bug-hunter --input target_dir=/src/auth`
   → name=`tdd-bug-hunter`, inputs=`{ target_dir: "/src/auth" }`

2. **Locate the blueprint file**:

   Path: `~/.claude/conductor/blueprints/<blueprint-name>/blueprint.json`

   If the file does not exist, display:
   ```
   Blueprint "<blueprint-name>" not found.
   Install it first with: conductor hub install <blueprint-name>
   ```
   Then stop.

3. **Load and parse** the blueprint JSON file.

   Apply v1.1 → v1.0 coercion if needed:
   - If `blueprint.gates[]` exists and `blueprint.agents[]` does not, set `blueprint.agents = blueprint.gates`
   - This is handled automatically by `lib/runner.js` `run()` function

4. **If `--dry-run` flag is present**:

   Call `dryRun(blueprint, inputs)` from `lib/runner.js`.

   Display the dry-run output and stop. No execution occurs.

5. **Otherwise — build execution plan**:

   Call `run(blueprint, inputs)` from `lib/runner.js`.

   If `result.ok === false`:
   ```
   Blueprint validation failed:
   - <error message 1>
   - <error message 2>
   ```
   Then stop.

6. **Display execution plan** before running:

   ```
   Blueprint: <name> v<version>
   Plan: <N> step(s)

   Step 1 — <id> [<type>]
     prompt: <resolved prompt>   (for agent gates)
     command: <resolved command> (for tool gates)
     model: <model>

   Step 2 — <id> [<type>]
     ...
   ```

7. **Execute each step in sequence**:

   For each step in `result.plan`:

   **gate type: `tool`** — display the bash command to run:
   ```
   [Step N — <id>] tool gate
   Command: <command>
   → Run this command in your terminal or via Bash tool.
   ```

   **gate type: `agent`** — display the structured dispatch prompt:
   ```
   [Step N — <id>] agent gate (model: <model>)
   Dispatch prompt:
   ---
   <resolved prompt>
   ---
   → Use Agent tool to dispatch this prompt.
   ```

   Note: `/conductor:run` displays the plan and per-step instructions. Actual
   execution of bash commands and agent dispatches is performed by the
   orchestrator (Hyperion) using the Bash tool and Agent tool calls.

## Examples

### Run a blueprint with inputs
```
/conductor:run tdd-bug-hunter --input target_dir=/src/auth
```

### Dry-run to preview the plan without executing
```
/conductor:run pre-push --dry-run
```

### Run with multiple inputs
```
/conductor:run brainstorming-premortem --input topic="agent memory" --input audience=devs
```

## Blueprint formats supported

**v1.0** (agents[]):
```json
{
  "name": "tdd-bug-hunter",
  "version": "1.0.0",
  "agents": [
    { "role": "analyzer", "prompt": "Analyze the bug in {{target_dir}}", "model": "haiku" },
    { "role": "fixer",    "prompt": "Fix the bug found",                 "model": "sonnet" }
  ]
}
```

**v1.1** (gates[]):
```json
{
  "name": "pre-push",
  "schema_version": "1.1.0",
  "gates": [
    { "id": "validate", "type": "tool",  "command": "npm test" },
    { "id": "review",   "type": "agent", "prompt": "Review changes for correctness" }
  ]
}
```

Both formats resolve `{{variable}}` placeholders from `--input` pairs.
