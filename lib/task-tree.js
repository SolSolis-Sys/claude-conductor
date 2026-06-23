'use strict';

/**
 * conductor task-tree — hierarchical cross-session task tracking
 * Persists tasks to ~/.claude/conductor/task-tree.json
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TREE_FILE = path.join(os.homedir(), '.claude', 'conductor', 'task-tree.json');
const ICONS = {
  pending: '○',
  running: '◎',
  done: '●',
  failed: '✗'
};

/**
 * Internal storage format:
 * {
 *   nextId: number,
 *   tasks: Array<{id, label, status, ts, updated?, children: []}>
 * }
 */

/**
 * Load store from disk; return fresh store if file absent/corrupt
 * @returns {{ nextId: number, tasks: Array }}
 */
function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(TREE_FILE, 'utf8'));
    // Support legacy format (plain array)
    if (Array.isArray(raw)) {
      return { nextId: raw.length + 1, tasks: raw.map((t, i) => ({ id: i + 1, children: [], ...t })) };
    }
    return raw;
  } catch {
    return { nextId: 1, tasks: [] };
  }
}

/**
 * Save store to disk
 * @param {{ nextId: number, tasks: Array }} store
 */
function saveStore(store) {
  fs.mkdirSync(path.dirname(TREE_FILE), { recursive: true });
  fs.writeFileSync(TREE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

/**
 * Find a task by id (recursive search through children)
 * @param {Array} tasks
 * @param {number} id
 * @returns {object|null}
 */
function findById(tasks, id) {
  for (const task of tasks) {
    if (task.id === id) return task;
    const found = findById(task.children || [], id);
    if (found) return found;
  }
  return null;
}

/**
 * Add a new root task
 * @param {string} label
 */
function add(label) {
  const store = loadStore();
  const existing = findById(store.tasks, store.tasks.find ? undefined : undefined);
  // Check for duplicate label at root level
  if (store.tasks.find(t => t.label === label)) {
    console.log(`Task '${label}' already exists.`);
    return;
  }
  const id = store.nextId++;
  store.tasks.push({
    id,
    label,
    status: 'pending',
    ts: new Date().toISOString(),
    children: []
  });
  saveStore(store);
  console.log(`+ [${id}] [pending] ${label}`);
}

/**
 * Add a child task to a parent
 * @param {number|string} parentId
 * @param {string} label
 */
function addChild(parentId, label) {
  const store = loadStore();
  const parent = findById(store.tasks, Number(parentId));
  if (!parent) {
    console.error(`Parent task #${parentId} not found.`);
    process.exit(1);
  }
  if (!parent.children) parent.children = [];
  const id = store.nextId++;
  parent.children.push({
    id,
    label,
    status: 'pending',
    ts: new Date().toISOString(),
    children: []
  });
  saveStore(store);
  console.log(`+ [${id}] [pending] ${label} (child of #${parentId})`);
}

/**
 * Set status of a task by id
 * @param {number|string} id
 * @param {string} status
 */
function setStatus(id, status) {
  const store = loadStore();
  const task = findById(store.tasks, Number(id));
  if (!task) {
    // Backward-compat: try by label if id is not a number
    const byLabel = _findByLabel(store.tasks, String(id));
    if (byLabel) {
      byLabel.status = status;
      byLabel.updated = new Date().toISOString();
      saveStore(store);
      const icon = ICONS[status] || '?';
      console.log(`${icon} [${status}] ${byLabel.label}`);
      return;
    }
    console.error(`Task #${id} not found.`);
    process.exit(1);
  }
  task.status = status;
  task.updated = new Date().toISOString();
  saveStore(store);
  const icon = ICONS[status] || '?';
  console.log(`${icon} [${status}] ${task.label}`);
}

/**
 * Find by label (legacy compat, recursive)
 * @param {Array} tasks
 * @param {string} label
 * @returns {object|null}
 */
function _findByLabel(tasks, label) {
  for (const task of tasks) {
    if (task.label === label) return task;
    const found = _findByLabel(task.children || [], label);
    if (found) return found;
  }
  return null;
}

/**
 * Render a single task node and its children recursively
 * @param {object} task
 * @param {number} depth
 */
function _renderTask(task, depth) {
  const indent = '  '.repeat(depth);
  const icon = ICONS[task.status] || '?';
  const idStr = String(task.id).padStart(2, ' ');
  console.log(`${indent}[${icon}] ${idStr} — ${task.label}`);
  for (const child of (task.children || [])) {
    _renderTask(child, depth + 1);
  }
}

/**
 * Display tasks as recursive ASCII tree
 */
function display() {
  const store = loadStore();
  const tasks = store.tasks || store; // handle legacy array
  if (!tasks.length) {
    console.log('No tasks. Use: conductor task-tree add <label>');
    return;
  }
  console.log('\nSession tasks');
  for (const task of tasks) {
    _renderTask(task, 0);
  }
  console.log('');
}

/**
 * Clear all tasks and reset counter
 */
function clear() {
  saveStore({ nextId: 1, tasks: [] });
  console.log('Task tree cleared.');
}

/**
 * Load tasks array (public, for tests and consumers)
 * @returns {Array}
 */
function load() {
  return loadStore().tasks;
}

module.exports = {
  add,
  addChild,
  setStatus,
  display,
  clear,
  load,
  loadStore,
  saveStore,
  findById
};
