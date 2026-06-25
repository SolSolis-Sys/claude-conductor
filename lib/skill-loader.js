'use strict';
const fs = require('fs');
const path = require('path');

function loadSkill(skillId, { blueprintDir, blueprintsRoot, userSkillsDir } = {}) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const searchPaths = [
    blueprintDir && path.join(blueprintDir, 'skills', skillId, 'skill.json'),
    blueprintsRoot && path.join(blueprintsRoot, 'skills', skillId, 'skill.json'),
    userSkillsDir && path.join(userSkillsDir, `${skillId}.json`),
    path.join(home, '.claude', 'skills', `${skillId}.json`)
  ].filter(Boolean);

  for (const p of searchPaths) {
    try { return { ...JSON.parse(fs.readFileSync(p, 'utf8')), _loadedFrom: p }; } catch(_) {}
  }
  throw new Error(`skill-loader: skill "${skillId}" non trouvé. Cherché dans: ${searchPaths.join(', ')}`);
}

function loadSkillWithCheck(skillId, opts, visited = new Set()) {
  if (visited.has(skillId)) throw new Error(`skill-loader: cycle détecté — ${[...visited, skillId].join(' → ')}`);
  visited.add(skillId);
  const skill = loadSkill(skillId, opts);
  if (skill.gates) {
    for (const gate of skill.gates) {
      if (gate.skill) gate._resolvedSkill = loadSkillWithCheck(gate.skill, opts, new Set(visited));
    }
  }
  return skill;
}

module.exports = { loadSkill, loadSkillWithCheck };
