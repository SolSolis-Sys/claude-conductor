/**
 * worktree-manager.js
 * Git worktree lifecycle management for conductor dispatches.
 * Zero dependencies: Node.js built-ins only (child_process, fs, path, os)
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKTREES_DIR = '.worktrees';
const WORKTREES_REGISTRY = '.conductor-worktrees.json';

/**
 * Check if git is available and the directory is a git repository.
 * @returns {boolean}
 */
function isGitAvailable() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the absolute path to the project root (git root).
 * @returns {string|null}
 */
function getProjectRoot() {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return root;
  } catch {
    return null;
  }
}

/**
 * Get the current git branch or HEAD commit hash.
 * @returns {string}
 */
function getCurrentRef() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
  } catch {
    return 'HEAD';
  }
}

/**
 * Create a new worktree for an agent.
 * @param {string} agentName - agent identifier (e.g., "backend-agent", "reviewer")
 * @returns {object} { success: boolean, path?: string, error?: string }
 */
function createWorktree(agentName) {
  const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
  if (!VALID_NAME.test(agentName)) {
    return { success: false, error: `Invalid agent name: ${agentName}` };
  }

  if (!isGitAvailable()) {
    return { success: false, error: 'Git not available or not a git repository' };
  }

  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return { success: false, error: 'Cannot determine git root' };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const worktreeName = `${agentName}-${timestamp}`;
  const worktreePath = path.join(projectRoot, WORKTREES_DIR, worktreeName);

  // Ensure .worktrees directory exists
  const worktreesRoot = path.join(projectRoot, WORKTREES_DIR);
  if (!fs.existsSync(worktreesRoot)) {
    fs.mkdirSync(worktreesRoot, { recursive: true });
  }

  try {
    // Create worktree at detached HEAD (current commit)
    execFileSync('git', ['worktree', 'add', worktreePath, 'HEAD'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    // Record in registry
    recordWorktree(projectRoot, agentName, worktreePath, timestamp);

    return {
      success: true,
      path: worktreePath,
      agentName,
      timestamp,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to create worktree: ${e.message}`,
    };
  }
}

/**
 * Remove a worktree for an agent.
 * @param {string} agentName - agent identifier
 * @returns {object} { success: boolean, removed?: string, error?: string }
 */
function removeWorktree(agentName) {
  const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
  if (!VALID_NAME.test(agentName)) {
    return { success: false, error: `Invalid agent name: ${agentName}` };
  }

  if (!isGitAvailable()) {
    return { success: false, error: 'Git not available' };
  }

  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return { success: false, error: 'Cannot determine git root' };
  }

  // Find the most recent worktree for this agent
  const worktreesRoot = path.join(projectRoot, WORKTREES_DIR);
  if (!fs.existsSync(worktreesRoot)) {
    return { success: false, error: `No worktrees found for agent: ${agentName}` };
  }

  const entries = fs.readdirSync(worktreesRoot);
  const agentWorktrees = entries
    .filter((e) => e.startsWith(`${agentName}-`))
    .sort((a, b) => {
      const tsA = parseInt(a.split('-').pop(), 10);
      const tsB = parseInt(b.split('-').pop(), 10);
      return tsB - tsA; // newest first
    });

  if (agentWorktrees.length === 0) {
    return { success: false, error: `No worktrees found for agent: ${agentName}` };
  }

  const worktreeName = agentWorktrees[0];
  const worktreePath = path.join(worktreesRoot, worktreeName);

  try {
    // Remove worktree
    execFileSync('git', ['worktree', 'remove', worktreePath], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    // Prune orphaned refs
    execFileSync('git', ['worktree', 'prune'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    // Unrecord in registry
    unrecordWorktree(projectRoot, agentName);

    return {
      success: true,
      removed: worktreePath,
      agentName,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to remove worktree: ${e.message}`,
    };
  }
}

/**
 * List all active worktrees.
 * @returns {array} Array of worktree objects
 */
function listWorktrees() {
  if (!isGitAvailable()) {
    return [];
  }

  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return [];
  }

  const worktreesRoot = path.join(projectRoot, WORKTREES_DIR);
  if (!fs.existsSync(worktreesRoot)) {
    return [];
  }

  const entries = fs.readdirSync(worktreesRoot);
  const result = [];

  for (const entry of entries) {
    const worktreePath = path.join(worktreesRoot, entry);
    const isDir = fs.statSync(worktreePath).isDirectory();

    if (!isDir) continue;

    const parts = entry.split('-');
    const timestamp = parseInt(parts[parts.length - 1], 10);
    const agentName = parts.slice(0, -1).join('-');

    // Check if worktree is still valid
    let isValid = false;
    try {
      const headFile = path.join(worktreePath, '.git');
      if (fs.existsSync(headFile)) {
        isValid = true;
      }
    } catch {
      // ignore
    }

    result.push({
      name: entry,
      path: worktreePath,
      agentName,
      timestamp,
      valid: isValid,
    });
  }

  return result;
}

/**
 * Prune orphaned worktrees.
 * @returns {object} { success: boolean, count: number, error?: string }
 */
function pruneWorktrees() {
  if (!isGitAvailable()) {
    return { success: false, count: 0, error: 'Git not available' };
  }

  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return { success: false, count: 0, error: 'Cannot determine git root' };
  }

  try {
    execFileSync('git', ['worktree', 'prune'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    // Count remaining worktrees
    const worktrees = listWorktrees();
    const orphaned = worktrees.filter((w) => !w.valid).length;

    return {
      success: true,
      count: orphaned,
    };
  } catch (e) {
    return {
      success: false,
      count: 0,
      error: `Prune failed: ${e.message}`,
    };
  }
}

/**
 * Record a worktree in the registry.
 * @param {string} projectRoot
 * @param {string} agentName
 * @param {string} worktreePath
 * @param {number} timestamp
 */
function recordWorktree(projectRoot, agentName, worktreePath, timestamp) {
  const registryPath = path.join(projectRoot, WORKTREES_REGISTRY);
  let registry = {};

  try {
    if (fs.existsSync(registryPath)) {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
  } catch {
    registry = {};
  }

  if (!registry.worktrees) {
    registry.worktrees = [];
  }

  registry.worktrees.push({
    agentName,
    path: worktreePath,
    timestamp,
    created: new Date().toISOString(),
  });

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

/**
 * Unrecord a worktree from the registry.
 * @param {string} projectRoot
 * @param {string} agentName
 */
function unrecordWorktree(projectRoot, agentName) {
  const registryPath = path.join(projectRoot, WORKTREES_REGISTRY);

  try {
    if (!fs.existsSync(registryPath)) return;

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (!registry.worktrees) return;

    registry.worktrees = registry.worktrees.filter((w) => w.agentName !== agentName);

    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Export environment variable string for a worktree.
 * Formats the path for both shell and JavaScript consumption.
 * @param {string} worktreePath - absolute path to worktree
 * @returns {string} "CONDUCTOR_WORKTREE_PATH=/absolute/path/to/worktree"
 */
function getWorktreeEnv(worktreePath) {
  // Normalize path separators for cross-platform compatibility
  const normalized = worktreePath.replace(/\\/g, '/');
  return `CONDUCTOR_WORKTREE_PATH=${normalized}`;
}

module.exports = {
  isGitAvailable,
  getProjectRoot,
  getCurrentRef,
  createWorktree,
  removeWorktree,
  listWorktrees,
  pruneWorktrees,
  getWorktreeEnv,
  WORKTREES_DIR,
  WORKTREES_REGISTRY,
};
