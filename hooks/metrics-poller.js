'use strict';

/**
 * conductor metrics-poller — Stop hook
 * Reads ~/.claude/token-watch/metrics.json (written by token-watch plugin).
 * Emits a systemMessage advisory if context or quota thresholds are exceeded.
 * Zero dependency, zero API call.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const METRICS_FILE = path.join(os.homedir(), '.claude', 'token-watch', 'metrics.json');
const CONTEXT_THRESHOLD = 0.90;
const QUOTA_THRESHOLD = 0.90;

function main() {
  let metrics;
  try {
    const raw = fs.readFileSync(METRICS_FILE, 'utf8');
    metrics = JSON.parse(raw);
  } catch {
    // Silent exit if file missing or unparseable
    process.exit(0);
  }

  const messages = [];

  const contextPct = typeof metrics.context_pct === 'number' ? metrics.context_pct : null;
  const alert = metrics.alert === true;
  const quota5hPct = typeof metrics.quota_5h_pct === 'number' ? metrics.quota_5h_pct : null;

  if (alert || (contextPct !== null && contextPct >= CONTEXT_THRESHOLD)) {
    const pct = contextPct !== null ? Math.round(contextPct * 100) : '?';
    messages.push(`Context at ${pct}% — consider /compact to free context window.`);
  }

  if (quota5hPct !== null && quota5hPct >= QUOTA_THRESHOLD) {
    const pct = Math.round(quota5hPct * 100);
    messages.push(`5h quota at ${pct}% — pace requests or wait for quota reset.`);
  }

  if (messages.length > 0) {
    const output = {
      systemMessage: `Conductor: ${messages.join(' | ')}`,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  process.exit(0);
}

main();
