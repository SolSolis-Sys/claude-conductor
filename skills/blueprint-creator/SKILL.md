---
description: Guide step-by-step creation of a conductor blueprint v1.1: analyze workflow → generate blueprint.json (gates[]) → validate schema → create README.md → submit via hub. Use when a user wants to create and publish a new conductor blueprint.
origin: conductor-blueprints
tools: Read, Write, Edit, Bash, Glob, Grep
categorie: orchestration
version: 2.0.0
---

# Blueprint Creator v2.0

Guides the creation of a new conductor blueprint v1.1 (gates[]) from workflow description to hub submission.

## Format cible : blueprint v1.1 (gates[])

Toujours générer un blueprint v1.1 avec `gates[]` (pas `agents[]`).
Schema: `https://raw.githubusercontent.com/SolSolis-Sys/conductor-blueprints/main/schemas/blueprint.v1.1.json`

## Process

### Step 1 — Analyze Workflow

Extract from user's description:
- Gates needed and their types (`agent` = LLM, `tool` = déterministe/zéro token)
- Inter-gate data flow (`{{gate-id.field}}` cross-references)
- Loop pattern (exit_condition, max_rounds)
- Required inputs (user-provided variables)
- Cost estimate: count agent gates × ~10k tokens × $0.003/1k

**Golden Flux Rule**: opérations déterministes (grep, cat, validation JSON) → gate `tool`. Raisonnement et jugement → gate `agent`. Ne pas envoyer un LLM faire du grep.

### Step 2 — Generate blueprint.json

Required fields: `$schema`, `schema_version`, `id`, `name`, `version`, `title`, `description`, `author`, `license`, `tags`, `inputs`, `cost_profile`, `permissions`, `gates`, `loop`

Template v1.1 minimal:

```json
{
  "$schema": "https://raw.githubusercontent.com/SolSolis-Sys/conductor-blueprints/main/schemas/blueprint.v1.1.json",
  "schema_version": "1.1.0",
  "id": "github-handle/blueprint-name",
  "name": "blueprint-name",
  "version": "0.1.0",
  "title": "Human Readable Title",
  "description": "One sentence: what does this blueprint do?",
  "author": "GitHubHandle",
  "license": "MIT",
  "tags": ["tag1", "tag2"],
  "inputs": [
    { "name": "input_name", "type": "string", "description": "...", "required": true }
  ],
  "cost_profile": {
    "tier": "low|medium|high",
    "avg_tokens_per_run": 15000,
    "estimated_cost_usd": 0.05
  },
  "permissions": {
    "network": false,
    "filesystem": "read-only|read-write|none",
    "allowed_commands": []
  },
  "gates": [
    {
      "id": "gate-kebab-id",
      "type": "agent",
      "role": "role-name",
      "prompt": "Instruction with {{input_name}} and {{previous-gate-id.field}}.",
      "output_format": "json|text",
      "output_schema": {
        "type": "object",
        "required": ["field"],
        "properties": { "field": { "type": "string" } }
      }
    },
    {
      "id": "tool-gate-id",
      "type": "tool",
      "command": "cat {{input_path}} 2>/dev/null || echo 'NOT_FOUND'",
      "timeout_ms": 5000,
      "on_failure": "continue",
      "output_var": "file_content"
    }
  ],
  "loop": {
    "exit_condition": "last-gate produced output",
    "max_rounds": 1
  }
}
```

### Règles gates[]

| Champ | Requis pour | Notes |
|-------|-------------|-------|
| `id` | agent + tool | Unique, kebab-case |
| `type` | agent + tool | `"agent"` ou `"tool"` |
| `role` | agent | Kebab-case, identité de l'agent |
| `prompt` | agent | Supports `{{input_name}}` et `{{gate-id.field}}` |
| `command` | tool | Shell command ou `conductor://tools/<script>` |
| `output_format` | agent | `"json"` si `{{gate-id.field}}` utilisé ensuite |
| `output_schema` | agent json | JSON Schema draft-07, requis si cross-ref |
| `output_var` | tool | Nom de variable pour stdout (`{{output_var}}`) |
| `timeout_ms` | tool | Default 5000ms |
| `on_failure` | tool | `"abort"` (défaut) ou `"continue"` |
| `condition` | agent + tool | Condition d'exécution ex: `{{g1.status}} == "ok"` |

**Type `"skill"` interdit** — réservé Release 3 (v1.3), pas valide en v1.1.

### Ref: dynamique (optionnel)

Pour réutiliser un agent/tool défini dans le registre `conductor-blueprints/agents/` ou `tools/`:

```json
{
  "id": "scrub-gate",
  "type": "agent",
  "role": "scrub-checker",
  "ref": "agents/scrub-checker",
  "prompt": "Override ou complément optionnel."
}
```

Agents disponibles: `scrub-checker`, `spec-reader`, `quality-analyzer`, `smoke-runner`, `schema-validator`, `security-reviewer`, `fixer`, `synthesizer`, `refuter`, etc.
Lister: `ls conductor-blueprints/agents/` et `conductor-blueprints/tools/`

### Step 3 — Validate

```bash
# Dry-run via conductor (recommandé)
cd claude-conductor && node -e "
const { setRoots } = require('./lib/resolver.js');
setRoots({ blueprints: 'PATH/TO/conductor-blueprints' });
const r = require('./lib/runner.js');
const bp = require('./my-blueprint/blueprint.json');
r.dryRun(bp, { input_name: 'test_value' });
"
```

Vérifier:
- Nombre de gates affiché = attendu
- Aucune erreur `ref not found`
- Variables `{{input_name}}` résolues
- Warnings inter-gate attendus en dry-run (normaux)

### Step 4 — Create README.md

Required. Include:
- Title + 1-line description
- When to use (trigger conditions)
- Inputs table (name, type, required, description, default)
- Gate flow diagram (ASCII)
- Cost estimate + exemple de commande
- Common issues

### Step 5 — Submit via hub

```bash
conductor hub submit ./my-blueprint/
# ou
node scripts/hub.js submit ./my-blueprint/
```

Résultat: issue GitHub créée sur `SolSolis-Sys/conductor-blueprints` avec label `submission`.

## Output Format

```
BLUEPRINT CREATED: <name> (v1.1)
├── blueprint.json ✓ (gates: N agent + M tool)
├── README.md ✓
└── Submitted: https://github.com/SolSolis-Sys/conductor-blueprints/issues/<N>
Cost tier: <low|medium|high> (~$X.XX/run)
```

## Anti-patterns

- ❌ Utiliser `agents[]` — toujours `gates[]` pour les nouveaux blueprints
- ❌ Oublier `id` sur chaque gate (obligatoire en v1.1)
- ❌ `output_schema` sans `output_format: "json"` — le schema ne sera pas évalué
- ❌ Type `"skill"` — pas valide en v1.1
- ❌ Hardcoder `SolSolis-Sys` dans les blueprints utilisateurs
- ❌ Omettre `README.md`
- ❌ `cost_tier` sans estimation tokens
- ❌ `allowed_commands` avec commandes destructives (`rm -rf`, `del`, `format`)
