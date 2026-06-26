#!/usr/bin/env node
'use strict';

/**
 * hooks/calendar-poller.js — Stop hook
 * Checks for upcoming events in conductor-calendar/agenda.json.
 * If events found within 2h window and throttle OK, emits a systemMessage.
 * Auto-prunes expired events on each run.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const path = require('path');
const calendar = require(path.join(__dirname, '..', 'lib', 'calendar'));

function main() {
  // 1. Get upcoming events (next 2 hours)
  let upcoming;
  try {
    upcoming = calendar.getUpcoming(2);
  } catch {
    // Malformed agenda or missing file — exit silently
    process.exit(0);
  }

  if (!upcoming || upcoming.length === 0) {
    process.exit(0);
  }

  // 2. Check throttle — skip injection if last inject < THROTTLE_MINUTES ago
  const throttleFile = calendar._config.throttleFile;
  try {
    const raw = fs.readFileSync(throttleFile, 'utf8');
    const last = JSON.parse(raw);
    if (last && last.timestamp) {
      const ageMs = Date.now() - new Date(last.timestamp).getTime();
      if (ageMs < calendar.THROTTLE_MINUTES * 60 * 1000) {
        // Too recent — skip injection, still prune
        try { calendar.pruneOld(); } catch { /* silent */ }
        process.exit(0);
      }
    }
  } catch {
    // No throttle file or malformed — proceed with injection
  }

  // 3. Emit systemMessage to stdout
  const content = `[SYSTEM CALENDAR]\n${calendar.formatSystemMessage(upcoming)}`;
  try {
    process.stdout.write(JSON.stringify({ systemMessage: content }) + '\n');
  } catch {
    // stdout error — continue to update throttle and prune
  }

  // 4. Update .last-inject timestamp
  try {
    fs.mkdirSync(path.dirname(throttleFile), { recursive: true });
    fs.writeFileSync(
      throttleFile,
      JSON.stringify({ timestamp: new Date().toISOString() }),
      'utf8'
    );
  } catch {
    // Silent fail
  }

  // 5. Prune old events
  try {
    calendar.pruneOld();
  } catch {
    // Silent fail
  }
}

try {
  main();
} catch {
  // Top-level safety net — hooks must never crash the harness
}

process.exit(0);
