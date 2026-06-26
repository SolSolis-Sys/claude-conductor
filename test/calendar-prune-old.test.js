#!/usr/bin/env node
'use strict';

/**
 * calendar-prune-old.test.js
 * Tests for pruneOld() in lib/calendar.js.
 * Run: node test/calendar-prune-old.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-prune-${process.pid}`);
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

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('pruneOld() removes done: true events', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'done1', title: 'Done event', start: hoursFromNow(2), done: true, tags: [] },
    { id: 'active1', title: 'Active event', start: hoursFromNow(2), done: false, tags: [] },
  ]);
  calendar.pruneOld();
  const agenda = calendar.readAgenda();
  assertEqual(agenda.events.length, 1, 'only 1 event should remain');
  assertEqual(agenda.events[0].id, 'active1', 'remaining event should be the active one');
});

test('pruneOld() removes events older than 24h', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'old1', title: 'Very old event', start: hoursAgo(30), done: false, tags: [] },
    { id: 'recent1', title: 'Recent event', start: hoursFromNow(1), done: false, tags: [] },
  ]);
  calendar.pruneOld();
  const agenda = calendar.readAgenda();
  assertEqual(agenda.events.length, 1, 'only recent event should remain');
  assertEqual(agenda.events[0].id, 'recent1', 'remaining event should be the recent one');
});

test('pruneOld() keeps recent non-done events', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'keep1', title: 'Keep me', start: hoursFromNow(5), done: false, tags: ['project'] },
    { id: 'keep2', title: 'Keep me too', start: hoursFromNow(48), done: false, tags: [] },
  ]);
  calendar.pruneOld();
  const agenda = calendar.readAgenda();
  assertEqual(agenda.events.length, 2, 'both recent non-done events should be kept');
});

test('pruneOld() returns count of deleted events', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'del1', title: 'Delete 1 (done)', start: hoursFromNow(2), done: true, tags: [] },
    { id: 'del2', title: 'Delete 2 (old)', start: hoursAgo(48), done: false, tags: [] },
    { id: 'keep3', title: 'Keep this', start: hoursFromNow(1), done: false, tags: [] },
  ]);
  const count = calendar.pruneOld();
  assertEqual(count, 2, 'should report 2 deleted events');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar pruneOld Test Suite\n' + '='.repeat(40));

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
