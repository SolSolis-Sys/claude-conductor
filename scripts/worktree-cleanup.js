#!/usr/bin/env node

/**
 * worktree-cleanup.js
 * CLI tool to clean up a git worktree after an agent dispatch.
 * Usage: node scripts/worktree-cleanup.js <agent-name>
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, '..', 'hooks', 'worktree-manager.js'));

const agentName = process.argv[2];

if (!agentName) {
  console.error('Usage: node scripts/worktree-cleanup.js <agent-name>');
  process.exit(1);
}

if (!worktreeManager.isGitAvailable()) {
  console.error('Error: Git is not available or not a git repository');
  process.exit(1);
}

const result = worktreeManager.removeWorktree(agentName);

if (result.success) {
  console.log(`Cleaned up worktree: ${result.removed}`);
  process.exit(0);
} else {
  console.error(`Error: ${result.error}`);
  process.exit(1);
}
