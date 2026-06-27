#!/usr/bin/env node

/**
 * runner-run.test.js
 * Tests for run() and resolveInputs() added to lib/runner.js.
 * Run: node test/runner-run.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const { run, resolveInputs } = require(path.join(__dirname, '..', 'lib', 'runner'));

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

// ── Suppress console.log during tests ─────────────────────────────────────
const originalLog = console.log;
function silenceLog() { console.log = () => {}; }
function restoreLog() { console.log = originalLog; }

// ── Test 1: run() returns valid plan for v1.0 blueprint (agents[]) ─────────

test('run() returns valid plan for v1.0 blueprint (agents[])', () => {
  const blueprint = {
    name: 'tdd-bug-hunter',
    version: '1.0.0',
    agents: [
      { role: 'analyzer', prompt: 'Analyze the bug in {{target_dir}}', model: 'haiku' },
      { role: 'fixer',    prompt: 'Fix the bug found',                 model: 'sonnet' }
    ]
  };

  silenceLog();
  const result = run(blueprint, { target_dir: '/src/auth' });
  restoreLog();

  assert(result.ok === true, `ok should be true — errors: ${JSON.stringify(result.errors)}`);
  assert(Array.isArray(result.plan), 'plan should be an array');
  assertEqual(result.plan.length, 2, 'plan should have 2 steps');
  assertEqual(result.name, 'tdd-bug-hunter', 'name preserved');
  assertEqual(result.version, '1.0.0', 'version preserved');

  const step1 = result.plan[0];
  assertEqual(step1.index, 1, 'step1 index');
  assertEqual(step1.id, 'analyzer', 'step1 id from role');
  assertEqual(step1.type, 'agent', 'step1 type default');
  assertEqual(step1.model, 'haiku', 'step1 model');

  const step2 = result.plan[1];
  assertEqual(step2.index, 2, 'step2 index');
  assertEqual(step2.id, 'fixer', 'step2 id from role');
});

// ── Test 2: run() coerces gates[] → agents[] for v1.1 blueprint ───────────

test('run() coerces gates[] → agents[] for v1.1 blueprint', () => {
  const blueprint = {
    name: 'pre-push',
    schema_version: '1.1.0',
    gates: [
      { id: 'validate', type: 'tool',  command: 'npm test' },
      { id: 'review',   type: 'agent', prompt: 'Review changes' }
    ]
  };

  silenceLog();
  const result = run(blueprint);
  restoreLog();

  assert(result.ok === true, `ok should be true — errors: ${JSON.stringify(result.errors)}`);
  assert(Array.isArray(result.plan), 'plan should be an array');
  assertEqual(result.plan.length, 2, 'plan should have 2 steps');

  const step1 = result.plan[0];
  assertEqual(step1.id, 'validate', 'step1 id from gate id');
  assertEqual(step1.type, 'tool', 'step1 type tool');
  assertEqual(step1.command, 'npm test', 'step1 command');
  assert(step1.prompt === null, 'step1 prompt null for tool gate');

  const step2 = result.plan[1];
  assertEqual(step2.id, 'review', 'step2 id');
  assertEqual(step2.type, 'agent', 'step2 type agent');
  assertEqual(step2.prompt, 'Review changes', 'step2 prompt');
});

// ── Test 3: run() resolves {{target_dir}} inputs ───────────────────────────

test('run() resolves {{target_dir}} and other inputs in prompts', () => {
  const blueprint = {
    name: 'input-resolver-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'scanner', type: 'agent', prompt: 'Scan {{target_dir}} for issues in {{language}}' },
      { id: 'cleaner', type: 'tool',  command: 'rm -rf {{tmp_dir}}' }
    ]
  };

  silenceLog();
  const result = run(blueprint, { target_dir: '/src', language: 'Python', tmp_dir: '/tmp/work' });
  restoreLog();

  assert(result.ok === true, `ok should be true — errors: ${JSON.stringify(result.errors)}`);

  assertEqual(result.plan[0].prompt,  'Scan /src for issues in Python', 'prompt variables resolved');
  assertEqual(result.plan[1].command, 'rm -rf /tmp/work', 'command variables resolved');
});

// ── Test 4: run() leaves unresolved {{variables}} as-is ───────────────────

test('run() leaves unresolved {{variable}} placeholders unchanged', () => {
  const blueprint = {
    name: 'partial-inputs',
    schema_version: '1.1.0',
    gates: [
      { id: 'runner', type: 'agent', prompt: 'Run {{known}} against {{unknown_var}}' }
    ]
  };

  silenceLog();
  const result = run(blueprint, { known: 'tests' });
  restoreLog();

  assert(result.ok === true, 'ok should be true');
  assertEqual(result.plan[0].prompt, 'Run tests against {{unknown_var}}', 'unresolved placeholder preserved');
});

// ── Test 5: run() returns ok:false for invalid blueprint ──────────────────

test('run() returns ok:false when blueprint has no name', () => {
  const blueprint = {
    // missing required 'name'
    schema_version: '1.1.0',
    gates: [
      { id: 'g1', type: 'agent', prompt: 'Do something' }
    ]
  };

  silenceLog();
  const result = run(blueprint);
  restoreLog();

  assert(result.ok === false, 'ok should be false for invalid blueprint');
  assert(Array.isArray(result.errors), 'errors should be an array');
  assert(result.errors.length > 0, 'errors should be non-empty');
});

// ── Test 6: run() returns ok:false when gate is missing required type ──────

test('run() returns ok:false when gate missing required "type" field', () => {
  const blueprint = {
    name: 'bad-gate',
    schema_version: '1.1.0',
    gates: [
      { id: 'g1' } // missing type — required by GATE_SCHEMA
    ]
  };

  silenceLog();
  const result = run(blueprint);
  restoreLog();

  assert(result.ok === false, 'ok should be false — gate missing type');
  assert(Array.isArray(result.errors), 'errors should be an array');
  assert(result.errors.some((e) => e.message && e.message.includes('type')), 'error mentions "type"');
});

// ── Test 7: run() does not mutate the caller's blueprint object ────────────

test('run() does not mutate the original blueprint object', () => {
  const blueprint = {
    name: 'immutability-check',
    schema_version: '1.1.0',
    gates: [
      { id: 'g1', type: 'agent', prompt: 'Hello {{who}}' }
    ]
  };
  const originalKeys = Object.keys(blueprint).sort().join(',');

  silenceLog();
  run(blueprint, { who: 'World' });
  restoreLog();

  const afterKeys = Object.keys(blueprint).sort().join(',');
  assertEqual(afterKeys, originalKeys, 'blueprint keys unchanged after run()');
  assert(!('agents' in blueprint), 'blueprint.agents not added to original');
});

// ── Test 8: resolveInputs() resolves simple template ──────────────────────

test('resolveInputs() resolves {{name}} in template', () => {
  const result = resolveInputs('Hello {{name}}, welcome to {{place}}', { name: 'Alice', place: 'NOWS' });
  assertEqual(result, 'Hello Alice, welcome to NOWS', 'all variables resolved');
});

// ── Test 9: resolveInputs() leaves unresolved variables as-is ─────────────

test('resolveInputs() leaves missing variables as {{placeholder}}', () => {
  const result = resolveInputs('Run {{known}} vs {{missing}}', { known: 'tests' });
  assertEqual(result, 'Run tests vs {{missing}}', 'missing variable kept as-is');
});

// ── Run ─────────────────────────────────────────────────────────────────────

console.log('\nRunner run() Test Suite\n' + '='.repeat(40));

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
