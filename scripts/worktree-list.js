#!/usr/bin/env node

/**
 * worktree-list.js
 * CLI tool to list active git worktrees managed by conductor.
 * Usage: node scripts/worktree-list.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, '..', 'hooks', 'worktree-manager.js'));

if (!worktreeManager.isGitAvailable()) {
  console.log('Git not available or not a git repository');
  process.exit(1);
}

const worktrees = worktreeManager.listWorktrees();

if (worktrees.length === 0) {
  console.log('No active conductor worktrees found');
  process.exit(0);
}

console.log(`\nActive conductor worktrees (${worktrees.length}):\n`);

for (const wt of worktrees) {
  const status = wt.valid ? '✓' : '✗';
  const created = new Date(wt.timestamp * 1000).toISOString();
  console.log(`${status} ${wt.name}`);
  console.log(`  Agent  : ${wt.agentName}`);
  console.log(`  Path   : ${wt.path}`);
  console.log(`  Created: ${created}`);
  console.log('');
}
