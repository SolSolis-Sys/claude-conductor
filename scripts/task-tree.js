'use strict';

/**
 * conductor task-tree CLI — entry point
 * Usage: node scripts/task-tree.js [add|done|run|fail|clear] [label...]
 */

const tree = require('../lib/task-tree');

const [, , subcmd, ...rest] = process.argv;
const label = rest.join(' ').trim();

if (!subcmd || subcmd === 'show') {
  // Default action: display tree
  tree.display();
} else if (subcmd === 'add' && label) {
  tree.add(label);
} else if (subcmd === 'done' && label) {
  tree.setStatus(label, 'done');
} else if (subcmd === 'run' && label) {
  tree.setStatus(label, 'running');
} else if (subcmd === 'fail' && label) {
  tree.setStatus(label, 'failed');
} else if (subcmd === 'clear') {
  tree.clear();
} else {
  console.log('Usage: conductor task-tree [show|add|done|run|fail|clear] [label...]');
  console.log('');
  console.log('Commands:');
  console.log('  show              Display task tree (default)');
  console.log('  add <label>       Add a new pending task');
  console.log('  done <label>      Mark task as completed');
  console.log('  run <label>       Mark task as running');
  console.log('  fail <label>      Mark task as failed');
  console.log('  clear             Clear all tasks (end of session)');
  console.log('');
  console.log('Examples:');
  console.log('  conductor task-tree');
  console.log('  conductor task-tree add "audit memorie-active"');
  console.log('  conductor task-tree done "audit memorie-active"');
  process.exit(1);
}
