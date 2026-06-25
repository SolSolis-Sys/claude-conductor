'use strict';

/**
 * tool-registry.js — Deterministic tool execution registry for claude-conductor.
 * Zero dependency: pure Node.js built-ins only.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Shared context store (in-process, per runner lifetime) ──────────────────

const _sharedContext = {};

let _projectRoot = process.cwd();

// ── Security: run_shell whitelist ───────────────────────────────────────────

const ALLOWED_SHELL_COMMANDS = ['git', 'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3'];

// Args bloqués par binaire — bloquer les flags permettant l'exécution de code arbitraire
const BLOCKED_ARGS_BY_COMMAND = {
  node:    ['-e', '--eval', '-p', '--print', '-pe', '-r', '--require'],
  python:  ['-c', '--command'],
  python3: ['-c', '--command'],
  npm:     ['--registry'],
  npx:     ['--registry'],
  pip:     [],
  pip3:    [],
  git:     [],
};

// ── Tool implementations ────────────────────────────────────────────────────

const TOOLS = {

  /**
   * write_file — Create or overwrite a file, creating parent directories as needed.
   * @param {{ path: string, content: string, mode?: number }} params
   * @returns {{ success: true, path: string, bytes_written: number }}
   */
  write_file: function (params) {
    const filePath = _requireString(params, 'path', 'write_file');
    const content  = (params.content !== undefined && params.content !== null)
      ? String(params.content)
      : '';

    const absPath = path.resolve(filePath);

    // Validation : le chemin doit être dans le projet
    const relative = path.relative(_projectRoot, absPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`write_file: chemin hors projet. "${filePath}" → "${absPath}". Les fichiers doivent être dans le projet.`);
    }

    const dir     = path.dirname(absPath);

    // Create parent directories recursively if needed
    fs.mkdirSync(dir, { recursive: true });

    const writeOpts = { encoding: 'utf8' };
    if (typeof params.mode === 'number') {
      writeOpts.mode = params.mode;
    }

    fs.writeFileSync(absPath, content, writeOpts);

    return {
      success:       true,
      path:          absPath,
      bytes_written: Buffer.byteLength(content, 'utf8')
    };
  },

  /**
   * read_file — Read a file from disk.
   * @param {{ path: string, encoding?: string }} params
   * @returns {{ success: true, content: string, path: string }|{ success: false, error: string }}
   */
  read_file: function (params) {
    const filePath = _requireString(params, 'path', 'read_file');
    const encoding = (typeof params.encoding === 'string') ? params.encoding : 'utf8';
    const absPath  = path.resolve(filePath);

    try {
      const content = fs.readFileSync(absPath, { encoding });
      return { success: true, content, path: absPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * update_context — Store a key-value pair in the shared runner context.
   * @param {{ key: string, value: * }} params
   * @returns {{ success: true, key: string, value: * }}
   */
  update_context: function (params) {
    const key = _requireString(params, 'key', 'update_context');
    const value = params.value;
    _sharedContext[key] = value;
    return { success: true, key, value };
  },

  /**
   * run_shell — Execute an external command safely via execFileSync (no shell injection).
   * @param {{ command: string, args?: string[], cwd?: string, timeout_ms?: number }} params
   * @returns {{ success: true, stdout: string, exit_code: 0 }}
   */
  run_shell: function (params) {
    const command    = _requireString(params, 'command', 'run_shell');
    const args       = Array.isArray(params.args) ? params.args : [];
    const cwd        = (typeof params.cwd === 'string') ? params.cwd : process.cwd();
    const timeoutMs  = (typeof params.timeout_ms === 'number' && params.timeout_ms > 0)
      ? params.timeout_ms
      : 30000;

    if (!ALLOWED_SHELL_COMMANDS.includes(command)) {
      throw new Error(`run_shell: commande non autorisée "${command}". Autorisées: ${ALLOWED_SHELL_COMMANDS.join(', ')}`);
    }

    const blockedArgs = BLOCKED_ARGS_BY_COMMAND[command] || [];
    const badArg = args.find((a) => blockedArgs.includes(a));
    if (badArg) {
      throw new Error(`run_shell: argument "${badArg}" interdit pour "${command}". Risque d'exécution arbitraire.`);
    }

    const stdout = execFileSync(command, args, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8'
    });

    return { success: true, stdout: stdout || '', exit_code: 0 };
  },

  /**
   * git_add — Stage files via `git add`.
   * @param {{ files: string[] }} params
   * @returns {{ success: true, files_added: string[] }}
   */
  git_add: function (params) {
    if (!Array.isArray(params.files) || params.files.length === 0) {
      throw new Error('git_add: params.files must be a non-empty array of strings');
    }
    const files = params.files.map(String);
    execFileSync('git', ['add', ...files], { encoding: 'utf8' });
    return { success: true, files_added: files };
  },

  /**
   * git_commit — Create a commit via `git commit -m <message>`.
   * @param {{ message: string }} params
   * @returns {{ success: true, commit_hash?: string }}
   */
  git_commit: function (params) {
    const message = _requireString(params, 'message', 'git_commit');
    const stdout  = execFileSync('git', ['commit', '-m', message], { encoding: 'utf8' });

    // Try to extract short hash from output (e.g. "[main abc1234] ...")
    const hashMatch = stdout.match(/\[.*?\s+([a-f0-9]{6,})\]/);
    const result = { success: true };
    if (hashMatch) result.commit_hash = hashMatch[1];
    return result;
  },

  /**
   * git_stash — Stash current changes.
   * @param {{ message?: string }} params
   * @returns {{ success: true }}
   */
  git_stash: function (params) {
    const args = ['stash'];
    if (typeof params.message === 'string' && params.message.length > 0) {
      args.push('push', '-m', params.message);
    }
    execFileSync('git', args, { encoding: 'utf8' });
    return { success: true };
  }

};

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Require a string property from params, throw a helpful error if missing.
 * @param {object} params
 * @param {string} key
 * @param {string} toolId
 * @returns {string}
 */
function _requireString(params, key, toolId) {
  if (!params || typeof params[key] !== 'string' || params[key].length === 0) {
    throw new Error(`${toolId}: params.${key} must be a non-empty string`);
  }
  return params[key];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute a tool by name with resolved params.
 *
 * @param {string} toolId  - tool name (e.g. "write_file")
 * @param {object} params  - tool params (variables already resolved by runner)
 * @returns {{ success: boolean, ...output }}
 */
function executeTool(toolId, params) {
  if (typeof toolId !== 'string' || !TOOLS[toolId]) {
    const available = Object.keys(TOOLS).join(', ');
    throw new Error(`Unknown tool: '${toolId}'. Available: ${available}`);
  }
  return TOOLS[toolId](params || {});
}

/**
 * Return the list of available tool names.
 * @returns {string[]}
 */
function listTools() {
  return Object.keys(TOOLS);
}

/**
 * Expose shared context (read-only snapshot) for inspection/testing.
 * @returns {object}
 */
function getContext() {
  return Object.assign({}, _sharedContext);
}

/**
 * Override the project root used for path-traversal validation in write_file.
 * Call before tests or when the runner starts in a non-cwd project root.
 * @param {string} root - absolute path to project root
 */
function setProjectRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('setProjectRoot: root must be a non-empty string');
  }
  _projectRoot = root;
}

module.exports = { executeTool, listTools, getContext, setProjectRoot };
