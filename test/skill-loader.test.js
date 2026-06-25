'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadSkill, loadSkillWithCheck } = require('../lib/skill-loader');

// Setup: créer skill.json temporaire
const testDir = path.join(__dirname, 'temp_skills');
const skillPath = path.join(testDir, 'test-skill.json');

try { fs.mkdirSync(testDir, { recursive: true }); } catch (_) {}
fs.writeFileSync(skillPath, JSON.stringify({
  id: 'test-skill',
  name: 'Test Skill',
  gates: [{ id: 'g1', skill: null }]
}));

// Test 1: chargement mock
try {
  const skill = loadSkill('test-skill', { userSkillsDir: testDir });
  assert.strictEqual(skill.id, 'test-skill');
  assert.strictEqual(skill._loadedFrom, skillPath);
  console.log('Test 1 chargement mock: OK');
} catch (e) {
  console.error('Test 1 échoué:', e.message);
  process.exit(1);
}

// Test 2: not found error
try {
  loadSkill('non-existent', { userSkillsDir: testDir });
  assert.fail('Devrait lancer une erreur');
} catch (e) {
  assert.strictEqual(e.message.includes('non trouvé'), true);
  console.log('Test 2 not found error: OK');
}

// Test 3: cycle error
// Créer skill cyclique
const cycleDir = path.join(__dirname, 'temp_cycle');
const cyclePath1 = path.join(cycleDir, 'skill-a.json');
const cyclePath2 = path.join(cycleDir, 'skill-b.json');

try { fs.mkdirSync(cycleDir, { recursive: true }); } catch (_) {}
fs.writeFileSync(cyclePath1, JSON.stringify({
  id: 'skill-a',
  gates: [{ skill: 'skill-b' }]
}));
fs.writeFileSync(cyclePath2, JSON.stringify({
  id: 'skill-b',
  gates: [{ skill: 'skill-a' }]
}));

try {
  loadSkillWithCheck('skill-a', { userSkillsDir: cycleDir });
  assert.fail('Devrait détecter un cycle');
} catch (e) {
  assert.strictEqual(e.message.includes('cycle détecté'), true);
  console.log('Test 3 cycle error: OK');
}

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });
fs.rmSync(cycleDir, { recursive: true, force: true });

console.log('All skill-loader tests passed.');
