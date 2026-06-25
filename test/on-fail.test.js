#!/usr/bin/env node

/**
 * on-fail.test.js
 * Tests for resolveOnFail() and logOnFail().
 * Run: node test/on-fail.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const { resolveOnFail, logOnFail } = require(path.join(__dirname, '..', 'lib', 'on-fail'));

// ── Test harness ───────────────────────────────────────────────────────────

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

// Silence console.warn during tests (on_fail always warns)
const originalWarn = console.warn;
function silenceWarn() { console.warn = () => {}; }
function restoreWarn() { console.warn = originalWarn; }

const DUMMY_ERROR   = new Error('something went wrong');
const DUMMY_CONTEXT = { attempt: 1, gates: [], currentIndex: 0 };

// ── Test 1: on_fail absent → stop ─────────────────────────────────────────

test('Test 1: on_fail absent → stop', () => {
  silenceWarn();
  const result = resolveOnFail(undefined, 'g1-test', DUMMY_ERROR, DUMMY_CONTEXT);
  restoreWarn();

  assertEqual(result.action, 'stop', 'action should be stop when on_fail is absent');
  assert(!result.target, 'no target for stop');
});

// ── Test 2: action stop → stop ────────────────────────────────────────────

test('Test 2: action stop → stop', () => {
  silenceWarn();
  const result = resolveOnFail({ action: 'stop' }, 'g2-test', DUMMY_ERROR, DUMMY_CONTEXT);
  restoreWarn();

  assertEqual(result.action, 'stop', 'action stop should return stop');
  assert(!result.target, 'no target');
});

// ── Test 3: action retry, attempt 1/3 → retry ─────────────────────────────

test('Test 3: action retry, attempt 1/3 → retry', () => {
  const ctx = { attempt: 1, gates: [], currentIndex: 0 };
  silenceWarn();
  const result = resolveOnFail({ action: 'retry', max_retries: 3 }, 'g3-test', DUMMY_ERROR, ctx);
  restoreWarn();

  assertEqual(result.action, 'retry', 'should retry when attempt < max_retries');
  assert(!result.target, 'no target for retry');
});

// ── Test 4: action retry, attempt 3/3 → still retry (attempt <= maxRetries) ─

test('Test 4: action retry, attempt 3/3 → retry (attempt <= maxRetries)', () => {
  const ctx = { attempt: 3, gates: [], currentIndex: 0 };
  silenceWarn();
  const result = resolveOnFail({ action: 'retry', max_retries: 3 }, 'g4-test', DUMMY_ERROR, ctx);
  restoreWarn();

  assertEqual(result.action, 'retry', 'attempt=3 <= max_retries=3 → still retry');
  assert(!result.target, 'no target');
});

// ── Test 4b: action retry, attempt 4/3 exhausted → stop (no on_exhausted) ──

test('Test 4b: action retry, attempt 4/3 exhausted → stop (no on_exhausted)', () => {
  const ctx = { attempt: 4, gates: [], currentIndex: 0 };
  silenceWarn();
  const result = resolveOnFail({ action: 'retry', max_retries: 3 }, 'g4b-test', DUMMY_ERROR, ctx);
  restoreWarn();

  assertEqual(result.action, 'stop', 'attempt=4 > max_retries=3 → exhausted → stop');
  assert(!result.target, 'no target');
});

// ── Test 5: retry exhausted + on_exhausted fallback → fallback + target ────

test('Test 5: retry exhausted + on_exhausted fallback → fallback + target', () => {
  const ctx = { attempt: 4, gates: [], currentIndex: 0 };
  const onFail = {
    action:      'retry',
    max_retries: 3,
    on_exhausted: {
      action:        'fallback',
      fallback_gate: 'g99-recovery'
    }
  };
  silenceWarn();
  const result = resolveOnFail(onFail, 'g5-test', DUMMY_ERROR, ctx);
  restoreWarn();

  assertEqual(result.action, 'fallback', 'should return fallback when exhausted with on_exhausted');
  assertEqual(result.target, 'g99-recovery', 'target should be fallback_gate value');
});

// ── Test 6: action fallback + fallback_gate → fallback + target ────────────

test('Test 6: action fallback + fallback_gate → fallback + target', () => {
  silenceWarn();
  const result = resolveOnFail(
    { action: 'fallback', fallback_gate: 'g-emergency' },
    'g6-test', DUMMY_ERROR, DUMMY_CONTEXT
  );
  restoreWarn();

  assertEqual(result.action, 'fallback', 'action should be fallback');
  assertEqual(result.target, 'g-emergency', 'target should be the fallback_gate id');
});

// ── Test 6b: action fallback + fallback_blueprint → fallback_blueprint ──────

test('Test 6b: action fallback + fallback_blueprint → fallback_blueprint + target', () => {
  silenceWarn();
  const result = resolveOnFail(
    { action: 'fallback', fallback_blueprint: 'bp-recovery.json' },
    'g6b-test', DUMMY_ERROR, DUMMY_CONTEXT
  );
  restoreWarn();

  assertEqual(result.action, 'fallback_blueprint', 'action should be fallback_blueprint');
  assertEqual(result.target, 'bp-recovery.json', 'target should be fallback_blueprint value');
});

// ── Test 7: action log_only → log_only ────────────────────────────────────

test('Test 7: action log_only → log_only', () => {
  silenceWarn();
  const result = resolveOnFail({ action: 'log_only' }, 'g7-test', DUMMY_ERROR, DUMMY_CONTEXT);
  restoreWarn();

  assertEqual(result.action, 'log_only', 'action log_only should return log_only');
  assert(!result.target, 'no target');
});

// ── Test 8: action skip → skip ────────────────────────────────────────────

test('Test 8: action skip → skip', () => {
  silenceWarn();
  const result = resolveOnFail({ action: 'skip' }, 'g8-test', DUMMY_ERROR, DUMMY_CONTEXT);
  restoreWarn();

  assertEqual(result.action, 'skip', 'action skip should return skip');
  assert(!result.target, 'no target');
});

// ── Test 8b: retry, attempt=1, max_retries=1 → retry (was broken before fix) ─

test('Test 8b: retry, attempt=1, max_retries=1 → retry', () => {
  const ctx = { attempt: 1, gates: [], currentIndex: 0 };
  silenceWarn();
  const result = resolveOnFail({ action: 'retry', max_retries: 1 }, 'g8b-test', DUMMY_ERROR, ctx);
  restoreWarn();

  assertEqual(result.action, 'retry', 'attempt=1 <= max_retries=1 → retry (off-by-one fix)');
});

// ── Test 9: logOnFail produces correct format ──────────────────────────────

test('Test 9: logOnFail format includes gate, action, attempt, error', () => {
  const captured = [];
  const origWarn = console.warn;
  console.warn = (...args) => captured.push(args.join(' '));

  logOnFail('g-sample', 'retry', 2, 5, new Error('timeout'));

  console.warn = origWarn;

  assert(captured.length > 0, 'logOnFail should emit to console.warn');
  const line = captured[0];
  assert(line.includes('[on_fail]'), 'line includes [on_fail] prefix');
  assert(line.includes('g-sample'), 'line includes gate id');
  assert(line.includes('retry'), 'line includes action');
  assert(line.includes('2/5'), 'line includes attempt/max');
  assert(line.includes('timeout'), 'line includes error message');
});

// ── Run ─────────────────────────────────────────────────────────────────────

console.log('\nOn-Fail Test Suite\n' + '='.repeat(40));

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
