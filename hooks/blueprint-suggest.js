#!/usr/bin/env node
'use strict';
// Hook: blueprint-suggest — PreToolUse(Bash) proactivity hook.
// Reads the Bash command from stdin and emits an additionalContext suggestion
// when the command matches a known "direct execution" pattern that has a
// conductor blueprint equivalent.
//
// IMPORTANT: Never blocks execution — never returns { "decision": "block" }.
// Output: { "additionalContext": "..." } printed to stdout, or empty (no output = no-op).
//
// Reads stdin JSON: { tool_name, tool_input: { command, ... }, ... }
// Copyright © 2026 SolSolis-Sys — MIT License

const PATTERNS = [
  {
    regex: /git push/,
    suggestion: 'pre-push-cohesion-check',
    tip: 'lance /conductor:run pre-push-cohesion-check avant git push pour vérifier la cohérence',
  },
  {
    regex: /npm test|npx jest|npx vitest|node.*test/,
    suggestion: 'tdd-bug-hunter',
    tip: 'lance /conductor:run tdd-bug-hunter pour analyse TDD multi-agents',
  },
  {
    regex: /node scripts[/\\]hub\.js/,
    suggestion: 'conductor hub via /conductor:hub',
    tip: 'utilise /conductor:hub list pour lister les blueprints disponibles',
  },
];

/**
 * Parse stdin JSON and return the Bash command string.
 * Returns null on any parse error.
 * @param {string} raw
 * @returns {string|null}
 */
function extractCommand(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const input = JSON.parse(raw);
    const cmd = input?.tool_input?.command;
    return typeof cmd === 'string' ? cmd : null;
  } catch (_) {
    return null;
  }
}

/**
 * Match command against known patterns.
 * Returns the first matching pattern or null.
 * @param {string} command
 * @returns {{ suggestion: string, tip: string }|null}
 */
function matchPattern(command) {
  for (const p of PATTERNS) {
    if (p.regex.test(command)) {
      return { suggestion: p.suggestion, tip: p.tip };
    }
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  const command = extractCommand(raw);
  if (!command) {
    process.exit(0);
    return;
  }

  const match = matchPattern(command);
  if (match) {
    const output = {
      additionalContext: `Blueprint disponible : ${match.suggestion} — ${match.tip}`,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }
  // No match → no output (no-op, execution proceeds normally)
  process.exit(0);
});
