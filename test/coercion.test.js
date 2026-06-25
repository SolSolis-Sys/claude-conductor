#!/usr/bin/env node

/**
 * coercion.test.js
 * Tests for coerceBlueprint() — 10 coercion rules + validator tests.
 * Run: node test/coercion.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const { coerceBlueprint } = require(path.join(__dirname, '..', 'lib', 'coercion'));
const { validateAgainstSchema } = require(path.join(__dirname, '..', 'lib', 'validator'));

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

function assertDeepEqual(a, b, message) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${message} — expected ${sb}, got ${sa}`);
}

// ── Coercion Tests — 10 rules ──────────────────────────────────────────────

// Rule 1: agents[].role → gates[].id = "g${index+1}-${role}"
test('Rule 1: role → gate id', () => {
  const bp = { name: 'test', version: '1.0.0', agents: [{ role: 'finder', prompt: 'Find bugs' }] };
  const result = coerceBlueprint(bp);
  assert(result.coerced === true, 'coerced should be true');
  assertEqual(result.blueprint.gates[0].id, 'g1-finder', 'gate id');
});

// Rule 2: agents[].type → gates[].type (default "agent")
test('Rule 2: type default "agent"', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [
      { role: 'finder', prompt: 'Find bugs' },
      { role: 'runner', type: 'tool', command: 'npm test' },
      { role: 'checker', type: 'agent', prompt: 'Check' }
    ]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].type, 'agent', 'absent type → agent');
  assertEqual(result.blueprint.gates[1].type, 'tool', 'type=tool → tool');
  assertEqual(result.blueprint.gates[2].type, 'agent', 'type=agent → agent');
});

// Rule 3: agents[].prompt → gates[].prompt (inchangé)
test('Rule 3: prompt copied unchanged (when no substitution)', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [{ role: 'finder', prompt: 'Find all bugs in the code' }]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].prompt, 'Find all bugs in the code', 'prompt unchanged');
});

// Rule 4: agents[].command → gates[].command (pour type=tool)
test('Rule 4: command copied for tool type', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [{ role: 'runner', type: 'tool', command: 'npm test --coverage' }]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].command, 'npm test --coverage', 'command copied');
});

// Rule 5: output_var suppressed + substitution in subsequent prompts
test('Rule 5: output_var suppressed and substituted in later prompts', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [
      { role: 'finder', prompt: 'Find bugs', output_var: 'bugs_found' },
      { role: 'fixer', prompt: 'Fix these: {{bugs_found}}' }
    ]
  };
  const result = coerceBlueprint(bp);
  // output_var should NOT appear in gate
  assert(!('output_var' in result.blueprint.gates[0]), 'output_var not in gate');
  // substitution in second gate prompt
  assertEqual(
    result.blueprint.gates[1].prompt,
    'Fix these: {{g1-finder}}',
    'output_var substituted with gate id'
  );
});

// Rule 6: agents[].timeout_ms → gates[].timeout_ms (inchangé)
test('Rule 6: timeout_ms copied unchanged', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [{ role: 'slow', prompt: 'Do slow work', timeout_ms: 30000 }]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].timeout_ms, 30000, 'timeout_ms');
});

// Rule 7: on_failure mapping
test('Rule 7: on_failure → on_fail_v1 mapping', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [
      { role: 'a', prompt: 'A' },                         // absent → stop
      { role: 'b', prompt: 'B', on_failure: 'abort' },    // abort → stop
      { role: 'c', prompt: 'C', on_failure: 'retry' },    // retry → retry
      { role: 'd', prompt: 'D', on_failure: 'continue' }  // continue → skip
    ]
  };
  const result = coerceBlueprint(bp);
  const gates = result.blueprint.gates;
  assertEqual(gates[0].on_fail_v1, 'stop', 'absent → stop');
  assertEqual(gates[1].on_fail_v1, 'stop', 'abort → stop');
  assertEqual(gates[2].on_fail_v1, 'retry', 'retry → retry');
  assertEqual(gates[3].on_fail_v1, 'skip', 'continue → skip');
});

// Rule 8: agents[].count > 1 → gates[].parallel
test('Rule 8: count > 1 → parallel', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [
      { role: 'single', prompt: 'Do once' },
      { role: 'multi', prompt: 'Do many', count: 5 }
    ]
  };
  const result = coerceBlueprint(bp);
  assert(!('parallel' in result.blueprint.gates[0]), 'no parallel when count absent');
  assertEqual(result.blueprint.gates[1].parallel, 5, 'parallel = count');
});

// Rule 9: agents[].condition → gates[].condition (inchangé)
test('Rule 9: condition copied unchanged', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [{ role: 'guarded', prompt: 'Run if OK', condition: '{{prev.status}} === "ok"' }]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].condition, '{{prev.status}} === "ok"', 'condition unchanged');
});

// Rule 10: loop.exit_condition role.field → g${index+1}-${role}.field
test('Rule 10: loop exit_condition role.field substitution', () => {
  const bp = {
    name: 'test', version: '1.0.0',
    agents: [
      { role: 'finder', prompt: 'Find bugs' },
      { role: 'verifier', prompt: 'Verify' }
    ],
    loop: {
      max_iterations: 5,
      exit_condition: 'verifier.done === true && finder.count === 0'
    }
  };
  const result = coerceBlueprint(bp);
  const exitCond = result.blueprint.loop.exit_condition;
  assert(exitCond.includes('g2-verifier.done'), `verifier → g2-verifier: got "${exitCond}"`);
  assert(exitCond.includes('g1-finder.count'), `finder → g1-finder: got "${exitCond}"`);
});

// Behavior: native v1.1 blueprint (has gates[]) → no coercion
test('Behavior: native gates[] blueprint passes through unmodified', () => {
  const bp = {
    name: 'native', version: '1.1.0',
    gates: [{ id: 'g1-scanner', type: 'agent', prompt: 'Scan' }]
  };
  const result = coerceBlueprint(bp);
  assert(result.coerced === false, 'coerced should be false');
  assert(Array.isArray(result.blueprint.gates), 'gates preserved');
  assertEqual(result.blueprint.gates[0].id, 'g1-scanner', 'gate id preserved');
  assert(!result.blueprint.agents, 'no agents field');
});

// Behavior: both agents[] and gates[] → gates[] prioritaire, warning
test('Behavior: both agents[] and gates[] → gates priority + warning', () => {
  const bp = {
    name: 'mixed', version: '1.0.0',
    agents: [{ role: 'old', prompt: 'Old prompt' }],
    gates: [{ id: 'g1-new', type: 'agent', prompt: 'New prompt' }]
  };
  const result = coerceBlueprint(bp);
  assert(result.coerced === false, 'coerced false when gates takes priority');
  assert(result.warnings.length > 0, 'warning issued');
  assert(result.warnings[0].includes('agents[]'), 'warning mentions agents[]');
  assert(!result.blueprint.agents, 'agents[] removed from output');
  assertEqual(result.blueprint.gates[0].id, 'g1-new', 'original gate id preserved');
});

// Purity: input blueprint not mutated
test('Purity: input blueprint not mutated', () => {
  const bp = {
    name: 'immutable', version: '1.0.0',
    agents: [{ role: 'finder', prompt: 'Find', output_var: 'x' }]
  };
  const agentsBefore = JSON.stringify(bp.agents);
  coerceBlueprint(bp);
  assertEqual(JSON.stringify(bp.agents), agentsBefore, 'agents array not mutated');
  assert('agents' in bp, 'original bp still has agents');
  assert(!('gates' in bp), 'original bp has no gates added');
});

// Multi-gate: ids follow index correctly
test('Multi-gate: gate ids follow g${i+1}-${role} for all agents', () => {
  const bp = {
    name: 'multi', version: '1.0.0',
    agents: [
      { role: 'alpha', prompt: 'A' },
      { role: 'beta', prompt: 'B' },
      { role: 'gamma', prompt: 'C' }
    ]
  };
  const result = coerceBlueprint(bp);
  assertEqual(result.blueprint.gates[0].id, 'g1-alpha', 'gate 1 id');
  assertEqual(result.blueprint.gates[1].id, 'g2-beta', 'gate 2 id');
  assertEqual(result.blueprint.gates[2].id, 'g3-gamma', 'gate 3 id');
});

// ── Validator Tests ────────────────────────────────────────────────────────

test('Validator: valid object against schema', () => {
  const schema = {
    type: 'object',
    required: ['name', 'score'],
    properties: {
      name: { type: 'string' },
      score: { type: 'number', minimum: 0, maximum: 100 }
    }
  };
  const data = { name: 'Alice', score: 87 };
  const result = validateAgainstSchema(data, schema);
  assert(result.valid === true, 'valid should be true');
  assertEqual(result.errors.length, 0, 'no errors');
});

test('Validator: required field missing → error with available fields', () => {
  const schema = {
    type: 'object',
    required: ['name', 'status'],
    properties: {
      name: { type: 'string' },
      status: { type: 'string' }
    }
  };
  const data = { name: 'Bob' };
  const result = validateAgainstSchema(data, schema);
  assert(result.valid === false, 'valid should be false');
  assert(result.errors.length > 0, 'errors present');
  assert(result.errors[0].message.includes('status'), 'error mentions missing field');
  assert(result.errors[0].message.includes('name'), 'error mentions available fields');
});

test('Validator: wrong type → error', () => {
  const schema = {
    type: 'object',
    properties: {
      count: { type: 'number' }
    }
  };
  const data = { count: 'not-a-number' };
  const result = validateAgainstSchema(data, schema);
  assert(result.valid === false, 'valid should be false');
  assert(result.errors[0].message.includes('"number"'), 'error mentions expected type');
  assert(result.errors[0].message.includes('"string"'), 'error mentions actual type');
});

test('Validator: enum invalid → error', () => {
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'done', 'failed'] }
    }
  };
  const data = { status: 'running' };
  const result = validateAgainstSchema(data, schema);
  assert(result.valid === false, 'valid should be false');
  assert(result.errors[0].message.includes('running'), 'error mentions bad value');
  assert(result.errors[0].message.includes('pending'), 'error mentions valid values');
});

test('Validator: additionalProperties false → rejects unknown keys', () => {
  const schema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    additionalProperties: false
  };
  const data = { name: 'valid', unexpected: true };
  const result = validateAgainstSchema(data, schema);
  assert(result.valid === false, 'valid should be false');
  assert(result.errors[0].message.includes('unexpected'), 'error mentions extra key');
});

test('Validator: minItems / maxItems on array', () => {
  const schema = { type: 'array', minItems: 2, maxItems: 4 };
  const tooFew = validateAgainstSchema([], schema);
  assert(tooFew.valid === false, 'empty array fails minItems');
  const justRight = validateAgainstSchema([1, 2, 3], schema);
  assert(justRight.valid === true, '3 items passes');
  const tooMany = validateAgainstSchema([1, 2, 3, 4, 5], schema);
  assert(tooMany.valid === false, '5 items fails maxItems');
});

test('Validator: minimum / maximum on number', () => {
  const schema = { type: 'number', minimum: 10, maximum: 20 };
  assert(validateAgainstSchema(5, schema).valid === false, 'below minimum');
  assert(validateAgainstSchema(15, schema).valid === true, 'within range');
  assert(validateAgainstSchema(25, schema).valid === false, 'above maximum');
});

// ── Run ────────────────────────────────────────────────────────────────────

console.log('\nCoercion + Validator Test Suite\n' + '='.repeat(40));

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

const coercionTests = tests.filter((t) => t.name.startsWith('Rule') || t.name.startsWith('Behavior') || t.name.startsWith('Purity') || t.name.startsWith('Multi'));
const validatorTests = tests.filter((t) => t.name.startsWith('Validator'));

console.log('\n' + '='.repeat(40));
console.log(`Coercion rules tested : ${coercionTests.length}`);
console.log(`Validator tests       : ${validatorTests.length}`);
console.log(`Total: ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
