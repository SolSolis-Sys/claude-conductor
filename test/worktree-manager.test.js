#!/usr/bin/env node

/**
 * worktree-manager.test.js
 * Basic smoke tests for worktree-manager module.
 * Run: node test/worktree-manager.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const worktreeManager = require(path.join(__dirname, '..', 'hooks', 'worktree-manager.js'));

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Tests

test('isGitAvailable - should return boolean', () => {
  const result = worktreeManager.isGitAvailable();
  assert(typeof result === 'boolean', 'isGitAvailable should return boolean');
});

test('getProjectRoot - should return string or null', () => {
  const result = worktreeManager.getProjectRoot();
  assert(result === null || typeof result === 'string', 'getProjectRoot should return string or null');
});

test('getCurrentRef - should return non-empty string', () => {
  const result = worktreeManager.getCurrentRef();
  assert(typeof result === 'string' && result.length > 0, 'getCurrentRef should return non-empty string');
});

test('listWorktrees - should return array', () => {
  const result = worktreeManager.listWorktrees();
  assert(Array.isArray(result), 'listWorktrees should return array');
});

test('getWorktreeEnv - should format path correctly', () => {
  const path1 = '/home/user/project/.worktrees/agent-1719384625';
  const env = worktreeManager.getWorktreeEnv(path1);
  assert(
    env.startsWith('CONDUCTOR_WORKTREE_PATH='),
    'getWorktreeEnv should start with CONDUCTOR_WORKTREE_PATH='
  );
  assert(env.includes(path1.replace(/\\/g, '/')), 'getWorktreeEnv should include normalized path');
});

test('getWorktreeEnv - should normalize Windows paths', () => {
  const path1 = 'C:\\Users\\user\\project\\.worktrees\\agent-1719384625';
  const env = worktreeManager.getWorktreeEnv(path1);
  assert(!env.includes('\\'), 'getWorktreeEnv should not include backslashes');
  assert(env.includes('/'), 'getWorktreeEnv should normalize to forward slashes');
});

test('WORKTREES_DIR - should be defined', () => {
  assert(typeof worktreeManager.WORKTREES_DIR === 'string', 'WORKTREES_DIR should be string');
  assert(worktreeManager.WORKTREES_DIR === '.worktrees', 'WORKTREES_DIR should equal ".worktrees"');
});

test('WORKTREES_REGISTRY - should be defined', () => {
  assert(typeof worktreeManager.WORKTREES_REGISTRY === 'string', 'WORKTREES_REGISTRY should be string');
  assert(
    worktreeManager.WORKTREES_REGISTRY === '.conductor-worktrees.json',
    'WORKTREES_REGISTRY should equal ".conductor-worktrees.json"'
  );
});

test('createWorktree - should reject invalid agent names', () => {
  const result = worktreeManager.createWorktree('agent@name!');
  assert(result.success === false, 'createWorktree should reject names with special chars');
  assert(result.error && result.error.includes('Invalid agent name'), 'error message should indicate invalid name');
});

test('removeWorktree - should reject invalid agent names', () => {
  const result = worktreeManager.removeWorktree('agent/path');
  assert(result.success === false, 'removeWorktree should reject names with slashes');
  assert(result.error && result.error.includes('Invalid agent name'), 'error message should indicate invalid name');
});

// Run tests

console.log('\nWorktree Manager Test Suite\n' + '='.repeat(40));

for (const t of tests) {
  try {
    t.fn();
    console.log(`✓ ${t.name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${t.name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(40));
console.log(`Tests: ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
