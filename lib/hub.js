'use strict';

/**
 * conductor hub — community blueprint library client
 * Zero dependency: uses only Node.js built-ins (https, fs, os, path)
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/SolSolis-Sys/conductor-blueprints/main';
const LOCAL_BLUEPRINTS_DIR = path.join(os.homedir(), '.claude', 'conductor', 'blueprints');
const TIMEOUT_MS = 5000;

const NAME_RE = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/;

function assertValidName(name) {
  if (!name || !NAME_RE.test(name)) {
    throw new Error(`Invalid blueprint name: '${name}'. Use letters, digits, -, _ or author/name format.`);
  }
  // Containment check after path.join
  const resolved = path.resolve(LOCAL_BLUEPRINTS_DIR, name);
  if (!resolved.startsWith(path.resolve(LOCAL_BLUEPRINTS_DIR) + path.sep)) {
    throw new Error('Path traversal detected.');
  }
}

/**
 * Fetch a URL with timeout, returns parsed JSON or throws.
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT_MS}ms. Check your connection.`));
    }, TIMEOUT_MS);

    const req = https.get(url, (res) => {
      if (res.statusCode === 404) {
        clearTimeout(timer);
        res.resume();
        reject(new Error(`Not found: ${url}`));
        return;
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
      res.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    req.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
        reject(new Error(`Network unavailable. Are you offline? (${e.code})`));
      } else {
        reject(e);
      }
    });
  });
}

/**
 * Read a local blueprint JSON file, returns null if not found.
 * @param {string} name
 * @returns {object|null}
 */
function readLocalBlueprint(name) {
  assertValidName(name);
  const filePath = path.join(LOCAL_BLUEPRINTS_DIR, name, 'blueprint.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Validate that a blueprint object has required fields.
 * @param {object} bp
 * @param {string} name - expected name for error messages
 */
function validateBlueprint(bp, name) {
  const missing = ['name', 'version', 'agents'].filter((k) => !(k in bp));
  if (missing.length > 0) {
    throw new Error(`Blueprint '${name}' is missing required fields: ${missing.join(', ')}`);
  }
  if (!Array.isArray(bp.agents) || bp.agents.length === 0) {
    throw new Error(`Blueprint '${name}' must have at least one agent.`);
  }
  if (typeof bp.name !== 'string' || typeof bp.version !== 'string') {
    return false;
  }
}

/**
 * list() — fetch catalog and display blueprints in a table.
 */
async function list() {
  let catalog;
  try {
    catalog = await fetchJson(`${BASE_URL}/catalog.json`);
  } catch (e) {
    console.error(`conductor hub: cannot fetch catalog — ${e.message}`);
    process.exit(1);
  }

  const blueprints = catalog.blueprints || [];
  if (blueprints.length === 0) {
    console.log('No blueprints in catalog.');
    return;
  }

  // Compute column widths
  const nameW = Math.max(4, ...blueprints.map((b) => (b.name || '').length));
  const descW = Math.max(11, ...blueprints.map((b) => (b.description || '').length));
  const tagsW = Math.max(4, ...blueprints.map((b) => ((b.tags || []).join(', ')).length));

  const sep = `+-${'-'.repeat(nameW)}-+-${'-'.repeat(descW)}-+-${'-'.repeat(tagsW)}-+`;
  const row = (n, d, t) =>
    `| ${n.padEnd(nameW)} | ${d.padEnd(descW)} | ${t.padEnd(tagsW)} |`;

  console.log(`\nconductor hub — ${blueprints.length} blueprint(s) available\n`);
  console.log(sep);
  console.log(row('Name', 'Description', 'Tags'));
  console.log(sep);
  for (const b of blueprints) {
    console.log(row(b.name, b.description, (b.tags || []).join(', ')));
  }
  console.log(sep);
  console.log(`\nInstall: conductor hub install <name>\n`);
}

/**
 * install(name) — fetch blueprint from GitHub and write to local disk.
 * @param {string} name
 */
async function install(name) {
  assertValidName(name);
  const url = `${BASE_URL}/blueprints/${name}/blueprint.json`;
  let bp;
  try {
    bp = await fetchJson(url);
  } catch (e) {
    if (e.message.startsWith('Not found')) {
      console.error(`conductor hub: blueprint '${name}' not found in the registry.`);
      console.error(`Run 'conductor hub list' to see available blueprints.`);
    } else {
      console.error(`conductor hub: cannot fetch blueprint '${name}' — ${e.message}`);
    }
    process.exit(1);
  }

  try {
    validateBlueprint(bp, name);
  } catch (e) {
    console.error(`conductor hub: invalid blueprint — ${e.message}`);
    process.exit(1);
  }

  const destDir = path.join(LOCAL_BLUEPRINTS_DIR, name);
  const destFile = path.join(destDir, 'blueprint.json');

  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destFile, JSON.stringify(bp, null, 2) + '\n', 'utf8');

  console.log(`\nconductor hub: blueprint '${bp.name}' v${bp.version} installed`);
  console.log(`Location: ${destFile}\n`);
}

/**
 * info(name) — show details of a blueprint (local first, then GitHub).
 * @param {string} name
 */
async function info(name) {
  assertValidName(name);
  let bp = readLocalBlueprint(name);
  let source = 'local';

  if (!bp) {
    source = 'remote';
    try {
      bp = await fetchJson(`${BASE_URL}/blueprints/${name}/blueprint.json`);
    } catch (e) {
      if (e.message.startsWith('Not found')) {
        console.error(`conductor hub: blueprint '${name}' not found locally or in the registry.`);
      } else {
        console.error(`conductor hub: cannot fetch blueprint '${name}' — ${e.message}`);
      }
      process.exit(1);
    }
  }

  console.log(`\n--- Blueprint: ${bp.name} (${source}) ---`);
  console.log(`Version    : ${bp.version}`);
  console.log(`Description: ${bp.description}`);

  if (bp.agents && bp.agents.length > 0) {
    console.log(`Agents     :`);
    for (const agent of bp.agents) {
      console.log(`  - ${agent.role}`);
    }
  }

  if (bp.variables && bp.variables.length > 0) {
    console.log(`Variables  : ${bp.variables.join(', ')}`);
  }

  if (bp.loop) {
    console.log(`Loop       : ${JSON.stringify(bp.loop)}`);
  }

  if (bp.verdict) {
    console.log(`Verdict    : ${bp.verdict}`);
  }

  console.log('');
}

module.exports = { list, install, info };
