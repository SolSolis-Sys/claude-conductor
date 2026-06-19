---
description: "Loop patterns for autonomous agent workflows. Use: /conductor:loop <pattern> — patterns: count, dry, budget"
---

# /conductor:loop $ARGUMENTS

Loop patterns for autonomous agent execution.

If `$ARGUMENTS` is provided, show only the matching pattern:
- `count` → show only **loop-until-count**
- `dry` → show only **loop-until-dry**  
- `budget` → show only **loop-until-budget**

If no argument, show all three patterns as a reference.

## Pattern: loop-until-count

Accumulate results until a target count is reached.

```javascript
// In a workflow script
const results = []
while (results.length < TARGET_COUNT) {
  const batch = await agent("Find [items] in [scope]", { schema: SCHEMA })
  results.push(...batch.items)
  log(`${results.length}/${TARGET_COUNT} found`)
}
```

Use when: known target quantity, discovery of N bugs/issues/tests.

## Pattern: loop-until-dry

Continue until K consecutive rounds return nothing new.

```javascript
const seen = new Set()
let dry = 0
while (dry < 2) {
  const found = await agent("Find new [items]", { schema: SCHEMA })
  const fresh = found.items.filter(x => !seen.has(x.id))
  if (!fresh.length) { dry++; continue }
  dry = 0
  fresh.forEach(x => seen.add(x.id))
  // process fresh items
}
```

Use when: unknown total, exhaustive discovery (all bugs, all issues).

## Pattern: loop-until-budget

Scale depth to available token budget.

```javascript
// budget is available as a global in workflow scripts
const results = []
while (budget.total && budget.remaining() > 50_000) {
  const batch = await agent("Continue analysis...", { schema: SCHEMA })
  results.push(...batch.items)
  log(`${results.length} found, ${Math.round(budget.remaining()/1000)}k remaining`)
}
```

Use when: user specified a token budget (+500k directive), depth should scale with available tokens.

## Choosing a pattern

| Scenario | Pattern |
|----------|---------|
| "Find 10 bugs" | loop-until-count |
| "Find all issues" | loop-until-dry |
| "Be thorough, +200k" | loop-until-budget |
| "Keep going until done" | loop-until-dry (K=2) |
