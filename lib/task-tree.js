'use strict';

/**
 * conductor task-tree — session task tracking with ASCII visual tree
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
  done: '✓',
  failed: '✗'
};

/**
 * Load tasks from disk, return empty array if file doesn't exist
 * @returns {Array}
 */
function load() {
  try {
    return JSON.parse(fs.readFileSync(TREE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Save tasks to disk
 * @param {Array} tasks
 */
function save(tasks) {
  fs.mkdirSync(path.dirname(TREE_FILE), { recursive: true });
  fs.writeFileSync(TREE_FILE, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

/**
 * Add a new task
 * @param {string} label
 */
function add(label) {
  const tasks = load();
  if (tasks.find(t => t.label === label)) {
    console.log(`Task '${label}' already exists.`);
    return;
  }
  tasks.push({
    label,
    status: 'pending',
    ts: new Date().toISOString()
  });
  save(tasks);
  console.log(`+ [pending] ${label}`);
}

/**
 * Set status of a task (pending, running, done, failed)
 * @param {string} label
 * @param {string} status
 */
function setStatus(label, status) {
  const tasks = load();
  const t = tasks.find(t => t.label === label);
  if (!t) {
    console.error(`Task '${label}' not found.`);
    process.exit(1);
  }
  t.status = status;
  t.updated = new Date().toISOString();
  save(tasks);
  const icon = ICONS[status] || '?';
  console.log(`${icon} [${status}] ${label}`);
}

/**
 * Display tasks as ASCII tree
 */
function display() {
  const tasks = load();
  if (tasks.length === 0) {
    console.log('No tasks. Use: conductor task-tree add <label>');
    return;
  }

  console.log('\nSession tasks');
  tasks.forEach((t, i) => {
    const isLast = i === tasks.length - 1;
    const prefix = isLast ? '└──' : '├──';
    const icon = ICONS[t.status] || '?';
    // Pad status to fixed width for alignment
    const statusStr = `[${t.status.padEnd(7)}]`;
    console.log(`${prefix} ${icon} ${statusStr} ${t.label}`);
  });
  console.log('');
}

/**
 * Clear all tasks
 */
function clear() {
  save([]);
  console.log('Task tree cleared.');
}

module.exports = {
  add,
  setStatus,
  display,
  clear,
  load
};
