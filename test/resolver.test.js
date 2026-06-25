'use strict';

const assert = require('assert');
const path  = require('path');
const { setRoots, resolveRef, clearCache, listResolvable } = require('../lib/resolver');

// ── Fixtures ├──

const blueprints  = path.resolve('D:/Github-repo/conductor-blueprints');
const userTools   = 'C:/Users/carma/.claude/tools';
const userSkills  = 'C:/Users/carma/.claude/skills';

function reset() {
  clearCache();
}

// ── Tests ──

console.log('    resolver.test.js');
console.log('=====================\n');

(function case_01() {
  reset();
  setRoots({ blueprints, userTools, userSkills });
  const artefact = resolveRef('agents/scope-guardian');
  assert.strictEqual(artefact.id, 'scope-guardian');
  assert.strictEqual(artefact.type, 'agent');
  assert.strictEqual(artefact.role, 'scope-guardian');
  assert('prompt' in artefact);
  console.log('✓ 1. agents/scope-guardian → id,type,role,prompt');
})();

(function case_02() {
  reset();
  setRoots({ blueprints, userTools, userSkills });
  const artefact = resolveRef('tools/write_file');
  assert.strictEqual(artefact.id, 'write_file');
  assert.strictEqual(artefact.type, 'tool');
  assert('params' in artefact);
  assert('output_schema' in artefact);
  assert.strictEqual(artefact.params.path.type, 'string');
  console.log('✓ 2. tools/write_file → id,type,params,output_schema');
})();

(function case_03() {
  reset();
  setRoots({ blueprints, userTools, userSkills });
  const artefact = resolveRef('agents/scope-guardian', {
    prompt: 'CUSTOM override',
    id:     'NEVER',
    type:   'NEVER',
  });
  assert.strictEqual(artefact.id,    'scope-guardian');
  assert.strictEqual(artefact.type,  'agent');
  assert.strictEqual(artefact.prompt, 'CUSTOM override');
  console.log('✓ 3. overrides → prompt overridden, id/type preserved');
})();

(function case_04() {
  reset();
  setRoots({ blueprints, userTools, userSkills });
  let caught = null;
  try {
    resolveRef('agents/inexistant');
  } catch (err) {
    caught = err;
  }
  assert(caught !== null, 'must throw');
  assert(caught.message.includes('agents/inexistant'));
  assert(caught.message.includes('Searched in:'));
  console.log('✓ 4. ref invalide → Error with searched paths');
})();

(function case_05() {
  clearCache();
  setRoots({}); // clear all roots → null
  let caught = null;
  try {
    resolveRef('agents/scope-guardian');
  } catch (err) {
    caught = err;
  }
  assert(caught !== null, 'must throw');
  assert(caught.message.includes('setRoots must be called before resolveRef'));
  // Restore for subsequent tests
  setRoots({ blueprints, userTools, userSkills });
  console.log('✓ 5. setRoots non appelé → Error');
})();

(function case_06() {
  reset();
  setRoots({ blueprints, userTools, userSkills });
  const artefact1 = resolveRef('tools/write_file');
  const artefact2 = resolveRef('tools/write_file');
  assert.strictEqual(artefact1, artefact2);
  console.log('✓ 6. cache: 2nd call returns same object');
})();

console.log('\n✅ all 6 tests passed');
