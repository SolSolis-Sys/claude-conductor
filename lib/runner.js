'use strict';

/**
 * runner.js — Blueprint loader and resolver for claude-conductor.
 * Zero dependency: pure Node.js, no external modules.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const path = require('path');
const { coerceBlueprint } = require('./coercion');
const { validateAgainstSchema } = require('./validator');
const { setRoots, resolveRef } = require('./resolver');

// ── Schema for gates[] validation (v1.1 subset) ────────────────────────────

const GATE_SCHEMA = {
  type: 'object',
  required: ['id', 'type'],
  properties: {
    id:          { type: 'string' },
    type:        { type: 'string', enum: ['agent', 'tool'] },
    prompt:      { type: 'string' },
    command:     { type: 'string' },
    timeout_ms:  { type: 'number', minimum: 0 },
    on_fail_v1:  { type: 'string', enum: ['stop', 'retry', 'skip'] },
    parallel:    { type: 'number', minimum: 2 },
    condition:   { type: 'string' }
  }
};

const BLUEPRINT_GATES_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name:           { type: 'string' },
    version:        { type: 'string' },
    schema_version: { type: 'string' },
    description:    { type: 'string' },
    gates: {
      type: 'array',
      minItems: 0,
      items: GATE_SCHEMA
    },
    loop: { type: 'object' }
  }
};

// ── Version detection helpers ───────────────────────────────────────────────

/**
 * Returns true if schema_version matches "1.1.x" (e.g. "1.1.0", "1.1.3").
 * @param {string} v
 * @returns {boolean}
 */
function isV11(v) {
  return typeof v === 'string' && /^1\.1(\.\d+)?$/.test(v);
}

/**
 * Returns true if schema_version is absent, "1.0.x", or the legacy sentinel values.
 * @param {string|undefined} v
 * @returns {boolean}
 */
function isV1(v) {
  if (v === undefined || v === null) return true;
  return typeof v === 'string' && /^1\.0\.\d+$/.test(v);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load and resolve a blueprint file.
 *
 * Returns { blueprint, gates, coerced, warnings }
 *   blueprint   — resolved blueprint object (with gates[])
 *   gates       — array of gate objects (always present, may be [])
 *   coerced     — true if agents[] was coerced to gates[]
 *   warnings    — array of warning strings
 *
 * @param {string} blueprintPath — absolute or relative path to a JSON file
 * @returns {{ blueprint: object, gates: object[], coerced: boolean, warnings: string[] }}
 */
function loadBlueprint(blueprintPath) {
  const absPath = path.resolve(blueprintPath);

  // 1. Read file
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    throw new Error(`[runner] Cannot read blueprint at "${absPath}": ${err.message}`);
  }

  // 2. Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[runner] Invalid JSON in "${absPath}": ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[runner] Blueprint root must be a JSON object in "${absPath}"`);
  }

  setRoots({ blueprints: process.cwd() });
  return _resolveBlueprint(parsed);
}

/**
 * Internal: resolve an already-parsed blueprint object.
 * Separated from loadBlueprint so tests can pass inline objects.
 *
 * @param {object} parsed
 * @returns {{ blueprint: object, gates: object[], coerced: boolean, warnings: string[] }}
 */
function _resolveBlueprint(parsed) {
  const warnings = [];
  const sv = parsed.schema_version;

  const hasGates  = Array.isArray(parsed.gates);
  const hasAgents = Array.isArray(parsed.agents) && parsed.agents.length > 0;

  // Warn when both arrays are present (coercion.js will handle priority,
  // but we add an explicit runner-level log here for visibility)
  if (hasGates && hasAgents) {
    const msg = `[runner] WARNING: agents[] ignoré (gates[] présent)`;
    warnings.push(msg);
    console.log(msg);
  }

  let result;

  if (isV11(sv)) {
    // Native v1.1 path — gates[] expected
    const gateCount = hasGates ? parsed.gates.length : 0;
    console.log(`[runner] blueprint v1.1 natif (${gateCount} gate${gateCount !== 1 ? 's' : ''})`);
    // Still run through coerceBlueprint to normalize (it passes gates[] through unchanged)
    result = coerceBlueprint(parsed);
    // Propagate any agents[] warnings from coercion
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
  } else if (isV1(sv)) {
    // v1 path — coerce agents[] → gates[]
    result = coerceBlueprint(parsed);
    if (result.coerced) {
      const gateCount = result.blueprint.gates ? result.blueprint.gates.length : 0;
      console.log(`[runner] coercion v1→v1.1 (${gateCount} gate${gateCount !== 1 ? 's' : ''})`);
    }
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
  } else {
    // Unknown version — attempt coercion, warn
    const msg = `[runner] WARNING: schema_version '${sv}' inconnue, tentative coercion`;
    warnings.push(msg);
    console.log(msg);
    result = coerceBlueprint(parsed);
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
  }

  const resolvedBlueprint = result.blueprint;
  const gates = Array.isArray(resolvedBlueprint.gates) ? resolvedBlueprint.gates : [];

  // Résolution des ref: après coercion
  // ponytail: setRoots prod-default; tests appellent setRoots() eux-mêmes avant _resolveBlueprint
  for (const gate of gates) {
    if (gate.ref) {
      // resolveRef(_merge) preserve id/type from artefact, gate fields override rest
      const artefact = resolveRef(gate.ref, gate);
      // Force type par préfixe si artefact n'a pas de type déclaré
      if (gate.ref.startsWith('tools/')) artefact.type = 'tool';
      else if (gate.ref.startsWith('skills/')) artefact.type = 'skill';
      Object.assign(gate, artefact);
      if (process.env.DEBUG) {
        console.error(`[runner] ref résolu: ${gate.ref} → gate ${gate.id}`);
      }
    }
  }

  // T2.5 — Normalize loop.on_max_rounds (default: "fail" if absent or invalid)
  if (resolvedBlueprint.loop && typeof resolvedBlueprint.loop === 'object') {
    const validOnMax = new Set(['stop', 'fail', 'warn']);
    const current    = resolvedBlueprint.loop.on_max_rounds;
    if (current === undefined || current === null || !validOnMax.has(current)) {
      if (current !== undefined && current !== null) {
        const msg = `[runner] WARNING: loop.on_max_rounds="${current}" invalide, défaut "fail" appliqué`;
        warnings.push(msg);
        console.log(msg);
      }
      resolvedBlueprint.loop = Object.assign({}, resolvedBlueprint.loop, { on_max_rounds: 'fail' });
    }
  }

  return {
    blueprint: resolvedBlueprint,
    gates,
    coerced: result.coerced,
    warnings
  };
}

/**
 * Validate gates[] against the blueprint v1.1 gate schema.
 * Returns { valid, errors }
 *
 * @param {object} blueprint — resolved blueprint (must have gates[])
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
function validateGates(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    return { valid: false, errors: [{ path: '(root)', message: 'blueprint must be a non-null object' }] };
  }

  const result = validateAgainstSchema(blueprint, BLUEPRINT_GATES_SCHEMA);
  return { valid: result.valid, errors: result.errors };
}

/**
 * Resolve {{variables}} in a template string from an inputs object.
 * Variables not found in inputs are left as-is ({{variable_name}}).
 * Returns { resolved, warnings }.
 *
 * @param {string} template
 * @param {object} inputs
 * @returns {{ resolved: string, warnings: string[] }}
 */
function resolveVariables(template, inputs) {
  if (typeof template !== 'string') {
    return { resolved: template, warnings: [] };
  }

  const warnings = [];
  const safeInputs = (inputs && typeof inputs === 'object') ? inputs : {};

  const resolved = template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const key = varName.trim();
    if (Object.prototype.hasOwnProperty.call(safeInputs, key)) {
      return String(safeInputs[key]);
    }
    warnings.push(`[runner] Variable non résolue: {{${key}}}`);
    return match; // keep original placeholder
  });

  return { resolved, warnings };
}

/**
 * Validate output of gate N against input_schema of gate N+1.
 * Only runs if:
 *   - gateN has output_schema AND output_format === "json"
 *   - gateNplus1 has input_schema
 *
 * @param {object} gateN       - resolved gate N definition
 * @param {object} outputN     - actual output produced by gate N
 * @param {object} gateNplus1  - resolved gate N+1 definition
 * @returns {{ valid: boolean, errors: string[], message?: string }}
 */
function validateInterGate(gateN, outputN, gateNplus1) {
  // Only validate when both schemas exist and gateN emits JSON
  const hasOutputSchema  = gateN && gateN.output_schema && typeof gateN.output_schema === 'object';
  const isJsonOutput     = gateN && gateN.output_format === 'json';
  const hasInputSchema   = gateNplus1 && gateNplus1.input_schema && typeof gateNplus1.input_schema === 'object';

  if (!hasOutputSchema || !isJsonOutput || !hasInputSchema) {
    return { valid: true, errors: [] };
  }

  const errors = [];
  const inputSchema = gateNplus1.input_schema;

  // Check required fields from input_schema
  const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];
  const safeOutput = (outputN && typeof outputN === 'object' && !Array.isArray(outputN)) ? outputN : {};

  for (const field of required) {
    if (!(field in safeOutput)) {
      errors.push(`champ requis "${field}" manquant.`);
    }
  }

  if (errors.length === 0) {
    return { valid: true, errors: [] };
  }

  const message = [
    `[gate: ${gateN.id} → ${gateNplus1.id}]`,
    `Output produit: ${JSON.stringify(outputN)}`,
    `Input attendu: ${_describeInputSchema(inputSchema)}`,
    `Erreur: ${errors.join(' ')}`
  ].join('\n');

  return { valid: false, errors, message };
}

/**
 * Build a human-readable summary of an input_schema for error messages.
 * @param {object} schema
 * @returns {string}
 */
function _describeInputSchema(schema) {
  if (!schema || !schema.properties) {
    return JSON.stringify(schema);
  }
  const parts = [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const [key] of Object.entries(schema.properties)) {
    parts.push(`"${key}": ${required.has(key) ? '<requis>' : '<optionnel>'}`);
  }
  return '{' + parts.join(', ') + '}';
}

/**
 * Validate the loop config block.
 *
 * @param {object} loop
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateLoop(loop) {
  if (!loop || typeof loop !== 'object') {
    return { valid: false, warnings: ['loop must be a non-null object'] };
  }

  const warnings = [];

  // max_rounds > 0
  if (typeof loop.max_rounds !== 'number' || loop.max_rounds <= 0) {
    warnings.push('loop.max_rounds must be a positive number');
  }

  // exit_condition non vide
  if (typeof loop.exit_condition !== 'string' || loop.exit_condition.trim().length === 0) {
    warnings.push('loop.exit_condition must be a non-empty string');
  }

  // on_max_rounds doit être stop/fail/warn
  const validOnMax = new Set(['stop', 'fail', 'warn']);
  if (loop.on_max_rounds !== undefined && !validOnMax.has(loop.on_max_rounds)) {
    warnings.push(`loop.on_max_rounds must be one of: stop, fail, warn (got "${loop.on_max_rounds}")`);
  }

  return { valid: warnings.length === 0, warnings };
}

// ── Dry-run helpers ────────────────────────────────────────────────────────

/**
 * Format a Date as YYYYMMDD-HHmmss.
 * @param {Date} d
 * @returns {string}
 */
function _formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * Dry-run: resolve all gates without executing LLM/tools.
 * Logs each gate with its resolved prompt to console.
 * Returns array of { id, type, resolvedPrompt, variables }.
 *
 * @param {object}  blueprint        — resolved blueprint (with gates[])
 * @param {object}  [inputs={}]      — variable substitution map
 * @param {object}  [options={}]     — { outputDir?: string }
 * @returns {Array<{ id: string, type: string, resolvedPrompt: string|null, variables: string[] }>}
 */
function dryRun(blueprint, inputs, options) {
  const safeInputs = (inputs && typeof inputs === 'object') ? inputs : {};
  const safeOpts   = (options && typeof options === 'object') ? options : {};
  const gates      = Array.isArray(blueprint.gates) ? blueprint.gates : [];
  const allWarnings = [];
  const output = [];
  const logLines = [];

  function emit(line) {
    console.log(line);
    logLines.push(line);
  }

  emit(`\n[runner] dry-run — ${gates.length} gate${gates.length !== 1 ? 's' : ''}`);
  emit('='.repeat(50));

  // Loop info (T2.4)
  const loop = blueprint.loop;
  if (loop && typeof loop === 'object') {
    const maxRounds     = typeof loop.max_rounds === 'number' ? loop.max_rounds : '?';
    const exitCondition = typeof loop.exit_condition === 'string' ? loop.exit_condition : '?';
    emit(`LOOP: exit_condition='${exitCondition}' max_rounds=${maxRounds} (1 passe simulée)`);
  }

  for (const gate of gates) {
    let resolvedPrompt = null;
    const gateVariables = [];

    if (gate.type === 'agent' && typeof gate.prompt === 'string') {
      const { resolved, warnings } = resolveVariables(gate.prompt, safeInputs);
      resolvedPrompt = resolved;
      if (warnings.length > 0) {
        for (const w of warnings) {
          allWarnings.push(w);
          emit(w);
        }
      }
      // Collect variable names found in the template (resolved or not)
      const matches = gate.prompt.match(/\{\{([^}]+)\}\}/g) || [];
      for (const m of matches) {
        gateVariables.push(m.replace(/\{\{|\}\}/g, '').trim());
      }
    } else if (gate.type === 'tool' && typeof gate.command === 'string') {
      const { resolved, warnings } = resolveVariables(gate.command, safeInputs);
      resolvedPrompt = resolved;
      if (warnings.length > 0) {
        for (const w of warnings) {
          allWarnings.push(w);
          emit(w);
        }
      }
      const matches = gate.command.match(/\{\{([^}]+)\}\}/g) || [];
      for (const m of matches) {
        gateVariables.push(m.replace(/\{\{|\}\}/g, '').trim());
      }
    }

    const entry = {
      id:             gate.id,
      type:           gate.type,
      resolvedPrompt,
      variables:      gateVariables
    };

    output.push(entry);

    // Log gate summary
    emit(`\n  gate: ${gate.id} [${gate.type}]`);
    if (resolvedPrompt !== null) {
      const preview = resolvedPrompt.length > 100
        ? resolvedPrompt.slice(0, 97) + '...'
        : resolvedPrompt;
      emit(`  prompt/cmd: ${preview}`);
    }
    if (gateVariables.length > 0) {
      emit(`  variables:  ${gateVariables.join(', ')}`);
    }
    if (gate.on_fail_v1) {
      emit(`  on_fail:    ${gate.on_fail_v1}`);
    }
    if (gate.condition) {
      emit(`  condition:  ${gate.condition}`);
    }
    // output_schema hint (T2.4)
    if (gate.output_schema && typeof gate.output_schema === 'object') {
      const fieldCount = Object.keys(gate.output_schema.properties || gate.output_schema).length;
      emit(`  (output_schema déclaré: ${fieldCount} champ${fieldCount !== 1 ? 's' : ''} attendus)`);
    }
  }

  emit('\n' + '='.repeat(50));
  if (allWarnings.length > 0) {
    emit(`[runner] ${allWarnings.length} warning(s) during dry-run`);
  }

  // Write log to file if outputDir provided (T2.4)
  if (typeof safeOpts.outputDir === 'string') {
    const bpName    = (blueprint.name || 'blueprint').replace(/[^a-zA-Z0-9_-]/g, '-');
    const timestamp = _formatTimestamp(new Date());
    const logDir    = path.resolve(safeOpts.outputDir, '.dry-runs');
    const logFile   = path.join(logDir, `${bpName}-${timestamp}.log`);
    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(logFile, logLines.join('\n') + '\n', 'utf8');
      console.log(`[runner] dry-run log written: ${logFile}`);
    } catch (err) {
      console.warn(`[runner] could not write dry-run log: ${err.message}`);
    }
  }

  return output;
}

module.exports = { loadBlueprint, validateGates, resolveVariables, dryRun, validateInterGate, validateLoop };

// Export internal for tests
module.exports._resolveBlueprint = _resolveBlueprint;
