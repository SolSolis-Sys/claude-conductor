'use strict';

/**
 * coercion.js — Blueprint v1 (agents[]) → v1.1 (gates[]) coercion
 * Zero dependency: pure Node.js, no external modules.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

/**
 * Build the gate id from index and role.
 * Rule 1: agents[].role → gates[].id = "g${index+1}-${role}"
 * @param {number} index
 * @param {string} role
 * @returns {string}
 */
function buildGateId(index, role) {
  return `g${index + 1}-${role}`;
}

/**
 * Map agents[].on_failure to gates[].on_fail_v1.
 * Rule 7:
 *   "abort" (or absent) → "stop"
 *   "retry"             → "retry"
 *   "continue"          → "skip"
 * @param {string|undefined} onFailure
 * @returns {string}
 */
function mapOnFailure(onFailure) {
  if (onFailure === 'retry') return 'retry';
  if (onFailure === 'continue') return 'skip';
  return 'stop'; // "abort" or absent
}

/**
 * Build a substitution map: output_var → gate id, for use in subsequent prompts.
 * Rule 5: agents[].output_var → remove; references {{output_var}} → {{g${index+1}-${role}}}
 * @param {Array} agents
 * @returns {Map<string, string>}  key = output_var value, value = gate id
 */
function buildSubstitutionMap(agents) {
  const map = new Map();
  agents.forEach((agent, index) => {
    if (agent.output_var) {
      const gateId = buildGateId(index, agent.role);
      map.set(agent.output_var, gateId);
    }
  });
  return map;
}

/**
 * Apply output_var substitutions in a string.
 * Replaces {{varName}} with {{gateId}} for all known mappings.
 * @param {string} str
 * @param {Map<string, string>} substMap
 * @returns {string}
 */
function applySubstitutions(str, substMap) {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const [varName, gateId] of substMap.entries()) {
    result = result.split(`{{${varName}}}`).join(`{{${gateId}}}`);
  }
  return result;
}

/**
 * Apply output_var substitutions to loop.exit_condition.
 * Rule 10: if contains ${role}.field → replace by g${index+1}-${role}.field
 * @param {string} exitCondition
 * @param {Map<string, string>} substMap
 * @param {Array} agents
 * @returns {string}
 */
function applyLoopSubstitutions(exitCondition, substMap, agents) {
  if (typeof exitCondition !== 'string') return exitCondition;
  let result = exitCondition;

  // Apply output_var → gateId substitutions first
  result = applySubstitutions(result, substMap);

  // Rule 10: replace ${role}.field patterns → g${index+1}-${role}.field
  agents.forEach((agent, index) => {
    if (!agent.role) return;
    const gateId = buildGateId(index, agent.role);
    // Match role.field (word boundary on role, any dotted field after)
    const rolePattern = new RegExp(`\\b${escapeRegex(agent.role)}\\.`, 'g');
    result = result.replace(rolePattern, `${gateId}.`);
  });

  return result;
}

/**
 * Escape a string for use in RegExp.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Coerce a single agent entry into a gate entry.
 * Rules 1-9.
 * @param {object} agent
 * @param {number} index
 * @param {Map<string, string>} substMap - substitutions for prompt strings (applied to THIS gate)
 * @returns {object} gate
 */
function coerceAgent(agent, index, substMap) {
  const role = agent.role || `agent${index + 1}`;
  const gateId = buildGateId(index, role);

  const gate = {};

  // Rule 1: id
  gate.id = gateId;

  // Rule 2: type (default "agent")
  const rawType = agent.type;
  gate.type = (rawType === 'tool') ? 'tool' : 'agent';

  // Rule 3: prompt (with substitutions from previous agents)
  if (agent.prompt !== undefined) {
    gate.prompt = applySubstitutions(agent.prompt, substMap);
  }

  // Rule 4: command (for type=tool)
  if (agent.command !== undefined) {
    gate.command = agent.command;
  }

  // Rule 5: output_var suppressed (do NOT copy to gate)

  // Rule 6: timeout_ms
  if (agent.timeout_ms !== undefined) {
    gate.timeout_ms = agent.timeout_ms;
  }

  // Rule 7: on_failure → on_fail_v1
  gate.on_fail_v1 = mapOnFailure(agent.on_failure);

  // Rule 8: count > 1 → parallel
  if (typeof agent.count === 'number' && agent.count > 1) {
    gate.parallel = agent.count;
  }

  // Rule 9: condition
  if (agent.condition !== undefined) {
    gate.condition = agent.condition;
  }

  return gate;
}

/**
 * coerceBlueprint(blueprint) — transform blueprint v1 (agents[]) to v1.1 (gates[]).
 *
 * Returns:
 *   { blueprint: {...coerced...}, coerced: boolean, warnings: string[] }
 *
 * Behavior:
 * - If blueprint already has gates[] → return as-is (no coercion), log info
 * - If blueprint has both agents[] AND gates[] → use gates[], warn agents[] ignored
 * - If blueprint has only agents[] → coerce, log count
 * - Function is PURE: never modifies the input object
 *
 * @param {object} blueprint
 * @returns {{ blueprint: object, coerced: boolean, warnings: string[] }}
 */
function coerceBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('coerceBlueprint: blueprint must be a non-null object');
  }

  const warnings = [];
  const bpName = blueprint.name || '(unnamed)';
  const hasGates = Array.isArray(blueprint.gates) && blueprint.gates.length >= 0;
  const hasAgents = Array.isArray(blueprint.agents);

  // Case: both agents[] and gates[] present → use gates[], warn
  if (hasGates && hasAgents && blueprint.agents.length > 0) {
    warnings.push(`Blueprint ${bpName}: agents[] ignored — gates[] takes priority`);
    console.log(`Blueprint ${bpName}: native gates[]`);
    const coerced = Object.assign({}, blueprint);
    delete coerced.agents;
    return { blueprint: coerced, coerced: false, warnings };
  }

  // Case: native gates[] only → pass through
  if (hasGates && !hasAgents) {
    console.log(`Blueprint ${bpName}: native gates[]`);
    return { blueprint: Object.assign({}, blueprint), coerced: false, warnings };
  }

  // Case: gates[] present (possibly empty) but no agents[] (edge case)
  if (hasGates && (!hasAgents || blueprint.agents.length === 0)) {
    console.log(`Blueprint ${bpName}: native gates[]`);
    return { blueprint: Object.assign({}, blueprint), coerced: false, warnings };
  }

  // Case: agents[] only → coerce
  if (!hasAgents || blueprint.agents.length === 0) {
    // No agents and no gates — return as-is, nothing to coerce
    return { blueprint: Object.assign({}, blueprint), coerced: false, warnings };
  }

  const agents = blueprint.agents;

  // Build substitution map from ALL agents (for forward references)
  const substMap = buildSubstitutionMap(agents);

  // Coerce each agent to a gate
  const gates = agents.map((agent, index) => coerceAgent(agent, index, substMap));

  // Handle loop.exit_condition substitution (Rule 10)
  let loop = blueprint.loop;
  if (loop && typeof loop === 'object' && typeof loop.exit_condition === 'string') {
    loop = Object.assign({}, loop, {
      exit_condition: applyLoopSubstitutions(loop.exit_condition, substMap, agents)
    });
  }

  // Build coerced blueprint (deep copy via spread for top-level fields)
  const coercedBp = Object.assign({}, blueprint);
  delete coercedBp.agents;
  coercedBp.gates = gates;
  if (loop !== blueprint.loop) {
    coercedBp.loop = loop;
  }

  const gateCount = gates.length;
  console.log(`Blueprint ${bpName}: coercion agents→gates (${gateCount} gate${gateCount !== 1 ? 's' : ''})`);

  return { blueprint: coercedBp, coerced: true, warnings };
}

module.exports = { coerceBlueprint };
