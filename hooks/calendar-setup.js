#!/usr/bin/env node
'use strict';

/**
 * hooks/calendar-setup.js — SessionStart hook
 * Initializes conductor-calendar directory and empty agenda.json.
 * Idempotent: safe to run multiple times.
 * Override CONDUCTOR_CALENDAR_DIR env var for testing.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const calendarDir = process.env.CONDUCTOR_CALENDAR_DIR
  ? process.env.CONDUCTOR_CALENDAR_DIR
  : path.join(os.homedir(), '.claude', 'conductor-calendar');

const agendaPath = path.join(calendarDir, 'agenda.json');

// 1. Create directory (idempotent)
try {
  fs.mkdirSync(calendarDir, { recursive: true });
} catch (err) {
  // Log warning but continue — never block session start
  process.stderr.write(`[conductor-calendar] Warning: could not create dir: ${err.message}\n`);
}

// 2. Initialize agenda.json if missing
try {
  if (!fs.existsSync(agendaPath)) {
    fs.writeFileSync(
      agendaPath,
      JSON.stringify({ version: '1.0', events: [] }, null, 2),
      'utf8'
    );
  }
} catch (err) {
  // Log warning but continue
  process.stderr.write(`[conductor-calendar] Warning: could not init agenda: ${err.message}\n`);
}

// Always exit cleanly — hooks must never block the harness
process.exit(0);
