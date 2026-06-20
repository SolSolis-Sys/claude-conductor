# conductor hub

Browse and install blueprints from the community library.

## Usage

```
conductor hub list
conductor hub search <query>
conductor hub install <name>
conductor hub info <name>
```

## Commands

- `list` — Show available blueprints from the catalog
- `search <query>` — Search blueprints by name, tag, or description
- `install <name>` — Install a blueprint locally
- `info <name>` — Show blueprint details
- `submit <path>` — Submit a local blueprint to the community registry

## Examples

Search for TDD-related blueprints:
```
conductor hub search tdd
```

Install the TDD bug hunter blueprint:
```
conductor hub install tdd-bug-hunter
```

List all available blueprints:
```
conductor hub list
```

## hub submit

Submit a local blueprint to the community registry.

**Usage:**
```
conductor hub submit <path>
```

`<path>` can be:
- A directory containing `blueprint.json`
- A direct path to `blueprint.json`

**What it does:**
1. Reads and validates your `blueprint.json`
2. Opens a GitHub Issue in [conductor-blueprints](https://github.com/SolSolis-Sys/conductor-blueprints) with the blueprint details
3. Returns the issue URL

**Requirements:** `gh` CLI authenticated (`gh auth login`)

**Example:**
```
conductor hub submit ~/.claude/conductor/blueprints/my-blueprint
# → Opens issue: https://github.com/SolSolis-Sys/conductor-blueprints/issues/XX
```

**Troubleshooting:**

- **`gh CLI not found`**: Install from https://cli.github.com/
- **`not authenticated`**: Run `gh auth login` to authenticate
- **`Missing fields`**: Ensure your blueprint.json has `name`, `version`, and `agents` fields
