#!/usr/bin/env node
'use strict';

/**
 * calendar-get-upcoming.test.js
 * Tests for getUpcoming() in lib/calendar.js.
 * Run: node test/calendar-get-upcoming.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-upcoming-${process.pid}`);
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

function nowPlusMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('getUpcoming(2) returns events within 2-hour window', () => {
  resetAgenda();
  // Event in 30 minutes — within window
  calendar.writeAgenda([
    { id: 'e1', title: 'Soon event', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = calendar.getUpcoming(2);
  assertEqual(result.length, 1, 'should return 1 upcoming event');
  assertEqual(result[0].title, 'Soon event', 'should be the soon event');
});

test('getUpcoming() excludes done: true events', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'e2', title: 'Done event', start: nowPlusMs(30 * 60 * 1000), done: true, tags: [] },
    { id: 'e3', title: 'Active event', start: nowPlusMs(60 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = calendar.getUpcoming(2);
  assertEqual(result.length, 1, 'should only return non-done events');
  assertEqual(result[0].title, 'Active event', 'should be the active event');
});

test('getUpcoming() excludes events beyond the window', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'e4', title: 'Far future', start: nowPlusMs(5 * 60 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = calendar.getUpcoming(2);
  assertEqual(result.length, 0, 'event 5h away should be excluded from 2h window');
});

test('getUpcoming() sorts by start time ascending', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'e5', title: 'Later', start: nowPlusMs(90 * 60 * 1000), done: false, tags: [] },
    { id: 'e6', title: 'Earlier', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = calendar.getUpcoming(2);
  assertEqual(result.length, 2, 'should return 2 events');
  assertEqual(result[0].title, 'Earlier', 'first should be the earlier event');
  assertEqual(result[1].title, 'Later', 'second should be the later event');
});

test('getUpcoming() returns max 2 events even if more match', () => {
  resetAgenda();
  calendar.writeAgenda([
    { id: 'e7', title: 'Event A', start: nowPlusMs(10 * 60 * 1000), done: false, tags: [] },
    { id: 'e8', title: 'Event B', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
    { id: 'e9', title: 'Event C', start: nowPlusMs(60 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = calendar.getUpcoming(2);
  assertEqual(result.length, 2, 'should return max 2 events');
  assertEqual(result[0].title, 'Event A', 'first event');
  assertEqual(result[1].title, 'Event B', 'second event');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar getUpcoming Test Suite\n' + '='.repeat(40));

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
