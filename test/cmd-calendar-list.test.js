#!/usr/bin/env node
'use strict';

/**
 * cmd-calendar-list.test.js
 * Integration tests for `calendar:list` sub-command in scripts/calendar-commands.js.
 * Spawns the script as subprocess with CONDUCTOR_CALENDAR_DIR pointing to a temp dir.
 * Run: node test/cmd-calendar-list.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'calendar-commands.js');
const TEMP_BASE = path.join(os.tmpdir(), `conductor-cmd-list-${process.pid}`);

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

function writeAgenda(dir, events) {
  fs.writeFileSync(
    path.join(dir, 'agenda.json'),
    JSON.stringify({ version: '1.0', events }, null, 2),
    'utf8'
  );
}

function run(dir, subcmd, ...args) {
  return spawnSync('node', [SCRIPT, subcmd, ...args], {
    env: { ...process.env, CONDUCTOR_CALENDAR_DIR: dir },
    encoding: 'utf8',
    timeout: 5000,
  });
}

/** ISO string N days from now (UTC noon) */
function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

/** ISO string for today at a specific UTC hour */
function todayAt(hour) {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('calendar:list returns all events when no filter (default "all")', () => {
  const dir = setupDir('list-all');
  const now = new Date();
  writeAgenda(dir, [
    { id: 'aaa-001', title: 'Event Alpha', start: daysFromNow(1), done: false, tags: ['work'] },
    { id: 'aaa-002', title: 'Event Beta', start: daysFromNow(2), done: false, tags: [] },
    { id: 'aaa-003', title: 'Done event', start: daysFromNow(1), done: true, tags: [] },
  ]);
  const result = run(dir, 'calendar:list');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Event Alpha'), 'stdout should contain Event Alpha');
  assert(result.stdout.includes('Event Beta'), 'stdout should contain Event Beta');
  assert(!result.stdout.includes('Done event'), 'stdout should NOT contain done events');
});

test('calendar:list today filters to current UTC day', () => {
  const dir = setupDir('list-today');
  writeAgenda(dir, [
    // Today at 14:00 UTC — should appear
    { id: 'today-01', title: 'Today meeting', start: todayAt(14), done: false, tags: [] },
    // 3 days from now — should NOT appear
    { id: 'future-01', title: 'Future event', start: daysFromNow(3), done: false, tags: [] },
  ]);
  const result = run(dir, 'calendar:list', 'today');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Today meeting'), 'stdout should contain today event');
  assert(!result.stdout.includes('Future event'), 'stdout should NOT contain future event');
});

test('calendar:list week filters to next 7 days', () => {
  const dir = setupDir('list-week');
  writeAgenda(dir, [
    // 3 days from now — should appear
    { id: 'week-01', title: 'Week event', start: daysFromNow(3), done: false, tags: [] },
    // 10 days from now — should NOT appear
    { id: 'far-01', title: 'Far future', start: daysFromNow(10), done: false, tags: [] },
  ]);
  const result = run(dir, 'calendar:list', 'week');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Week event'), 'stdout should contain week event');
  assert(!result.stdout.includes('Far future'), 'stdout should NOT contain far future event');
});

test('calendar:list handles empty state', () => {
  const dir = setupDir('list-empty');
  // Empty agenda (no events)
  writeAgenda(dir, []);
  const result = run(dir, 'calendar:list');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(
    result.stdout.includes('No events found'),
    `stdout should contain "No events found", got: ${result.stdout}`
  );
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\ncmd-calendar-list.test.js\n' + '='.repeat(40));

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
