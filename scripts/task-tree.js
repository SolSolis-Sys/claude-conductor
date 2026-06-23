'use strict';

/**
 * conductor task-tree CLI — entry point
 * Usage: node scripts/task-tree.js [add|add-child|done|run|fail|clear] [args...]
 */

const tree = require('../lib/task-tree');

const [, , subcmd, ...rest] = process.argv;

if (!subcmd || subcmd === 'show') {
  // Default action: display tree
  tree.display();
} else if (subcmd === 'add' && rest.length) {
  const label = rest.join(' ').trim();
  tree.add(label);
} else if (subcmd === 'add-child' && rest.length >= 2) {
  // add-child "<parent-id>" "<label>"
  // Support quoted or unquoted: first arg = parentId, rest = label
  const parentId = rest[0].replace(/^["']|["']$/g, '');
  const label = rest.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();
  tree.addChild(parentId, label);
} else if (subcmd === 'done' && rest.length) {
  // done <id> — id-based (backward compat: also accepts label)
  const id = rest.join(' ').trim();
  tree.setStatus(id, 'done');
} else if (subcmd === 'run' && rest.length) {
  const id = rest.join(' ').trim();
  tree.setStatus(id, 'running');
} else if (subcmd === 'fail' && rest.length) {
  const id = rest.join(' ').trim();
  tree.setStatus(id, 'failed');
} else if (subcmd === 'clear') {
  tree.clear();
} else {
  console.log('Usage: conductor task-tree [show|add|add-child|done|run|fail|clear] [args...]');
  console.log('');
  console.log('Commands:');
  console.log('  show                          Display task tree (default)');
  console.log('  add <label>                   Add a new root task');
  console.log('  add-child <parent-id> <label> Add a subtask to a parent');
  console.log('  done <id>                     Mark task as completed');
  console.log('  run <id>                      Mark task as running');
  console.log('  fail <id>                     Mark task as failed');
  console.log('  clear                         Clear all tasks');
  console.log('');
  console.log('Examples:');
  console.log('  conductor task-tree');
  console.log('  conductor task-tree add "audit memorie-active"');
  console.log('  conductor task-tree add-child 1 "subtask A"');
  console.log('  conductor task-tree done 1');
  console.log('  conductor task-tree done "audit memorie-active"  # label compat');
  process.exit(1);
}
