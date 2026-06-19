---
description: "Run a 3-perspective parallel audit using Explore agents. Use: /conductor:audit <target path or description>"
---

# /conductor:audit $ARGUMENTS

Dispatch 3 independent Explore agents in parallel to audit: "$ARGUMENTS"

## Dispatch pattern

Send 3 Agent tool calls simultaneously (1 message = 3 calls):

**Agent A — Structure & Architecture**
Explore "$ARGUMENTS". Focus: structure, organization, conventions, entry points.
Report: findings (what you see), gaps (what's missing), recommendation.

**Agent B — Consistency & Conformance**
Explore "$ARGUMENTS". Focus: consistency across files, naming conventions, spec conformance.
Report: findings, inconsistencies found, recommendation.

**Agent C — Risks & Blind Spots**
Explore "$ARGUMENTS". Focus: hidden dependencies, error handling gaps, untested paths, security surface.
Report: findings, risk level (low/medium/high), recommendation.

## Synthesis (after 3 returns)

```
AUDIT: $ARGUMENTS
═══════════════════
CONSENSUS    : [points agreed by 2+ agents]
DIVERGENCES  : [conflicting findings]
TOP FINDINGS : [ranked by severity]
NEXT ACTION  : [concrete recommendation]
CONFIDENCE   : [1-10]
```
