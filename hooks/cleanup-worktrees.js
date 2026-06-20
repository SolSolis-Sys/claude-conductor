/**
 * cleanup-worktrees.js
 * SessionStop hook to clean up orphaned git worktrees created by conductor.
 * Zero dependencies: uses worktree-manager module and Node.js built-ins.
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, 'worktree-manager.js'));

try {
  // Prune all orphaned worktrees at session end
  // This handles worktrees that were created but not explicitly cleaned up
  const result = worktreeManager.pruneWorktrees();

  if (result.success && result.count > 0) {
    // Silently succeed — verbose logging would clutter SessionStop
  }
} catch (_) {
  // Silent — never crash a SessionStop hook
}
