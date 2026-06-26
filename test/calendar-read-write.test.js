#!/usr/bin/env node
'use strict';

/**
 * calendar-read-write.test.js
 * Tests for readAgenda() and writeAgenda() in lib/calendar.js.
 * Run: node test/calendar-read-write.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Redirect calendar to a temp directory for isolation
const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-rw-${process.pid}`);
const TEMP_AGENDA = path.join(TEMP_DIR, 'agenda.json');

// Set env var BEFORE requiring calendar (module init reads it)
process.env.CONDUCTOR_CALENDAR_DIR = TEMP_DIR;

const calendar = require(path.join(__dirname, '..', 'lib', 'calendar'));
// Override _config in case it was already required in this process
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

// ── Setup ────────────────────────────────────────────────────────────────────

function resetAgenda() {
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ok */ }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('readAgenda() returns empty default if file missing', () => {
  resetAgenda();
  const result = calendar.readAgenda();
  assertEqual(result.version, '1.0', 'version should be 1.0');
  assert(Array.isArray(result.events), 'events should be an array');
  assertEqual(result.events.length, 0, 'events should be empty');
});

test('readAgenda() parses valid JSON correctly', () => {
  resetAgenda();
  const data = { version: '1.0', events: [{ id: 'abc', title: 'Test', start: '2026-06-27T10:00:00Z', done: false, tags: [] }] };
  fs.writeFileSync(TEMP_AGENDA, JSON.stringify(data), 'utf8');
  const result = calendar.readAgenda();
  assertEqual(result.version, '1.0', 'version');
  assertEqual(result.events.length, 1, 'events count');
  assertEqual(result.events[0].title, 'Test', 'event title');
});

test('readAgenda() returns empty default on malformed JSON (no throw)', () => {
  resetAgenda();
  fs.writeFileSync(TEMP_AGENDA, 'this is not json!!!', 'utf8');
  let threw = false;
  let result;
  try {
    result = calendar.readAgenda();
  } catch {
    threw = true;
  }
  assert(!threw, 'should not throw on malformed JSON');
  assert(Array.isArray(result.events), 'events should be array');
  assertEqual(result.events.length, 0, 'events should be empty on malformed input');
});

test('writeAgenda() creates file if missing', () => {
  resetAgenda();
  const events = [{ id: 'x1', title: 'Created', start: '2026-06-28T09:00:00Z', done: false, tags: [] }];
  calendar.writeAgenda(events);
  assert(fs.existsSync(TEMP_AGENDA), 'agenda.json should be created');
  const data = JSON.parse(fs.readFileSync(TEMP_AGENDA, 'utf8'));
  assertEqual(data.events.length, 1, 'should have 1 event');
});

test('writeAgenda() updates existing file', () => {
  resetAgenda();
  // Write initial
  calendar.writeAgenda([{ id: 'a', title: 'Old', start: '2026-06-27T08:00:00Z', done: false, tags: [] }]);
  // Overwrite with new data
  calendar.writeAgenda([
    { id: 'b', title: 'New1', start: '2026-06-27T09:00:00Z', done: false, tags: [] },
    { id: 'c', title: 'New2', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
  ]);
  const data = JSON.parse(fs.readFileSync(TEMP_AGENDA, 'utf8'));
  assertEqual(data.events.length, 2, 'should have 2 events after update');
  assertEqual(data.events[0].title, 'New1', 'first event title');
});

test('writeAgenda() preserves event data on round-trip', () => {
  resetAgenda();
  const events = [
    { id: 'uuid-123', title: 'Round-trip test', start: '2026-06-29T14:00:00Z', done: false, tags: ['blocking', 'project'] }
  ];
  calendar.writeAgenda(events);
  const result = calendar.readAgenda();
  assertEqual(result.events[0].id, 'uuid-123', 'id preserved');
  assertEqual(result.events[0].title, 'Round-trip test', 'title preserved');
  assertEqual(result.events[0].start, '2026-06-29T14:00:00Z', 'start preserved');
  assertEqual(result.events[0].done, false, 'done preserved');
  assertEqual(result.events[0].tags.length, 2, 'tags count preserved');
  assertEqual(result.events[0].tags[0], 'blocking', 'first tag preserved');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar read-write Test Suite\n' + '='.repeat(40));

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
try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* ok */ }

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
