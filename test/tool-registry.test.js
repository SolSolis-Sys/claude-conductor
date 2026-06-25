#!/usr/bin/env node

/**
 * tool-registry.test.js
 * Tests for executeTool() and listTools().
 * Run: node test/tool-registry.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { executeTool, listTools, setProjectRoot } = require(path.join(__dirname, '..', 'lib', 'tool-registry'));

// ── Test harness ───────────────────────────────────────────────────────────

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertThrows(fn, expectedSubstr, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (expectedSubstr && !e.message.includes(expectedSubstr)) {
      throw new Error(`${message} — error did not include "${expectedSubstr}": ${e.message}`);
    }
  }
  if (!threw) throw new Error(`${message} — expected an error to be thrown`);
}

// Temp dir for file tests (os.tmpdir() → never pollutes repo)
const TMP = path.join(os.tmpdir(), 'conductor-tool-registry-test-' + process.pid);

// ── Test 1: listTools() returns the 7 expected tools ──────────────────────

test('Test 1: listTools() returns the 7 expected tools', () => {
  const tools = listTools();
  const expected = ['write_file', 'read_file', 'update_context', 'run_shell', 'git_add', 'git_commit', 'git_stash'];
  // Note: setProjectRoot is not a tool — listTools() returns TOOLS keys only

  assert(Array.isArray(tools), 'listTools() should return an array');
  assertEqual(tools.length, expected.length, `should have ${expected.length} tools`);

  for (const name of expected) {
    assert(tools.includes(name), `listTools() should include "${name}"`);
  }
});

// ── Test 2: executeTool('write_file') creates file and returns success ─────

test('Test 2: executeTool(write_file) creates file + returns success', () => {
  const filePath = path.join(TMP, 'test-write.txt');
  const content  = 'hello tool-registry\n';

  const result = executeTool('write_file', { path: filePath, content });

  assert(result.success === true, 'result.success should be true');
  assertEqual(result.path, path.resolve(filePath), 'result.path should be absolute');
  assert(typeof result.bytes_written === 'number', 'result.bytes_written should be a number');
  assert(result.bytes_written > 0, 'bytes_written should be > 0');

  // Verify file actually exists on disk
  assert(fs.existsSync(filePath), 'file should exist on disk after write_file');
  const actual = fs.readFileSync(filePath, 'utf8');
  assertEqual(actual, content, 'file content should match what was written');
});

// ── Test 3: executeTool('read_file') reads file created in Test 2 ─────────

test('Test 3: executeTool(read_file) reads file from Test 2', () => {
  const filePath = path.join(TMP, 'test-write.txt');
  const expected = 'hello tool-registry\n';

  const result = executeTool('read_file', { path: filePath });

  assert(result.success === true, 'result.success should be true');
  assertEqual(result.content, expected, 'content should match what was written in Test 2');
  assertEqual(result.path, path.resolve(filePath), 'result.path should be absolute');
});

// ── Test 4: executeTool('unknown_tool') throws Error ──────────────────────

test('Test 4: executeTool(unknown_tool) throws Error', () => {
  assertThrows(
    () => executeTool('unknown_tool', {}),
    'Unknown tool',
    'executeTool with unknown toolId should throw'
  );

  // Error message should list available tools
  let errorMsg = '';
  try {
    executeTool('unknown_tool', {});
  } catch (e) {
    errorMsg = e.message;
  }
  assert(errorMsg.includes('write_file'), 'error message should list available tools');
});

// ── Test 5: write_file creates parent directories if needed ───────────────

test('Test 5: write_file creates parent directories if needed', () => {
  const deepPath = path.join(TMP, 'level1', 'level2', 'level3', 'deep.txt');
  const content  = 'nested file content';

  // Ensure parent does NOT exist before the call
  const parentDir = path.dirname(deepPath);
  assert(!fs.existsSync(parentDir), 'parent dir should not exist before write_file');

  const result = executeTool('write_file', { path: deepPath, content });

  assert(result.success === true, 'result.success should be true for deep path');
  assert(fs.existsSync(deepPath), 'file should exist even with non-existing parent dirs');
  assertEqual(fs.readFileSync(deepPath, 'utf8'), content, 'content should match');
});

// ── Test 6: read_file returns success:false when file missing ─────────────

test('Test 6: read_file returns success:false when file does not exist', () => {
  const missingPath = path.join(TMP, 'does-not-exist-' + Date.now() + '.txt');

  const result = executeTool('read_file', { path: missingPath });

  assert(result.success === false, 'result.success should be false for missing file');
  assert(typeof result.error === 'string' && result.error.length > 0, 'result.error should be a non-empty string');
});

// ── Test 7: update_context stores and returns the value ───────────────────

test('Test 7: update_context stores key-value pair', () => {
  const result = executeTool('update_context', { key: 'test_key', value: { nested: true } });

  assert(result.success === true, 'result.success should be true');
  assertEqual(result.key, 'test_key', 'result.key should match input');
  assert(typeof result.value === 'object', 'result.value should match input');
  assert(result.value.nested === true, 'result.value content should be preserved');
});

// ── Test 8: run_shell rejects commands not in whitelist ───────────────────

test('Test 8: run_shell rejects non-whitelisted commands', () => {
  assertThrows(
    () => executeTool('run_shell', { command: 'curl', args: ['https://example.com'] }),
    'commande non autorisée',
    'run_shell with non-whitelisted command should throw'
  );

  // Error message should mention the command and list allowed ones
  let errorMsg = '';
  try {
    executeTool('run_shell', { command: 'rm', args: ['-rf', '/'] });
  } catch (e) {
    errorMsg = e.message;
  }
  assert(errorMsg.includes('rm'), 'error should mention the rejected command');
  assert(errorMsg.includes('git'), 'error should list allowed commands');
});

// ── Test 9: run_shell accepts whitelisted commands ────────────────────────

test('Test 9: run_shell accepts whitelisted command "git"', () => {
  // "git --version" is safe and always available
  const result = executeTool('run_shell', { command: 'git', args: ['--version'] });
  assert(result.success === true, 'run_shell with "git" should succeed');
  assert(typeof result.stdout === 'string', 'stdout should be a string');
  assert(result.stdout.includes('git'), 'stdout should contain git version info');
});

// ── Test 10: write_file — chemin valide dans le projet → succès ───────────

test('Test 10: write_file — chemin valide dans le projet → succès', () => {
  // _projectRoot is TMP; writing inside TMP is allowed
  const filePath = path.join(TMP, 'security-valid.txt');
  const result = executeTool('write_file', { path: filePath, content: 'valid' });
  assert(result.success === true, 'write inside project root should succeed');
  assert(fs.existsSync(filePath), 'file should exist on disk');
});

// ── Test 11: write_file — traversal ../../etc/passwd → rejeté ────────────

test('Test 11: write_file — path traversal ../../etc/passwd → rejeté', () => {
  // Relative traversal resolves outside TMP → must throw
  const malicious = path.join(TMP, '..', '..', 'etc', 'passwd');
  assertThrows(
    () => executeTool('write_file', { path: malicious, content: 'pwned' }),
    'hors projet',
    'write_file with traversal path should throw "hors projet"'
  );
});

// ── Test 12: write_file — chemin absolu hors projet → rejeté ─────────────

test('Test 12: write_file — chemin absolu hors projet → rejeté', () => {
  // Absolute path clearly outside TMP
  const outside = path.resolve(os.tmpdir(), 'conductor-outside-' + process.pid + '.txt');
  // Ensure it is NOT inside TMP (TMP is a subdir of tmpdir with pid suffix)
  assert(!outside.startsWith(TMP), 'test setup: outside path must not be inside TMP');
  assertThrows(
    () => executeTool('write_file', { path: outside, content: 'pwned' }),
    'hors projet',
    'write_file with absolute path outside project should throw "hors projet"'
  );
});

// ── Cleanup ────────────────────────────────────────────────────────────────

function cleanup() {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (_) {}
}

// ── Run ─────────────────────────────────────────────────────────────────────

// Create TMP before tests that write files
try { fs.mkdirSync(TMP, { recursive: true }); } catch (_) {}

// Allow write_file to write into TMP (path-traversal guard uses _projectRoot)
setProjectRoot(TMP);

console.log('\nTool-Registry Test Suite\n' + '='.repeat(40));

for (const t of tests) {
  try {
    t.fn();
    console.log(`  pass  ${t.name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${t.name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

// Cleanup temp files
cleanup();

console.log('\n' + '='.repeat(40));
console.log(`Total: ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
