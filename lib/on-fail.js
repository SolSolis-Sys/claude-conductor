'use strict';

/**
 * on-fail.js — Gate error resolution engine for claude-conductor.
 * Zero dependency: pure Node.js, no external modules.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

// ── Supported actions ──────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(['stop', 'retry', 'fallback', 'log_only', 'skip']);

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Clamp to a safe integer; used when max_retries is missing or invalid.
 * @param {*} v
 * @param {number} def
 * @returns {number}
 */
function safeInt(v, def) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  return def;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute on_fail logic for a gate.
 *
 * @param {object|null|undefined} onFail   - the on_fail config from gate (may be absent)
 * @param {string}  gateId                 - gate identifier (for logging)
 * @param {Error}   error                  - the error that occurred
 * @param {object}  context                - { attempt: number, gates: object[], currentIndex: number }
 * @returns {{ action: 'stop'|'retry'|'fallback'|'fallback_blueprint'|'log_only'|'skip', target?: string }}
 */
function resolveOnFail(onFail, gateId, error, context) {
  // Default: absent on_fail → stop immediately
  if (!onFail || typeof onFail !== 'object') {
    logOnFail(gateId, 'stop', 0, 0, error);
    return { action: 'stop' };
  }

  const action  = typeof onFail.action === 'string' ? onFail.action : 'stop';
  const attempt = (context && typeof context.attempt === 'number') ? context.attempt : 1;

  // Guard: unknown action → treat as stop
  if (!VALID_ACTIONS.has(action)) {
    const msg = `[on_fail] gate=${gateId} unknown action="${action}", falling back to stop`;
    console.warn(msg);
    logOnFail(gateId, 'stop', attempt, 0, error);
    return { action: 'stop' };
  }

  // ── stop ──────────────────────────────────────────────────────────────────
  if (action === 'stop') {
    logOnFail(gateId, 'stop', attempt, 0, error);
    return { action: 'stop' };
  }

  // ── log_only ──────────────────────────────────────────────────────────────
  if (action === 'log_only') {
    logOnFail(gateId, 'log_only', attempt, 0, error);
    return { action: 'log_only' };
  }

  // ── skip (maps from v1 "continue") ────────────────────────────────────────
  if (action === 'skip') {
    logOnFail(gateId, 'skip', attempt, 0, error);
    return { action: 'skip' };
  }

  // ── retry ─────────────────────────────────────────────────────────────────
  if (action === 'retry') {
    const maxRetries = safeInt(onFail.max_retries, 3);

    if (attempt <= maxRetries) {
      logOnFail(gateId, 'retry', attempt, maxRetries, error);
      return { action: 'retry' };
    }

    // Exhausted — check on_exhausted
    const onExhausted = onFail.on_exhausted;
    if (onExhausted && typeof onExhausted === 'object') {
      const exAction = onExhausted.action;

      if (exAction === 'fallback') {
        const target = onExhausted.fallback_gate || onExhausted.fallback_blueprint;
        const isBp   = !onExhausted.fallback_gate && onExhausted.fallback_blueprint;
        logOnFail(gateId, isBp ? 'fallback_blueprint' : 'fallback', attempt, maxRetries, error);
        return {
          action: isBp ? 'fallback_blueprint' : 'fallback',
          target
        };
      }

      if (exAction === 'stop') {
        logOnFail(gateId, 'stop', attempt, maxRetries, error);
        return { action: 'stop' };
      }

      if (exAction === 'log_only') {
        logOnFail(gateId, 'log_only', attempt, maxRetries, error);
        return { action: 'log_only' };
      }

      if (exAction === 'skip') {
        logOnFail(gateId, 'skip', attempt, maxRetries, error);
        return { action: 'skip' };
      }
    }

    // No on_exhausted or unrecognised → default stop
    logOnFail(gateId, 'stop', attempt, maxRetries, error);
    return { action: 'stop' };
  }

  // ── fallback ──────────────────────────────────────────────────────────────
  if (action === 'fallback') {
    if (onFail.fallback_blueprint) {
      logOnFail(gateId, 'fallback_blueprint', attempt, 0, error);
      return { action: 'fallback_blueprint', target: onFail.fallback_blueprint };
    }
    if (onFail.fallback_gate) {
      logOnFail(gateId, 'fallback', attempt, 0, error);
      return { action: 'fallback', target: onFail.fallback_gate };
    }
    // fallback declared but no target → stop
    const msg = `[on_fail] gate=${gateId} action=fallback but no fallback_gate/fallback_blueprint defined, falling back to stop`;
    console.warn(msg);
    logOnFail(gateId, 'stop', attempt, 0, error);
    return { action: 'stop' };
  }

  // Should never reach here
  logOnFail(gateId, 'stop', attempt, 0, error);
  return { action: 'stop' };
}

/**
 * Log an on_fail event to console.warn.
 * Format: [on_fail] gate=<id> action=<action> attempt=<N>/<max> error="<msg>"
 *
 * @param {string} gateId
 * @param {string} action
 * @param {number} attempt
 * @param {number} maxRetries  - 0 when not applicable
 * @param {Error|null} error
 */
function logOnFail(gateId, action, attempt, maxRetries, error) {
  const attemptPart = maxRetries > 0
    ? `attempt=${attempt}/${maxRetries}`
    : `attempt=${attempt}`;
  const errorMsg = (error && error.message) ? error.message : String(error);
  console.warn(`[on_fail] gate=${gateId} action=${action} ${attemptPart} error="${errorMsg}"`);
}

module.exports = { resolveOnFail, logOnFail };
