#!/usr/bin/env node
'use strict';

/**
 * cmd-calendar-done.test.js
 * Integration tests for `calendar:done` sub-command in scripts/calendar-commands.js.
 * Spawns the script as subprocess with CONDUCTOR_CALENDAR_DIR pointing to a temp dir.
 * Run: node test/cmd-calendar-done.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'calendar-commands.js');
const TEMP_BASE = path.join(os.tmpdir(), `conductor-cmd-done-${process.pid}`);

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

// Known UUID for test fixtures
const TEST_UUID = 'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb';
const TEST_UUID_2 = '11112222-3333-4444-5555-666677778888';

// ── Tests ────────────────────────────────────────────────────────────────────

test('calendar:done <full-id> marks event as done', () => {
  const dir = setupDir('done-full-id');
  writeAgenda(dir, [
    { id: TEST_UUID, title: 'Done target', start: daysFromNow(1), done: false, tags: [] },
  ]);
  const result = run(dir, 'calendar:done', TEST_UUID);
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Marked done'), 'stdout should contain "Marked done"');
  assert(result.stdout.includes('Done target'), 'stdout should contain event title');
});

test('calendar:done fuzzy-match on first 8 chars', () => {
  const dir = setupDir('done-fuzzy');
  writeAgenda(dir, [
    { id: TEST_UUID, title: 'Fuzzy target', start: daysFromNow(2), done: false, tags: [] },
  ]);
  const short8 = TEST_UUID.replace(/-/g, '').slice(0, 8);
  // Use first 8 chars of the UUID (without dashes the id starts "aaaabbbb")
  // Actually use the raw UUID prefix (with dashes): "aaaabbbb"
  const result = run(dir, 'calendar:done', 'aaaabbbb');
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  assert(result.stdout.includes('Marked done'), `stdout should contain "Marked done", got: ${result.stdout}`);
  assert(result.stdout.includes('Fuzzy target'), 'stdout should contain event title');
});

test('calendar:done shows prune count in output', () => {
  const dir = setupDir('done-prune-count');
  writeAgenda(dir, [
    { id: TEST_UUID_2, title: 'Prune count test', start: daysFromNow(1), done: false, tags: [] },
  ]);
  const result = run(dir, 'calendar:done', TEST_UUID_2);
  assert(result.status === 0, `exit code should be 0, got ${result.status}`);
  // Output must contain "Pruned N old events."
  assert(
    /Pruned \d+ old events\./.test(result.stdout),
    `stdout should match "Pruned N old events.", got: ${result.stdout}`
  );
});

test('calendar:done rejects unknown event ID', () => {
  const dir = setupDir('done-not-found');
  writeAgenda(dir, [
    { id: TEST_UUID, title: 'Existing event', start: daysFromNow(1), done: false, tags: [] },
  ]);
  const result = run(dir, 'calendar:done', 'nonexistent-id-xyz');
  assert(result.status !== 0, 'exit code should be non-zero for unknown ID');
  assert(result.stdout.includes('Event not found'), 'stdout should contain "Event not found"');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\ncmd-calendar-done.test.js\n' + '='.repeat(40));

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
