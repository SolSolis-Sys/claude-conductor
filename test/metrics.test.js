'use strict';
const assert = require('assert');
const { MetricsCollector } = require('../lib/metrics');

// Test 1: succès
const mc1 = new MetricsCollector();
mc1.startGate('g1');
mc1.endGate('g1', { success: true, tokens: 100 });
const r1 = mc1.flush();
assert.strictEqual(r1.gates.g1.attempts, 1);
assert.strictEqual(r1.gates.g1.success, true);
assert.strictEqual(r1.gates.g1.tokens, 100);
assert.strictEqual(r1.total_gates, 1);
console.log('Test 1 succès: OK');

// Test 2: échec + retry
const mc2 = new MetricsCollector();
mc2.startGate('g2');
mc2.endGate('g2', { success: false, tokens: 50, error: 'err1' });
mc2.startGate('g2');
mc2.endGate('g2', { success: true, tokens: 75 });
const r2 = mc2.flush();
assert.strictEqual(r2.gates.g2.attempts, 2);
assert.strictEqual(r2.gates.g2.success, true);
assert.strictEqual(r2.gates.g2.tokens, 125);
assert.strictEqual(r2.gates.g2.errors.length, 1);
console.log('Test 2 échec+retry: OK');

// Test 3: flush total
const mc3 = new MetricsCollector();
mc3.startGate('g3');
mc3.endGate('g3', { success: true, tokens: 200 });
mc3.startGate('g4');
mc3.endGate('g4', { success: false, tokens: 300 });
const r3 = mc3.flush();
assert.strictEqual(r3.total_duration_ms >= 0, true);
assert.strictEqual(r3.total_tokens, 500);
assert.strictEqual(r3.total_gates, 2);
console.log('Test 3 flush total: OK');

console.log('All metrics tests passed.');
