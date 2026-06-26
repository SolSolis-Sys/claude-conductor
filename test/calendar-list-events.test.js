#!/usr/bin/env node
'use strict';

/**
 * calendar-list-events.test.js
 * Tests for listEvents() in lib/calendar.js.
 * Run: node test/calendar-list-events.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-list-${process.pid}`);
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

test('listEvents() returns all non-done events', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'a1', title: 'Event 1', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
    { id: 'a2', title: 'Event 2', start: '2026-06-28T10:00:00Z', done: false, tags: [] },
    { id: 'a3', title: 'Event 3 (done)', start: '2026-06-29T10:00:00Z', done: true, tags: [] },
  ]);
  const result = calendar.listEvents();
  assertEqual(result.length, 2, 'should return 2 non-done events');
});

test('listEvents({ tags }) filters by tag match (ANY)', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'b1', title: 'Blocking', start: '2026-06-27T10:00:00Z', done: false, tags: ['blocking', 'project'] },
    { id: 'b2', title: 'Weekly', start: '2026-06-28T10:00:00Z', done: false, tags: ['weekly'] },
    { id: 'b3', title: 'No tags', start: '2026-06-29T10:00:00Z', done: false, tags: [] },
  ]);
  const result = calendar.listEvents({ tags: ['blocking'] });
  assertEqual(result.length, 1, 'should return 1 event matching blocking tag');
  assertEqual(result[0].title, 'Blocking', 'should be the blocking event');
});

test('listEvents({ from, to }) filters by date range', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'c1', title: 'Before range', start: '2026-06-25T10:00:00Z', done: false, tags: [] },
    { id: 'c2', title: 'In range', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
    { id: 'c3', title: 'After range', start: '2026-06-30T10:00:00Z', done: false, tags: [] },
  ]);
  const result = calendar.listEvents({
    from: '2026-06-26T00:00:00Z',
    to: '2026-06-28T23:59:59Z',
  });
  assertEqual(result.length, 1, 'should return 1 event in range');
  assertEqual(result[0].title, 'In range', 'should be the in-range event');
});

test('listEvents() excludes done events always', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'd1', title: 'Done 1', start: '2026-06-27T10:00:00Z', done: true, tags: ['project'] },
    { id: 'd2', title: 'Done 2', start: '2026-06-28T10:00:00Z', done: true, tags: [] },
  ]);
  const result = calendar.listEvents();
  assertEqual(result.length, 0, 'should return 0 — all events are done');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar listEvents Test Suite\n' + '='.repeat(40));

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
