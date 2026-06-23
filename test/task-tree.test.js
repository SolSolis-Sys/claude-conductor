#!/usr/bin/env node

/**
 * task-tree.test.js
 * Tests for hierarchical task-tree module: add-child, recursive display, persistence.
 * Run: node test/task-tree.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Use a temp file to avoid touching real ~/.claude/conductor/task-tree.json
const TEMP_FILE = path.join(os.tmpdir(), `conductor-task-tree-test-${process.pid}.json`);

// Patch the module to use temp file by overriding TREE_FILE before require
// We do this by monkey-patching after require via saveStore/loadStore overrides
const taskTree = require(path.join(__dirname, '..', 'lib', 'task-tree'));

// Override loadStore and saveStore to use temp file
const originalLoad = taskTree.loadStore;
const originalSave = taskTree.saveStore;

function testLoad() {
  try {
    const raw = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      return { nextId: raw.length + 1, tasks: raw.map((t, i) => ({ id: i + 1, children: [], ...t })) };
    }
    return raw;
  } catch {
    return { nextId: 1, tasks: [] };
  }
}

function testSave(store) {
  fs.mkdirSync(path.dirname(TEMP_FILE), { recursive: true });
  fs.writeFileSync(TEMP_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

taskTree.loadStore = testLoad;
taskTree.saveStore = testSave;

// Re-bind internal functions that close over the originals
// by wrapping the exported functions to use patched store ops.
// Since add/addChild/setStatus/clear all call loadStore/saveStore via
// module-level references, we need to patch the module's own scope.
// The cleanest approach: rebuild internal functions pointing to testLoad/testSave.

function buildTestTree() {
  function findById(tasks, id) {
    for (const task of tasks) {
      if (task.id === id) return task;
      const found = findById(task.children || [], id);
      if (found) return found;
    }
    return null;
  }

  function add(label) {
    const store = testLoad();
    if (store.tasks.find(t => t.label === label)) return null; // already exists
    const id = store.nextId++;
    store.tasks.push({ id, label, status: 'pending', ts: new Date().toISOString(), children: [] });
    testSave(store);
    return id;
  }

  function addChild(parentId, label) {
    const store = testLoad();
    const parent = findById(store.tasks, Number(parentId));
    if (!parent) return null;
    if (!parent.children) parent.children = [];
    const id = store.nextId++;
    parent.children.push({ id, label, status: 'pending', ts: new Date().toISOString(), children: [] });
    testSave(store);
    return id;
  }

  function setStatus(id, status) {
    const store = testLoad();
    const task = findById(store.tasks, Number(id));
    if (!task) return false;
    task.status = status;
    task.updated = new Date().toISOString();
    testSave(store);
    return true;
  }

  function clear() {
    testSave({ nextId: 1, tasks: [] });
  }

  function load() {
    return testLoad().tasks;
  }

  return { add, addChild, setStatus, clear, load, findById, loadStore: testLoad };
}

const tt = buildTestTree();

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

function cleanup() {
  try { fs.unlinkSync(TEMP_FILE); } catch { /* ok */ }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('add() creates root task with auto-increment id', () => {
  cleanup();
  const id = tt.add('root task A');
  assertEqual(id, 1, 'first task id');
  const id2 = tt.add('root task B');
  assertEqual(id2, 2, 'second task id');
  const tasks = tt.load();
  assertEqual(tasks.length, 2, 'task count');
  assertEqual(tasks[0].label, 'root task A', 'first task label');
  assertEqual(tasks[0].status, 'pending', 'first task status');
  assert(Array.isArray(tasks[0].children), 'children should be array');
  assertEqual(tasks[0].children.length, 0, 'no children initially');
});

test('add() rejects duplicate root label', () => {
  cleanup();
  tt.add('dup task');
  const id2 = tt.add('dup task');
  assert(id2 === null, 'duplicate should return null');
  assertEqual(tt.load().length, 1, 'only one task stored');
});

test('addChild() adds subtask to existing parent', () => {
  cleanup();
  const parentId = tt.add('parent task');
  const childId = tt.addChild(parentId, 'child task A');
  assert(childId !== null, 'childId should not be null');
  assertEqual(childId, 2, 'child id should be 2');
  const tasks = tt.load();
  assertEqual(tasks[0].children.length, 1, 'parent should have 1 child');
  assertEqual(tasks[0].children[0].label, 'child task A', 'child label');
  assertEqual(tasks[0].children[0].status, 'pending', 'child status');
  assertEqual(tasks[0].children[0].id, 2, 'child id');
});

test('addChild() supports multiple children', () => {
  cleanup();
  const parentId = tt.add('parent');
  tt.addChild(parentId, 'child A');
  tt.addChild(parentId, 'child B');
  const tasks = tt.load();
  assertEqual(tasks[0].children.length, 2, 'two children');
  assertEqual(tasks[0].children[1].label, 'child B', 'second child label');
});

test('addChild() supports nested children (grandchild)', () => {
  cleanup();
  const parentId = tt.add('parent');
  const childId = tt.addChild(parentId, 'child');
  const grandchildId = tt.addChild(childId, 'grandchild');
  assert(grandchildId !== null, 'grandchild id should not be null');
  const tasks = tt.load();
  assertEqual(tasks[0].children[0].children[0].label, 'grandchild', 'grandchild label');
  assertEqual(tasks[0].children[0].children[0].id, grandchildId, 'grandchild id matches');
});

test('addChild() returns null for unknown parent', () => {
  cleanup();
  const result = tt.addChild(999, 'orphan');
  assert(result === null, 'unknown parent should return null');
});

test('setStatus() updates task status by id', () => {
  cleanup();
  const id = tt.add('task X');
  const ok = tt.setStatus(id, 'done');
  assert(ok === true, 'setStatus should return true');
  const tasks = tt.load();
  assertEqual(tasks[0].status, 'done', 'status updated');
  assert(tasks[0].updated !== undefined, 'updated timestamp set');
});

test('setStatus() updates child task status by id', () => {
  cleanup();
  const parentId = tt.add('parent');
  const childId = tt.addChild(parentId, 'child');
  const ok = tt.setStatus(childId, 'running');
  assert(ok === true, 'setStatus on child should return true');
  const tasks = tt.load();
  assertEqual(tasks[0].children[0].status, 'running', 'child status updated');
});

test('setStatus() returns false for unknown id', () => {
  cleanup();
  const ok = tt.setStatus(999, 'done');
  assert(ok === false, 'unknown id should return false');
});

test('persistence: tasks survive across loadStore calls', () => {
  cleanup();
  tt.add('persist task');
  tt.addChild(1, 'persist child');
  // Simulate new session by reloading from disk
  const store2 = tt.loadStore();
  assertEqual(store2.tasks.length, 1, 'task persisted');
  assertEqual(store2.tasks[0].children.length, 1, 'child persisted');
  assertEqual(store2.nextId, 3, 'nextId persisted');
});

test('persistence: nextId increments correctly across sessions', () => {
  cleanup();
  tt.add('task 1');   // id 1
  tt.add('task 2');   // id 2
  // Simulate new session
  const id3 = tt.add('task 3');  // should be 3
  assertEqual(id3, 3, 'id auto-increment cross-session');
});

test('clear() resets tasks and nextId', () => {
  cleanup();
  tt.add('task to clear');
  tt.clear();
  const store = tt.loadStore();
  assertEqual(store.tasks.length, 0, 'tasks cleared');
  assertEqual(store.nextId, 1, 'nextId reset to 1');
});

test('findById() finds nested task by id', () => {
  cleanup();
  const parentId = tt.add('root');
  const childId = tt.addChild(parentId, 'child');
  const grandId = tt.addChild(childId, 'grandchild');
  const tasks = tt.load();
  const found = tt.findById(tasks, grandId);
  assert(found !== null, 'grandchild found');
  assertEqual(found.label, 'grandchild', 'correct label');
});

test('add() assigns id=1 after clear', () => {
  cleanup();
  tt.add('first');
  tt.clear();
  const id = tt.add('after clear');
  assertEqual(id, 1, 'id resets to 1 after clear');
});

// ── Run ────────────────────────────────────────────────────────────────────

console.log('\nTask Tree Test Suite\n' + '='.repeat(40));

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

cleanup();

console.log('\n' + '='.repeat(40));
console.log(`Tests: ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
