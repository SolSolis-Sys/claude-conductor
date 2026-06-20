#!/usr/bin/env node

/**
 * worktree-prune.js
 * CLI tool to prune orphaned git worktrees.
 * Usage: node scripts/worktree-prune.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, '..', 'hooks', 'worktree-manager.js'));

if (!worktreeManager.isGitAvailable()) {
  console.error('Error: Git is not available or not a git repository');
  process.exit(1);
}

const result = worktreeManager.pruneWorktrees();

if (result.success) {
  if (result.count === 0) {
    console.log('No orphaned worktrees to prune');
  } else {
    console.log(`Pruned ${result.count} orphaned worktree(s)`);
  }
  process.exit(0);
} else {
  console.error(`Error: ${result.error}`);
  process.exit(1);
}
