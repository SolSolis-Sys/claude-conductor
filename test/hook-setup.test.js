#!/usr/bin/env node
'use strict';

/**
 * hook-setup.test.js
 * Integration tests for hooks/calendar-setup.js (SessionStart hook).
 * Runs the hook as a subprocess with CONDUCTOR_CALENDAR_DIR pointing to a temp dir.
 * Run: node test/hook-setup.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'calendar-setup.js');
const TEMP_BASE = path.join(os.tmpdir(), `conductor-hook-setup-${process.pid}`);

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

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function runHook(calendarDir) {
  return spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CONDUCTOR_CALENDAR_DIR: calendarDir },
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('Hook SessionStart creates conductor-calendar directory', () => {
  const dir = path.join(TEMP_BASE, 'test-create-dir');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }

  runHook(dir);
  assert(fs.existsSync(dir), 'calendar directory should be created');
});

test('Hook SessionStart initializes agenda.json with empty events', () => {
  const dir = path.join(TEMP_BASE, 'test-init-agenda');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }

  runHook(dir);
  const agendaPath = path.join(dir, 'agenda.json');
  assert(fs.existsSync(agendaPath), 'agenda.json should be created');
  const data = JSON.parse(fs.readFileSync(agendaPath, 'utf8'));
  assertEqual(data.version, '1.0', 'version should be 1.0');
  assert(Array.isArray(data.events), 'events should be an array');
  assertEqual(data.events.length, 0, 'events array should be empty');
});

test('Hook SessionStart exits with code 0', () => {
  const dir = path.join(TEMP_BASE, 'test-exit-code');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }

  const result = runHook(dir);
  assertEqual(result.status, 0, 'hook should exit with code 0');
});

test('Hook SessionStart is idempotent (run twice safely)', () => {
  const dir = path.join(TEMP_BASE, 'test-idempotent');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }

  // First run
  runHook(dir);
  const agendaPath = path.join(dir, 'agenda.json');
  // Add an event to verify it's preserved on second run
  const withEvent = { version: '1.0', events: [{ id: 'keep-me', title: 'Test', start: '2026-06-27T10:00:00Z', done: false, tags: [] }] };
  fs.writeFileSync(agendaPath, JSON.stringify(withEvent), 'utf8');

  // Second run — should not overwrite existing agenda.json
  const result2 = runHook(dir);
  assertEqual(result2.status, 0, 'second run should exit with code 0');
  const data = JSON.parse(fs.readFileSync(agendaPath, 'utf8'));
  assertEqual(data.events.length, 1, 'existing event should be preserved on second run');
  assertEqual(data.events[0].id, 'keep-me', 'event id should be preserved');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nHook calendar-setup.js Integration Test Suite\n' + '='.repeat(40));

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

// Cleanup
try { fs.rmSync(TEMP_BASE, { recursive: true, force: true }); } catch { /* ok */ }

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
