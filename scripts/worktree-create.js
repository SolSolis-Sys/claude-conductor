#!/usr/bin/env node

/**
 * worktree-create.js
 * CLI tool to create a git worktree for an agent dispatch.
 * Usage: node scripts/worktree-create.js <agent-name>
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, '..', 'hooks', 'worktree-manager.js'));

const agentName = process.argv[2];

if (!agentName) {
  console.error('Usage: node scripts/worktree-create.js <agent-name>');
  process.exit(1);
}

if (!worktreeManager.isGitAvailable()) {
  console.error('Error: Git is not available or not a git repository');
  process.exit(1);
}

const result = worktreeManager.createWorktree(agentName);

if (result.success) {
  const env = worktreeManager.getWorktreeEnv(result.path);
  console.log(result.path);
  console.log(env);
  process.exit(0);
} else {
  console.error(`Error: ${result.error}`);
  process.exit(1);
}
