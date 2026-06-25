'use strict';

/**
 * validator.js — Minimal JSON Schema draft-07 validator (zero external dependencies)
 * Covers types, required, properties, minimum/maximum, minItems/maxItems, enum,
 * additionalProperties: false.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

/**
 * Collect validation errors for `data` against `schema`.
 * Errors are pushed into the `errors` array as { path, message } objects.
 *
 * @param {*} data
 * @param {object} schema
 * @param {string} path - current JSON path (dot-notation)
 * @param {Array<{path: string, message: string}>} errors
 */
function collectErrors(data, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  // ── type check ────────────────────────────────────────────────────────────
  if (schema.type !== undefined) {
    const valid = checkType(data, schema.type);
    if (!valid) {
      const actual = getTypeName(data);
      errors.push({
        path: path || '(root)',
        message: `Expected type "${schema.type}", got "${actual}"`
      });
      // Cannot meaningfully validate further if type is wrong
      return;
    }
  }

  // ── enum check ────────────────────────────────────────────────────────────
  if (Array.isArray(schema.enum)) {
    const match = schema.enum.some((v) => deepEqual(v, data));
    if (!match) {
      errors.push({
        path: path || '(root)',
        message: `Value ${JSON.stringify(data)} is not one of: ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`
      });
    }
  }

  // ── number constraints ────────────────────────────────────────────────────
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path: path || '(root)',
        message: `Value ${data} is less than minimum ${schema.minimum}`
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path: path || '(root)',
        message: `Value ${data} exceeds maximum ${schema.maximum}`
      });
    }
  }

  // ── string constraints ────────────────────────────────────────────────────
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path: path || '(root)',
        message: `String length ${data.length} is less than minLength ${schema.minLength}`
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path: path || '(root)',
        message: `String length ${data.length} exceeds maxLength ${schema.maxLength}`
      });
    }
  }

  // ── array constraints ─────────────────────────────────────────────────────
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path: path || '(root)',
        message: `Array length ${data.length} is less than minItems ${schema.minItems}`
      });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path: path || '(root)',
        message: `Array length ${data.length} exceeds maxItems ${schema.maxItems}`
      });
    }
    // Validate items schema
    if (schema.items && typeof schema.items === 'object') {
      data.forEach((item, idx) => {
        collectErrors(item, schema.items, `${path || '(root)'}[${idx}]`, errors);
      });
    }
  }

  // ── object constraints ────────────────────────────────────────────────────
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    const knownKeys = new Set(Object.keys(properties));

    // required fields
    for (const key of required) {
      if (!(key in data)) {
        const available = Object.keys(data);
        errors.push({
          path: path ? `${path}.${key}` : key,
          message: `Required field "${key}" is missing. Available fields: [${available.join(', ')}]`
        });
      }
    }

    // additionalProperties: false
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!knownKeys.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Additional property "${key}" is not allowed`
          });
        }
      }
    }

    // Recurse into properties
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in data) {
        const childPath = path ? `${path}.${key}` : key;
        collectErrors(data[key], propSchema, childPath, errors);
      }
    }
  }
}

/**
 * Check if `data` matches the expected `type` string (JSON Schema draft-07 semantics).
 * @param {*} data
 * @param {string} type
 * @returns {boolean}
 */
function checkType(data, type) {
  switch (type) {
    case 'string':  return typeof data === 'string';
    case 'number':  return typeof data === 'number' && !Number.isNaN(data);
    case 'integer': return Number.isInteger(data);
    case 'boolean': return typeof data === 'boolean';
    case 'null':    return data === null;
    case 'array':   return Array.isArray(data);
    case 'object':  return data !== null && typeof data === 'object' && !Array.isArray(data);
    default:        return true; // unknown type — permissive
  }
}

/**
 * Get a human-readable type name for error messages.
 * @param {*} value
 * @returns {string}
 */
function getTypeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Simple deep equality check for primitive values and plain structures.
 * Used for enum validation.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * validateAgainstSchema(data, schema) — validate `data` against a JSON Schema draft-07 subset.
 *
 * Supported keywords:
 *   type, required, properties, additionalProperties,
 *   minimum, maximum, minItems, maxItems, minLength, maxLength,
 *   enum, items
 *
 * @param {*} data
 * @param {object} schema
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
function validateAgainstSchema(data, schema) {
  const errors = [];
  collectErrors(data, schema, '', errors);
  return { valid: errors.length === 0, errors };
}

module.exports = { validateAgainstSchema };
