'use strict';
// Vendored from conductor-blueprints/lib/dependency-resolver.js
// Keep in sync manually when conductor-blueprints updates this file.
// Copyright © 2026 SolSolis-Sys — MIT License

function resolveDependencies(blueprint, catalog) {
  const requires = blueprint.requires || [];
  if (!requires.length) return { resolved: [], missing: [], circular: [] };

  const allItems = { ...catalog.agents, ...catalog.tools, ...catalog.skills };
  const visited = new Set();
  const resolved = [];
  const missing = [];
  const circular = [];
  const path = []; // stack for cycle detection

  function visit(id) {
    const idx = path.indexOf(id);
    if (idx !== -1) {
      circular.push(path.slice(idx).concat(id));
      return;
    }
    if (visited.has(id)) return;

    const item = allItems[id];
    if (!item) {
      if (!missing.includes(id)) missing.push(id);
      return;
    }

    path.push(id);
    const subReqs = item.requires || [];
    for (const r of subReqs) visit(r);
    path.pop();

    visited.add(id);
    if (!resolved.includes(id)) resolved.push(id);
  }

  for (const r of requires) visit(r);

  // Ordre topologique : les deps avant les dépendants
  return { resolved, missing, circular };
}

module.exports = { resolveDependencies };
