#!/usr/bin/env node
'use strict';

/**
 * calendar-add-event.test.js
 * Tests for addEvent() in lib/calendar.js.
 * Run: node test/calendar-add-event.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), `conductor-cal-add-${process.pid}`);
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

test('addEvent() generates a UUID id', () => {
  resetAgenda();
  const event = calendar.addEvent('Test meeting', '2026-06-27T14:00:00Z');
  assert(typeof event.id === 'string', 'id should be a string');
  assert(event.id.length === 36, 'UUID should be 36 chars');
  assert(/^[0-9a-f-]{36}$/.test(event.id), 'id should match UUID pattern');
});

test('addEvent() rejects invalid ISO8601 date', () => {
  resetAgenda();
  let threw = false;
  try {
    calendar.addEvent('Bad event', 'not-a-date');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Invalid ISO8601'), 'error message should mention ISO8601');
  }
  assert(threw, 'should throw on invalid date');
});

test('addEvent() sets done: false by default', () => {
  resetAgenda();
  const event = calendar.addEvent('Default done', '2026-06-28T09:00:00Z');
  assertEqual(event.done, false, 'done should be false by default');
});

test('addEvent() persists event to agenda.json', () => {
  resetAgenda();
  const event = calendar.addEvent('Persisted event', '2026-06-29T10:00:00Z', ['tag1']);
  assert(fs.existsSync(TEMP_AGENDA), 'agenda.json should exist after addEvent');
  const data = JSON.parse(fs.readFileSync(TEMP_AGENDA, 'utf8'));
  const found = data.events.find(e => e.id === event.id);
  assert(found !== undefined, 'event should be in persisted file');
  assertEqual(found.title, 'Persisted event', 'persisted title');
  assertEqual(found.tags[0], 'tag1', 'persisted tag');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nCalendar addEvent Test Suite\n' + '='.repeat(40));

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
