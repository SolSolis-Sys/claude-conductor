#!/usr/bin/env node
'use strict';

/**
 * calendar-format.test.js
 * Tests for formatSystemMessage() in lib/calendar.js.
 * Run: node test/calendar-format.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const path = require('path');

const calendar = require(path.join(__dirname, '..', 'lib', 'calendar'));

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

// ── Tests ────────────────────────────────────────────────────────────────────

test('formatSystemMessage([]) returns empty string', () => {
  const result = calendar.formatSystemMessage([]);
  assertEqual(result, '', 'empty array should return empty string');
});

test('formatSystemMessage(events) formats as [YYYY-MM-DD HH:MM] title (UTC)', () => {
  const events = [
    { id: 'e1', title: 'Client kickoff', start: '2026-06-27T14:00:00Z', done: false, tags: [] },
    { id: 'e2', title: 'Sprint planning', start: '2026-06-28T09:30:00Z', done: false, tags: [] },
  ];
  const result = calendar.formatSystemMessage(events);
  assert(result.includes('[2026-06-27 14:00] Client kickoff'), 'should contain first event formatted');
  assert(result.includes('[2026-06-28 09:30] Sprint planning'), 'should contain second event formatted');
  assert(result.includes('\n'), 'events should be separated by newline');
});

test('formatSystemMessage() truncates to max 2 events', () => {
  const events = [
    { id: 'e3', title: 'Event 1', start: '2026-06-27T10:00:00Z', done: false, tags: [] },
    { id: 'e4', title: 'Event 2', start: '2026-06-27T11:00:00Z', done: false, tags: [] },
    { id: 'e5', title: 'Event 3 (should be excluded)', start: '2026-06-27T12:00:00Z', done: false, tags: [] },
  ];
  const result = calendar.formatSystemMessage(events);
  const lines = result.split('\n');
  assertEqual(lines.length, 2, 'should produce exactly 2 lines');
  assert(!result.includes('Event 3'), 'third event should not appear');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar formatSystemMessage Test Suite\n' + '='.repeat(40));

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

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
