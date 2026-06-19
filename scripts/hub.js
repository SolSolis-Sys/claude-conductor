'use strict';

/**
 * conductor hub CLI — entry point
 * Usage: node scripts/hub.js <list|install|info> [name]
 */

const hub = require('../lib/hub');

const [, , subcmd, arg] = process.argv;

if (subcmd === 'list') {
  hub.list().catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'install' && arg) {
  hub.install(arg).catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'info' && arg) {
  hub.info(arg).catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else {
  console.log('Usage: conductor hub <list|install|info> [name]');
  console.log('');
  console.log('Commands:');
  console.log('  list              Show available blueprints from the catalog');
  console.log('  install <name>    Install a blueprint locally');
  console.log('  info <name>       Show blueprint details');
  process.exit(1);
}
