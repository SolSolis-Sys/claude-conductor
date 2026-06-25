'use strict';

const fs   = require('fs');
const path = require('path');

// ── Resolution roots (priority order) ──
let _blueprintsRoot = null;  // conductor-blueprints/
let _userToolsRoot  = null;  // ~/.claude/tools/
let _userSkillsRoot = null;  // ~/.claude/skills/

// ── In-memory cache (process lifetime) ──
const _cache = new Map();

// ── Internal helpers ──

function _requireRoots() {
  if (_blueprintsRoot === null && _userToolsRoot === null && _userSkillsRoot === null) {
    throw new Error('setRoots must be called before resolveRef');
  }
}

/**
 * Try to load JSON from a path. Returns parsed object or null if not found.
 * Throws on parse errors (bad JSON = real error, not "not found").
 */
function _tryLoad(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Attempt all candidate filenames under a directory.
 * Returns { data, resolvedPath } or null.
 */
function _tryDir(dir, candidates) {
  for (const candidate of candidates) {
    const full = path.join(dir, candidate);
    const data = _tryLoad(full);
    if (data !== null) return { data, resolvedPath: full };
  }
  return null;
}

// ── API ──

/**
 * setRoots({ blueprints, userTools, userSkills })
 * Configure resolution paths. Call once at startup.
 */
function setRoots({ blueprints, userTools, userSkills } = {}) {
  _blueprintsRoot = blueprints  ? path.resolve(blueprints)  : null;
  _userToolsRoot  = userTools   ? path.resolve(userTools)   : null;
  _userSkillsRoot = userSkills  ? path.resolve(userSkills)  : null;
}

/**
 * resolveRef(ref, overrides?) → normalised artefact
 *
 * ref format: "agents/<name>" | "tools/<name>" | "skills/<name>"
 *
 * Resolution order:
 *   1. Cache
 *   2. conductor-blueprints/<ref>/agent.json|tool.json|skill.json
 *   3. ~/.claude/tools/<name>.json or <name>/tool.json   (tools only)
 *   4. ~/.claude/skills/<name>/skill.json                (skills only)
 *
 * Overrides: merged on top BUT never replace `id` or `type` from artefact.
 */
function resolveRef(ref, overrides = {}) {
  _requireRoots();

  if (typeof ref !== 'string' || !ref) {
    throw new Error('resolveRef: ref must be a non-empty string');
  }

  // 1. Cache hit
  if (_cache.has(ref)) {
    const cached = _cache.get(ref);
    // Still apply overrides on top (overrides are per-call, not cached)
    return _merge(cached, overrides);
  }

  const searched = [];
  let result = null;

  // Parse ref segment: "agents/scope-guardian" → segment="agents", name="scope-guardian"
  const slashIdx = ref.indexOf('/');
  const segment  = slashIdx >= 0 ? ref.slice(0, slashIdx)  : null;
  const name     = slashIdx >= 0 ? ref.slice(slashIdx + 1) : ref;

  // 2. conductor-blueprints/
  if (_blueprintsRoot) {
    // Determine candidate filenames based on segment
    const fileBySegment = {
      agents: ['agent.json'],
      tools:  ['tool.json'],
      skills: ['skill.json'],
    };
    const candidates = fileBySegment[segment] || ['agent.json', 'tool.json', 'skill.json'];
    const dir = path.join(_blueprintsRoot, ref);
    searched.push(dir);

    const found = _tryDir(dir, candidates);
    if (found) {
      result = found.data;
    }
  }

  // 3. ~/.claude/tools/ (tools segment only)
  if (!result && segment === 'tools' && _userToolsRoot) {
    const dirPath = path.join(_userToolsRoot, name);
    searched.push(path.join(_userToolsRoot, name + '.json'));
    searched.push(path.join(dirPath, 'tool.json'));

    const flat = _tryLoad(path.join(_userToolsRoot, name + '.json'));
    if (flat) {
      result = flat;
    } else {
      const nested = _tryLoad(path.join(dirPath, 'tool.json'));
      if (nested) result = nested;
    }
  }

  // 4. ~/.claude/skills/ (skills segment only)
  if (!result && segment === 'skills' && _userSkillsRoot) {
    const skillPath = path.join(_userSkillsRoot, name, 'skill.json');
    searched.push(skillPath);
    const data = _tryLoad(skillPath);
    if (data) result = data;
  }

  if (!result) {
    throw new Error(
      `ref "${ref}" not found. Searched in:\n` +
      searched.map(p => `  - ${p}`).join('\n')
    );
  }

  // Cache raw artefact (without per-call overrides)
  _cache.set(ref, result);

  return _merge(result, overrides);
}

/**
 * Merge overrides on top of artefact.
 * `id` and `type` from artefact are always preserved.
 */
function _merge(artefact, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return artefact;
  return {
    ...artefact,
    ...overrides,
    id:   artefact.id,
    type: artefact.type,
  };
}

/**
 * clearCache() — flush cache (for tests / hot-reload)
 */
function clearCache() {
  _cache.clear();
}

/**
 * listResolvable(basePath) → string[] of available refs under basePath
 *
 * Walks one level deep: basePath/<segment>/<name>/
 * Returns refs in form "<segment>/<name>"
 */
function listResolvable(basePath) {
  const resolved = path.resolve(basePath);
  const refs = [];

  let segments;
  try {
    segments = fs.readdirSync(resolved, { withFileTypes: true });
  } catch {
    return refs;
  }

  for (const seg of segments) {
    if (!seg.isDirectory()) continue;
    const segPath = path.join(resolved, seg.name);
    let names;
    try {
      names = fs.readdirSync(segPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of names) {
      if (!entry.isDirectory()) continue;
      refs.push(`${seg.name}/${entry.name}`);
    }
  }

  return refs;
}

module.exports = { setRoots, resolveRef, clearCache, listResolvable };
