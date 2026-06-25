'use strict';

/**
 * conductor hub CLI — entry point
 * Usage: node scripts/hub.js <list|search|install|info> [name]
 */

const hub = require('../lib/hub');

const [, , subcmd, arg, ...extra] = process.argv;

const NAME_RE_CLI = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/;
if ((subcmd === 'install' || subcmd === 'info') && arg && !NAME_RE_CLI.test(arg)) {
  console.error(`conductor hub: invalid name '${arg}'. Use letters, digits, -, _ or author/name format.`);
  process.exit(1);
}
if (subcmd === 'install' && !arg) {
  console.error('conductor hub install: missing blueprint name. Usage: conductor hub install <name> [--no-deps]');
  process.exit(1);
}
if (subcmd === 'submit' && !arg && !extra.includes('--interactive')) {
  console.error('conductor hub submit: missing path. Usage: conductor hub submit <path> or conductor hub submit --interactive');
  process.exit(1);
}

if (subcmd === 'list') {
  hub.list().catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'search') {
  hub.search(arg).catch(console.error);
} else if (subcmd === 'install' && arg) {
  const options = { deps: !extra.includes('--no-deps') };
  hub.install(arg, options).catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'info' && arg) {
  hub.info(arg).catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'discover') {
  hub.discover().catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'submit' && arg === '--interactive') {
  hub.submitInteractive().catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else if (subcmd === 'submit' && arg) {
  hub.submit(arg).catch((e) => {
    console.error(`conductor hub error: ${e.message}`);
    process.exit(1);
  });
} else {
  console.log('Usage: conductor hub <list|search|install|info|discover|submit> [args]');
  console.log('');
  console.log('Commands:');
  console.log('  list                      Show available blueprints from the catalog');
  console.log('  search <query>            Search blueprints by name, tag or description');
  console.log('  install <name> [--no-deps] Install a blueprint locally (--no-deps skips dependencies)');
  console.log('  info <name>               Show blueprint details');
  console.log('  discover                  Interactive blueprint discovery assistant');
  console.log('  submit <path>             Submit a local blueprint to the community registry');
  console.log('  submit --interactive      Guided submission wizard');
  process.exit(1);
}
