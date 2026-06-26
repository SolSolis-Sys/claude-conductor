#!/usr/bin/env node
'use strict';

/**
 * hook-poller.test.js
 * Integration tests for hooks/calendar-poller.js (Stop hook).
 * Runs the hook as a subprocess with CONDUCTOR_CALENDAR_DIR pointing to a temp dir.
 * Run: node test/hook-poller.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'calendar-poller.js');
const TEMP_BASE = path.join(os.tmpdir(), `conductor-hook-poller-${process.pid}`);

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

function runPoller(dir) {
  return spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CONDUCTOR_CALENDAR_DIR: dir },
    encoding: 'utf8',
    timeout: 5000,
  });
}

function nowPlusMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function minutesAgo(m) {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('Hook Stop exits silently (code 0) if agenda.json missing', () => {
  const dir = setupDir('no-agenda');
  // Do NOT create agenda.json
  const result = runPoller(dir);
  assertEqual(result.status, 0, 'should exit 0 with no agenda.json');
  assertEqual(result.stdout.trim(), '', 'stdout should be empty');
});

test('Hook Stop exits silently if no upcoming events', () => {
  const dir = setupDir('no-upcoming');
  // Event 5 hours away — outside 2h window
  writeAgenda(dir, [
    { id: 'far', title: 'Far future', start: nowPlusMs(5 * 60 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = runPoller(dir);
  assertEqual(result.status, 0, 'should exit 0 with no upcoming events');
  assertEqual(result.stdout.trim(), '', 'stdout should be empty');
});

test('Hook Stop injects systemMessage if event within 2h', () => {
  const dir = setupDir('with-upcoming');
  writeAgenda(dir, [
    { id: 'soon', title: 'Imminent meeting', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  const result = runPoller(dir);
  assertEqual(result.status, 0, 'should exit 0');
  assert(result.stdout.trim().length > 0, 'stdout should contain systemMessage');
  const output = JSON.parse(result.stdout.trim());
  assert(typeof output.systemMessage === 'string', 'output should have systemMessage string');
  assert(output.systemMessage.includes('[SYSTEM CALENDAR]'), 'systemMessage should include header');
  assert(output.systemMessage.includes('Imminent meeting'), 'systemMessage should include event title');
});

test('Hook Stop respects 5-minute throttle', () => {
  const dir = setupDir('throttle');
  writeAgenda(dir, [
    { id: 'throttled', title: 'Throttled event', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  // Write a recent .last-inject timestamp (1 minute ago)
  fs.writeFileSync(
    path.join(dir, '.last-inject'),
    JSON.stringify({ timestamp: minutesAgo(1) }),
    'utf8'
  );
  const result = runPoller(dir);
  assertEqual(result.status, 0, 'should exit 0');
  assertEqual(result.stdout.trim(), '', 'stdout should be empty due to throttle');
});

test('Hook Stop prunes old events on exit', () => {
  const dir = setupDir('prune-on-exit');
  const now = Date.now();
  writeAgenda(dir, [
    { id: 'old', title: 'Old done event', start: new Date(now - 30 * 60 * 60 * 1000).toISOString(), done: true, tags: [] },
    { id: 'soon', title: 'Upcoming', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  runPoller(dir);
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'agenda.json'), 'utf8'));
  // Old done event should be pruned; upcoming should remain
  assert(data.events.every(e => e.id !== 'old'), 'old done event should be pruned');
  assert(data.events.some(e => e.id === 'soon'), 'upcoming event should remain');
});

test('Hook Stop updates .last-inject timestamp after injection', () => {
  const dir = setupDir('update-throttle');
  writeAgenda(dir, [
    { id: 'update', title: 'Update throttle test', start: nowPlusMs(30 * 60 * 1000), done: false, tags: [] },
  ]);
  // No .last-inject yet
  runPoller(dir);
  const throttlePath = path.join(dir, '.last-inject');
  assert(fs.existsSync(throttlePath), '.last-inject should be created after injection');
  const lastInject = JSON.parse(fs.readFileSync(throttlePath, 'utf8'));
  assert(typeof lastInject.timestamp === 'string', '.last-inject should have timestamp field');
  const age = Date.now() - new Date(lastInject.timestamp).getTime();
  assert(age < 5000, '.last-inject timestamp should be very recent (< 5s ago)');
});

test('Hook Stop exits with code 0 always (never throws)', () => {
  const dir = setupDir('always-exit-0');
  // Write malformed agenda.json to trigger error path
  fs.writeFileSync(path.join(dir, 'agenda.json'), '{ INVALID JSON !!!', 'utf8');
  const result = runPoller(dir);
  assertEqual(result.status, 0, 'should always exit 0 even with malformed JSON');
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\nHook calendar-poller.js Integration Test Suite\n' + '='.repeat(40));

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
