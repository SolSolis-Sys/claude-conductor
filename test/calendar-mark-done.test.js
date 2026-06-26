#!/usr/bin/env node
'use strict';

/**
 * calendar-mark-done.test.js
 * Tests for markDone() in lib/calendar.js.
 * Run: node test/calendar-mark-done.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-done-${process.pid}`);
const TEMP_AGENDA = path.join(TEMP_DIR, 'agenda.json');

process.env.CONDUCTOR_CALENDAR_DIR = TEMP_DIR;

const calendar = require(path.join(__dirname, '..', 'lib', 'calendar'));
calendar._config.agendaDir = TEMP_DIR;
calendar._config.agendaPath = TEMP_AGENDA;
calendar._config.throttleFile = path.join(TEMP_DIR, '.last-inject');

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

function resetAgenda() {
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ok */ }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('markDone(id) sets done: true for matching event', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'target-id', title: 'Target event', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
  ]);
  calendar.markDone('target-id');
  const agenda = calendar.readAgenda();
  assertEqual(agenda.events[0].done, true, 'event should be marked done');
});

test('markDone(id) returns true on success', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'success-id', title: 'Mark me done', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
  ]);
  const result = calendar.markDone('success-id');
  assertEqual(result, true, 'should return true on success');
});

test('markDone(id) returns false if event not found', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'existing-id', title: 'Existing', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
  ]);
  const result = calendar.markDone('nonexistent-id');
  assertEqual(result, false, 'should return false for unknown id');
});

test('markDone(id) persists change to disk', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'persist-id', title: 'Persist done', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
  ]);
  calendar.markDone('persist-id');
  // Read raw from disk to confirm persistence
  const raw = JSON.parse(fs.readFileSync(TEMP_AGENDA, 'utf8'));
  const event = raw.events.find(e => e.id === 'persist-id');
  assert(event !== undefined, 'event should exist in file');
  assertEqual(event.done, true, 'done should be true in persisted file');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar markDone Test Suite\n' + '='.repeat(40));

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

try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ok */ }

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
