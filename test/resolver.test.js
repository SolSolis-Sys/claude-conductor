'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { setRoots, resolveRef, clearCache } = require('../lib/resolver');

// ── Local fixtures (cross-platform) ──────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-test-'));

fs.mkdirSync(path.join(TMP, 'agents', 'scope-guardian'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'agents', 'scope-guardian', 'agent.json'), JSON.stringify({
  id: 'scope-guardian', type: 'agent', role: 'security scanner', prompt: 'Check {{blueprint}} for issues'
}));

fs.mkdirSync(path.join(TMP, 'tools', 'write_file'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'tools', 'write_file', 'tool.json'), JSON.stringify({
  id: 'write_file', type: 'tool', params: { path: { type: 'string' } }, output_schema: {}
}));

function reset() { clearCache(); }

// ── Tests ────────────────────────────────────────────────────────────────

console.log('    resolver.test.js');
console.log('=====================\n');

(function case_01() {
  reset();
  setRoots({ blueprints: TMP });
  const artefact = resolveRef('agents/scope-guardian');
  assert.strictEqual(artefact.id, 'scope-guardian');
  assert.strictEqual(artefact.type, 'agent');
  assert.strictEqual(artefact.role, 'security scanner');
  assert.strictEqual(typeof artefact.prompt, 'string');
  console.log('✓ 1. agents/scope-guardian → id,type,role,prompt');
})();

(function case_02() {
  reset();
  setRoots({ blueprints: TMP });
  const artefact = resolveRef('tools/write_file');
  assert.strictEqual(artefact.id, 'write_file');
  assert.strictEqual(artefact.type, 'tool');
  assert.strictEqual(typeof artefact.params, 'object');
  assert.strictEqual(typeof artefact.output_schema, 'object');
  console.log('✓ 2. tools/write_file → id,type,params,output_schema');
})();

(function case_03() {
  reset();
  setRoots({ blueprints: TMP });
  const artefact = resolveRef('agents/scope-guardian', {
    prompt: 'CUSTOM override',
    id: 'NEVER',
    type: 'tool'
  });
  assert.strictEqual(artefact.prompt, 'CUSTOM override');
  assert.strictEqual(artefact.id, 'scope-guardian');
  assert.strictEqual(artefact.type, 'agent');
  console.log('✓ 3. overrides → prompt overridden, id/type preserved');
})();

(function case_04() {
  reset();
  setRoots({ blueprints: TMP });
  let caught = null;
  try { resolveRef('agents/inexistant'); } catch(err) { caught = err; }
  assert(caught !== null, 'must throw');
  assert(caught.message.includes('not found'));
  assert(caught.message.includes('agents/inexistant'));
  console.log('✓ 4. ref invalide → Error with searched paths');
})();

(function case_05() {
  clearCache();
  setRoots({});
  let caught = null;
  try { resolveRef('agents/scope-guardian'); } catch(err) { caught = err; }
  assert(caught !== null, 'must throw');
  assert(caught.message.includes('setRoots must be called before resolveRef'));
  setRoots({ blueprints: TMP });
  console.log('✓ 5. setRoots non appelé → Error');
})();

(function case_06() {
  reset();
  setRoots({ blueprints: TMP });
  const artefact1 = resolveRef('tools/write_file');
  const artefact2 = resolveRef('tools/write_file');
  assert.strictEqual(artefact1, artefact2);
  console.log('✓ 6. cache: 2nd call returns same object');
})();

// ── Cleanup ──────────────────────────────────────────────────────────────

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n✅ all 6 tests passed');
