#!/usr/bin/env node

/**
 * runner.test.js
 * Tests for loadBlueprint(), validateGates(), resolveVariables(), dryRun().
 * Run: node test/runner.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const { resolveVariables, validateGates, dryRun } = require(path.join(__dirname, '..', 'lib', 'runner'));
const { _resolveBlueprint } = require(path.join(__dirname, '..', 'lib', 'runner'));
const { setRoots, clearCache } = require(path.join(__dirname, '..', 'lib', 'resolver'));

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

// ── Suppress console.log during tests (keep stderr) ───────────────────────
// We capture logs where needed but otherwise silence runner noise.
const originalLog = console.log;
function silenceLog() { console.log = () => {}; }
function restoreLog() { console.log = originalLog; }

// ── Test 1: loadBlueprint on v1 blueprint (agents[]) → coercion ────────────

test('Test 1: v1 blueprint (agents[]) → coercion applied', () => {
  const bpV1 = {
    name: 'test-v1',
    version: '1.0.0',
    agents: [
      { role: 'finder', prompt: 'Find all bugs', output_var: 'bugs' },
      { role: 'fixer',  prompt: 'Fix: {{bugs}}' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bpV1);
  restoreLog();

  assert(result.coerced === true, 'coerced should be true for agents[] blueprint');
  assert(Array.isArray(result.gates), 'gates should be an array');
  assertEqual(result.gates.length, 2, 'should have 2 gates');
  assertEqual(result.gates[0].id, 'g1-finder', 'first gate id');
  assertEqual(result.gates[1].id, 'g2-fixer',  'second gate id');
  // output_var substitution applied
  assertEqual(result.gates[1].prompt, 'Fix: {{g1-finder}}', 'output_var substituted');
  assert(Array.isArray(result.warnings), 'warnings is array');
});

// ── Test 2: v1.1 blueprint (gates[]) → native path ────────────────────────

test('Test 2: v1.1 blueprint (gates[]) → native path, not coerced', () => {
  const bpV11 = {
    name: 'test-v11',
    schema_version: '1.1.0',
    gates: [
      { id: 'g1-scanner', type: 'agent', prompt: 'Scan the repo' },
      { id: 'g2-reporter', type: 'agent', prompt: 'Write report' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bpV11);
  restoreLog();

  assert(result.coerced === false, 'coerced should be false for native v1.1');
  assert(Array.isArray(result.gates), 'gates should be array');
  assertEqual(result.gates.length, 2, 'gates count preserved');
  assertEqual(result.gates[0].id, 'g1-scanner', 'gate id preserved');
  assert(Array.isArray(result.warnings), 'warnings is array');
  assertEqual(result.warnings.length, 0, 'no warnings for clean v1.1');
});

// ── Test 3: resolveVariables — happy path ──────────────────────────────────

test('Test 3: resolveVariables("Hello {{name}}", {name: "World"}) → "Hello World"', () => {
  const { resolved, warnings } = resolveVariables('Hello {{name}}', { name: 'World' });
  assertEqual(resolved, 'Hello World', 'resolved string');
  assertEqual(warnings.length, 0, 'no warnings');
});

// ── Test 4: resolveVariables — missing variable ────────────────────────────

test('Test 4: resolveVariables with missing variable → keeps {{name}} + warning', () => {
  const { resolved, warnings } = resolveVariables('Hello {{name}}', {});
  assertEqual(resolved, 'Hello {{name}}', 'placeholder preserved when variable missing');
  assert(warnings.length > 0, 'warning issued for missing variable');
  assert(warnings[0].includes('name'), 'warning mentions variable name');
});

// ── Test 5: dryRun returns array of gates with resolved prompts ────────────

test('Test 5: dryRun returns array of gates with resolvedPrompt', () => {
  const blueprint = {
    name: 'dry-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'g1-greeter', type: 'agent',  prompt: 'Hello {{who}}' },
      { id: 'g2-runner',  type: 'tool',   command: 'npm test' }
    ]
  };
  const inputs = { who: 'World' };

  silenceLog();
  const output = dryRun(blueprint, inputs);
  restoreLog();

  assert(Array.isArray(output), 'output is array');
  assertEqual(output.length, 2, 'one entry per gate');

  // Gate 1 — agent with variable
  assertEqual(output[0].id, 'g1-greeter', 'gate 1 id');
  assertEqual(output[0].type, 'agent', 'gate 1 type');
  assertEqual(output[0].resolvedPrompt, 'Hello World', 'variable resolved in prompt');
  assert(output[0].variables.includes('who'), 'variable name tracked');

  // Gate 2 — tool with command
  assertEqual(output[1].id, 'g2-runner', 'gate 2 id');
  assertEqual(output[1].type, 'tool', 'gate 2 type');
  assertEqual(output[1].resolvedPrompt, 'npm test', 'command resolved');
});

// ── Test 6: both agents[] and gates[] → gates prioritaire + warning ────────

test('Test 6: both agents[] and gates[] → gates priority + warning', () => {
  const bpMixed = {
    name: 'mixed',
    schema_version: '1.1.0',
    agents: [
      { role: 'old-agent', prompt: 'Old path' }
    ],
    gates: [
      { id: 'g1-new', type: 'agent', prompt: 'New path' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bpMixed);
  restoreLog();

  // gates[] is prioritaire → no coercion
  assert(result.coerced === false, 'coerced false — gates takes priority');
  assertEqual(result.gates.length, 1, 'only native gate present');
  assertEqual(result.gates[0].id, 'g1-new', 'native gate id preserved');

  // Warning must be issued
  assert(result.warnings.length > 0, 'warning issued for agents[] + gates[] conflict');
  const w = result.warnings.join(' ');
  assert(w.toLowerCase().includes('agents'), 'warning mentions agents[]');
});

// ── Additional: resolveVariables with multiple variables ───────────────────

test('Additional: resolveVariables with multiple variables in one template', () => {
  const { resolved, warnings } = resolveVariables(
    'Hello {{first}} {{last}}, you are {{age}} years old',
    { first: 'Jane', last: 'Doe', age: 30 }
  );
  assertEqual(resolved, 'Hello Jane Doe, you are 30 years old', 'all variables resolved');
  assertEqual(warnings.length, 0, 'no warnings');
});

// ── Additional: validateGates on valid blueprint ───────────────────────────

test('Additional: validateGates valid blueprint → valid=true', () => {
  const blueprint = {
    name: 'valid-bp',
    gates: [
      { id: 'g1-check', type: 'agent', prompt: 'Check code' }
    ]
  };
  const { valid, errors } = validateGates(blueprint);
  assert(valid === true, `valid should be true, errors: ${JSON.stringify(errors)}`);
  assertEqual(errors.length, 0, 'no errors');
});

// ── Additional: validateGates detects missing required fields ──────────────

test('Additional: validateGates detects gate missing required "type"', () => {
  const blueprint = {
    name: 'invalid-bp',
    gates: [
      { id: 'g1-check' } // missing type
    ]
  };
  const { valid, errors } = validateGates(blueprint);
  assert(valid === false, 'valid should be false');
  assert(errors.length > 0, 'errors present');
  assert(errors.some((e) => e.message.includes('type')), 'error mentions "type"');
});

// ── Additional: unknown schema_version → warning ───────────────────────────

test('Additional: unknown schema_version → warning issued', () => {
  const bpUnknown = {
    name: 'future-bp',
    schema_version: '2.0.0',
    gates: [{ id: 'g1-x', type: 'agent', prompt: 'Do something' }]
  };

  silenceLog();
  const result = _resolveBlueprint(bpUnknown);
  restoreLog();

  assert(Array.isArray(result.warnings), 'warnings is array');
  const w = result.warnings.join(' ');
  assert(w.includes('2.0.0'), 'warning includes unknown version');
  assert(w.toLowerCase().includes('inconnue') || w.toLowerCase().includes('unknown') || w.toLowerCase().includes('tentative'),
    'warning mentions unknown/coercion attempt');
});

// ── ref: resolution tests ──────────────────────────────────────────────────

const TMP_REF = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'runner-ref-'));
require('fs').mkdirSync(require('path').join(TMP_REF, 'agents', 'scope-guardian'), { recursive: true });
require('fs').writeFileSync(require('path').join(TMP_REF, 'agents', 'scope-guardian', 'agent.json'), JSON.stringify({
  id: 'scope-guardian', type: 'agent', role: 'security scanner', prompt: 'Check {{blueprint}} for issues'
}));
require('fs').mkdirSync(require('path').join(TMP_REF, 'tools', 'read_file'), { recursive: true });
require('fs').writeFileSync(require('path').join(TMP_REF, 'tools', 'read_file', 'tool.json'), JSON.stringify({
  id: 'read_file', type: 'tool', params: { path: { type: 'string' } }, output_schema: {}
}));

test('ref: agent gate → résolu avec id/type/prompt', () => {
  clearCache();
  setRoots({ blueprints: TMP_REF });

  const bp = {
    name: 'ref-agent-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'placeholder', type: 'agent', ref: 'agents/scope-guardian' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bp);
  restoreLog();

  const gate = result.gates[0];
  assertEqual(gate.id,   'scope-guardian',              'id from artefact');
  assertEqual(gate.type, 'agent',                       'type from artefact');
  assert(gate.prompt && typeof gate.prompt === 'string', 'prompt from artefact');
});

test('ref: tool gate → type forcé "tool"', () => {
  clearCache();
  setRoots({ blueprints: TMP_REF });

  const bp = {
    name: 'ref-tool-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'placeholder', type: 'agent', ref: 'tools/read_file' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bp);
  restoreLog();

  const gate = result.gates[0];
  assertEqual(gate.id,   'read_file', 'id from artefact');
  assertEqual(gate.type, 'tool',      'type forced tool');
  assert(gate.params && typeof gate.params === 'object', 'params from artefact');
});

test('ref: gate prompt override écrase prompt artefact', () => {
  clearCache();
  setRoots({ blueprints: TMP_REF });

  const bp = {
    name: 'ref-override-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'placeholder', type: 'agent', ref: 'agents/scope-guardian', prompt: 'Custom override prompt' }
    ]
  };

  silenceLog();
  const result = _resolveBlueprint(bp);
  restoreLog();

  const gate = result.gates[0];
  assertEqual(gate.id,     'scope-guardian',    'id still from artefact');
  assertEqual(gate.prompt, 'Custom override prompt', 'gate prompt overrides artefact');
});

test('ref: invalide → erreur propagée', () => {
  clearCache();
  setRoots({ blueprints: TMP_REF });

  const bp = {
    name: 'ref-invalid-test',
    schema_version: '1.1.0',
    gates: [
      { id: 'x', type: 'agent', ref: 'agents/does-not-exist' }
    ]
  };

  silenceLog();
  let threw = false;
  let errMsg = '';
  try {
    _resolveBlueprint(bp);
  } catch (e) {
    threw = true;
    errMsg = e.message;
  } finally {
    restoreLog();
  }
  assert(threw, 'should throw for unknown ref');
  assert(errMsg.includes('does-not-exist'), 'error mentions missing ref');
});

// ── Run ─────────────────────────────────────────────────────────────────────

console.log('\nRunner Test Suite\n' + '='.repeat(40));

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

try { require('fs').rmSync(TMP_REF, { recursive: true, force: true }); } catch(_) {}
process.exit(failed > 0 ? 1 : 0);
