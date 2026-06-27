#!/usr/bin/env node
'use strict';

/**
 * cmd-calendar-add.test.js
 * Integration tests for `calendar:add` sub-command in scripts/calendar-commands.js.
 * Spawns the script as subprocess with CONDUCTOR_CALENDAR_DIR pointing to a temp dir.
 * Run: node test/cmd-calendar-add.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'calendar-commands.js');
const TEMP_BASE = path.join(os.tmpdir(), `conductor-cmd-add-${process.pid}`);

// ── Test harness ────────────────────────────────────────────────────────────

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function setupDir(name) {
  const dir = path.join(TEMP_BASE, name);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run(dir, subcmd, ...args) {
  return spawnSync('node', [SCRIPT, subcmd, ...args], {
    env: { ...process.env, CONDUCTOR_CALENDAR_DIR: dir },
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('calendar:add creates an event (stdout contains "Event added")', () => {
  const dir = setupDir('add-basic');
  const result = run(dir, 'calendar:add', 'Sprint planning', '2026-07-01T09:00:00Z');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Event added'), 'stdout should contain "Event added"');
  assert(result.stdout.includes('Sprint planning'), 'stdout should contain the title');
});

test('calendar:add rejects invalid ISO8601 date (stdout contains "Invalid date")', () => {
  const dir = setupDir('add-bad-date');
  const result = run(dir, 'calendar:add', 'Bad event', 'not-a-date');
  assert(result.status !== 0, 'exit code should be non-zero on invalid date');
  assert(result.stdout.includes('Invalid date'), 'stdout should contain "Invalid date"');
});

test('calendar:add handles optional tags (no tags arg succeeds)', () => {
  const dir = setupDir('add-no-tags');
  const result = run(dir, 'calendar:add', 'No tags event', '2026-07-02T10:00:00Z');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Event added'), 'stdout should contain "Event added"');
  // Tags line should still appear, just empty
  assert(result.stdout.includes('Tags:'), 'stdout should contain "Tags:" line');
});

test('calendar:add returns the event UUID in stdout', () => {
  const dir = setupDir('add-uuid');
  const result = run(dir, 'calendar:add', 'UUID test', '2026-07-03T11:00:00Z', 'work');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  // First line: "✓ Event added: <uuid>"
  const firstLine = result.stdout.trim().split('\n')[0];
  const uuidMatch = firstLine.match(/Event added: ([0-9a-f-]{36})/);
  assert(uuidMatch !== null, 'stdout first line should contain a valid UUID');
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuidMatch[1]),
    `UUID format invalid: ${uuidMatch[1]}`
  );
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\ncmd-calendar-add.test.js\n' + '='.repeat(40));

for (const t of tests) {
  try {
    t.fn();
    console.log(`  pass  ${t.name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${t.name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

try { fs.rmSync(TEMP_BASE, { recursive: true, force: true }); } catch { /* ok */ }

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
