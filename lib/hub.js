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
const { execSync } = require('child_process');

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
 * search(query) — filter catalog blueprints by name, description, tag, or author.
 * @param {string} query
 */
async function search(query) {
  const catalog = await fetchJson(`${BASE_URL}/catalog.json`);
  if (!catalog || !Array.isArray(catalog.blueprints)) {
    console.log('No blueprints found in catalog.');
    return;
  }
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    return list(); // no query = show all
  }
  const matches = catalog.blueprints.filter((b) => {
    const inName = (b.name || '').toLowerCase().includes(q);
    const inDesc = (b.description || '').toLowerCase().includes(q);
    const inTags = (b.tags || []).some((t) => t.toLowerCase().includes(q));
    const inAuthor = (b.author || '').toLowerCase().includes(q);
    return inName || inDesc || inTags || inAuthor;
  });
  if (matches.length === 0) {
    console.log(`No blueprints found matching '${query}'.`);
    return;
  }
  console.log(`\n🔍 ${matches.length} blueprint(s) found for '${query}':\n`);
  const nameW = Math.max(4, ...matches.map((b) => (b.name || '').length));
  const descW = Math.max(11, ...matches.map((b) => (b.description || '').length));
  const header = `${'Name'.padEnd(nameW)}  ${'Description'.padEnd(descW)}  Tags`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const b of matches) {
    const tags = (b.tags || []).join(', ');
    const cost = b.cost_tier ? ` [${b.cost_tier}]` : '';
    console.log(`${(b.name || '').padEnd(nameW)}  ${(b.description || '').padEnd(descW)}  ${tags}${cost}`);
  }
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

/**
 * submit(blueprintPath) — validate a local blueprint and open a GitHub issue for community submission.
 * Reads blueprint.json, validates required fields, then creates a GitHub Issue in SolSolis-Sys/conductor-blueprints.
 * @param {string} blueprintPath - path to blueprint.json or its parent directory
 */
async function submit(blueprintPath) {
  let resolvedPath = path.resolve(blueprintPath);
  let blueprintContent;
  let blueprintDir;

  // If path is a directory, look for blueprint.json inside
  if (fs.statSync(resolvedPath).isDirectory()) {
    blueprintDir = resolvedPath;
    resolvedPath = path.join(resolvedPath, 'blueprint.json');
  } else {
    blueprintDir = path.dirname(resolvedPath);
  }

  // Read blueprint.json
  try {
    blueprintContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (e) {
    console.error(`conductor hub submit: cannot read blueprint.json — ${e.message}`);
    process.exit(1);
  }

  // Validate blueprint structure
  try {
    validateBlueprint(blueprintContent, blueprintContent.name || 'unknown');
  } catch (e) {
    console.error(`conductor hub submit: invalid blueprint — ${e.message}`);
    process.exit(1);
  }

  const { name, version, description = '', tags = [], cost_tier = '' } = blueprintContent;

  // Prepare GitHub Issue body
  const jsonBlock = JSON.stringify(blueprintContent, null, 2);
  const issueBody = `## Blueprint Submission: ${name} v${version}

**Description:** ${description}
**Tags:** ${tags.join(', ') || '(none)'}
**Cost tier:** ${cost_tier || '(unspecified)'}

<details>
<summary>blueprint.json</summary>

\`\`\`json
${jsonBlock}
\`\`\`

</details>

---
*Submitted via \`conductor hub submit\`*`;

  // Create GitHub Issue using gh CLI
  const issueTitle = `Blueprint submission: ${name} v${version}`;
  const repoUrl = 'SolSolis-Sys/conductor-blueprints';

  try {
    // Verify gh CLI is available
    try {
      execSync('gh --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      throw new Error('gh CLI not found. Install it via https://cli.github.com/ and run `gh auth login`');
    }

    // Create the issue
    const issueUrl = execSync(
      `gh issue create --repo ${repoUrl} --title "${issueTitle.replace(/"/g, '\\"')}" --body "${issueBody.replace(/"/g, '\\"')}" --label "submission" 2>/dev/null || gh issue create --repo ${repoUrl} --title "${issueTitle.replace(/"/g, '\\"')}" --body "${issueBody.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: true }
    ).trim();

    console.log(`\nconductor hub submit: blueprint '${name}' v${version} submitted`);
    console.log(`Issue: ${issueUrl}\n`);
  } catch (e) {
    // More helpful error messages
    if (e.message.includes('gh CLI not found')) {
      console.error(`conductor hub submit: ${e.message}`);
    } else if (e.message.includes('not authenticated')) {
      console.error(`conductor hub submit: gh CLI not authenticated. Run 'gh auth login' first.`);
    } else {
      console.error(`conductor hub submit: failed to create issue — ${e.message}`);
    }
    process.exit(1);
  }
}

module.exports = { list, search, install, info, submit };
