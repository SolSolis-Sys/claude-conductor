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
const { execSync, execFileSync } = require('child_process');

const { resolveDependencies } = require('./dependency-resolver');

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
  const missing = ['name', 'version'].filter((k) => !(k in bp));
  if (missing.length > 0) {
    throw new Error(`Blueprint '${name}' is missing required fields: ${missing.join(', ')}`);
  }
  // v1.1: gates[] replaces agents[]. Accept either; reject if neither.
  const hasAgents = Array.isArray(bp.agents) && bp.agents.length > 0;
  const hasGates  = Array.isArray(bp.gates)  && bp.gates.length  > 0;
  if (!hasAgents && !hasGates) {
    throw new Error(`Blueprint '${name}' must have at least one agent (agents[]) or gate (gates[]).`);
  }
  if (typeof bp.name !== 'string' || typeof bp.version !== 'string') {
    throw new Error(`Blueprint '${name}' has invalid name or version — both must be strings.`);
  }

  // Validate allowed_commands for destructive operations
  const DESTRUCTIVE = ['rm', 'del', 'format', 'truncate', 'mkfs', 'fdisk', 'shred'];
  if (bp.permissions?.allowed_commands?.some(cmd =>
    DESTRUCTIVE.some(d => cmd.toLowerCase().startsWith(d))
  )) {
    throw new Error(`Blueprint '${name}' contains potentially destructive command in allowed_commands`);
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

  const nameW = Math.max(4, ...blueprints.map((b) => (b.name || '').length));
  const descW = Math.max(11, ...blueprints.map((b) => (b.description || '').length));
  const tagsW = Math.max(4, ...blueprints.map((b) => ((b.tags || []).join(', ')).length));
  const costW = Math.max(9, ...blueprints.map((b) => (b.cost_tier || '').length));

  const sep = `+-${'-'.repeat(nameW)}-+-${'-'.repeat(descW)}-+-${'-'.repeat(tagsW)}-+-${'-'.repeat(costW)}-+`;
  const row = (n, d, t, c) =>
    `| ${n.padEnd(nameW)} | ${d.padEnd(descW)} | ${t.padEnd(tagsW)} | ${c.padEnd(costW)} |`;

  console.log(`\nconductor hub — ${blueprints.length} blueprint(s) available\n`);
  console.log(sep);
  console.log(row('Name', 'Description', 'Tags', 'Cost'));
  console.log(sep);
  for (const b of blueprints) {
    console.log(row(b.name || '', b.description || '', (b.tags || []).join(', '), b.cost_tier || ''));
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
 * install(name, options) — fetch blueprint from GitHub and write to local disk.
 * @param {string} name
 * @param {object} options - optional flags: { deps: boolean } default true
 */
async function install(name, options = {}) {
  const { deps = true, noDeps = false } = options;
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

  // Skip install if same version already present
  const existingLocal = readLocalBlueprint(name);
  if (existingLocal && existingLocal.version === bp.version) {
    console.log(`conductor hub: blueprint '${name}' v${bp.version} already installed.`);
    return;
  }

  if (deps && !noDeps && bp.requires && bp.requires.length > 0) {
    console.log(`[hub] installing dependencies: ${bp.requires.join(', ')}...`);
    let catalog;
    try {
      catalog = await fetchJson(`${BASE_URL}/catalog.json`);
    } catch (e) {
      console.error(`conductor hub: cannot fetch catalog — ${e.message}`);
      process.exit(1);
    }

    const { resolved, missing, circular } = resolveDependencies(bp, catalog);

    if (missing.length > 0) {
      console.error(`conductor hub: blueprint '${name}' has unresolved dependencies: ${missing.join(', ')}`);
      process.exit(1);
    }
    if (circular.length > 0) {
      console.error(`conductor hub: blueprint '${name}' has circular dependencies: ${JSON.stringify(circular)}`);
      process.exit(1);
    }

    for (const dep of resolved) {
      console.log(`[hub] installing dependency: ${dep}...`);
      await install(dep, { deps: true });
    }
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
    const issueUrl = execFileSync(
      'gh',
      ['issue', 'create', '--repo', repoUrl, '--title', issueTitle, '--body', issueBody, '--label', 'submission'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
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

/**
 * discover() — interactive blueprint discovery assistant.
 * Guides user through a series of questions and recommends blueprints based on catalog mapping.
 */
async function discover() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function prompt(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  try {
    // Fetch catalog
    let catalog;
    try {
      catalog = await fetchJson(`${BASE_URL}/catalog.json`);
    } catch (e) {
      console.error(`conductor hub discover: cannot fetch catalog — ${e.message}`);
      process.exit(1);
    }

    const blueprints = catalog.blueprints || [];
    if (blueprints.length === 0) {
      console.log('No blueprints in catalog.');
      rl.close();
      return;
    }

    // Build tag index dynamically from catalog
    const tagChoiceMap = {
      '1': ['review', 'quality', 'adversarial', 'security'],
      '2': ['tdd', 'bugs', 'testing'],
      '3': ['planning', 'spec', 'brainstorming', 'backlog'],
      '4': ['ci', 'deploy', 'devops', 'automation', 'polling'],
      '5': ['self-improvement', 'skill', 'conductor', 'loop'],
    };

    console.log('\n🔍 Conductor Hub Discovery\n');
    console.log('What would you like to do?');
    console.log('  1. Audit or review code');
    console.log('  2. Test & fix bugs');
    console.log('  3. Plan & spec features');
    console.log('  4. Deploy or verify infrastructure');
    console.log('  5. Improve skills or configuration');
    console.log('  6. Other (browse by category)');

    const category = await prompt('\nChoice (1-6): ');

    let selectedCategory = '';
    let recommendedNames = [];

    if (category === '1') {
      selectedCategory = 'code-quality';
      const tags = tagChoiceMap['1'];
      recommendedNames = blueprints
        .filter((b) => (b.tags || []).some((t) => tags.includes(t)))
        .map((b) => b.name);
    } else if (category === '2') {
      selectedCategory = 'testing';
      const tags = tagChoiceMap['2'];
      recommendedNames = blueprints
        .filter((b) => (b.tags || []).some((t) => tags.includes(t)))
        .map((b) => b.name);
    } else if (category === '3') {
      selectedCategory = 'planning';
      const tags = tagChoiceMap['3'];
      recommendedNames = blueprints
        .filter((b) => (b.tags || []).some((t) => tags.includes(t)))
        .map((b) => b.name);
    } else if (category === '4') {
      selectedCategory = 'ci-cd';
      const tags = tagChoiceMap['4'];
      recommendedNames = blueprints
        .filter((b) => (b.tags || []).some((t) => tags.includes(t)))
        .map((b) => b.name);
    } else if (category === '5') {
      selectedCategory = 'self-improvement';
      const tags = tagChoiceMap['5'];
      recommendedNames = blueprints
        .filter((b) => (b.tags || []).some((t) => tags.includes(t)))
        .map((b) => b.name);
    } else if (category === '6') {
      // Show all blueprints
      console.log('\nAll blueprints:');
      blueprints.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.name} — ${b.description}`);
      });
      const choice = await prompt('\nSelect (number): ');
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < blueprints.length) {
        recommendedNames = [blueprints[idx].name];
      }
    }

    if (recommendedNames.length === 0) {
      console.log('\nNo blueprints found for that category.');
      rl.close();
      return;
    }

    // Display recommended blueprint
    const recommendedName = recommendedNames[0];
    const recommended = blueprints.find((b) => b.name === recommendedName);

    if (!recommended) {
      console.log(`\nBlueprint not found: ${recommendedName}`);
      rl.close();
      return;
    }

    console.log(`\n📦 Recommended blueprint: ${recommended.name}`);
    console.log(`   Description: ${recommended.description}`);
    console.log(`   Tags: ${(recommended.tags || []).join(', ')}`);
    console.log(`   Cost tier: ${recommended.cost_tier || 'unspecified'}`);

    const installChoice = await prompt('\nInstall? (y/n): ');

    rl.close();

    if (installChoice.toLowerCase() === 'y') {
      await install(recommended.name);
    } else {
      console.log('\nDiscovery cancelled.');
    }
  } catch (e) {
    rl.close();
    console.error(`conductor hub discover: ${e.message}`);
    process.exit(1);
  }
}

/**
 * scanDir(dir, type) — scan directory for agent/tool/skill JSON files.
 * @param {string} dir - directory to scan
 * @param {string} type - 'agents', 'tools', or 'skills'
 * @returns {Array<{id: string, type: string, description: string}>}
 */
function scanDir(dir, type) {
  const results = [];
  const targetFile = `${type === 'agents' ? 'agent' : type}.json`;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const filePath = path.join(dir, entry.name, targetFile);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          results.push({
            id: data.id || entry.name,
            type,
            description: data.description || ''
          });
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch {
    // Skip if dir doesn't exist
  }
  return results;
}

/**
 * submitInteractive() — interactive submission wizard for local blueprints.
 * Guides user through name, path, description, and category selection.
 */
async function submitInteractive() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function prompt(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  try {
    console.log('\n📝 Blueprint Submission Wizard\n');

    // Auto-scan for agents, tools, skills
    console.log('Scanner le repo...');
    const agents = scanDir('.', 'agents');
    const tools = scanDir('.', 'tools');
    const skills = scanDir('.', 'skills');
    console.log(`Agents: ${agents.length} | Tools: ${tools.length} | Skills: ${skills.length}`);

    const name = await prompt('Blueprint name (slug): ');
    if (!name) {
      console.log('Submission cancelled.');
      rl.close();
      return;
    }

    // Pre-fill from scan results if available
    const allItems = [...agents, ...tools, ...skills];
    if (allItems.length > 0) {
      console.log('\nAvailable items to reference:');
      allItems.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.id} [${item.type}] — ${item.description || '(no description)'}`);
      });
      const refChoice = await prompt('\nSelect item to pre-fill ref (or leave empty): ');
      if (refChoice && !isNaN(parseInt(refChoice)) && parseInt(refChoice) > 0 && parseInt(refChoice) <= allItems.length) {
        const selected = allItems[parseInt(refChoice) - 1];
        console.log(`Pre-filled: ref=${selected.id}, type=${selected.type}, description="${selected.description}"`);
      }
    }

    const blueprintPath = await prompt('Path to blueprint.json (or directory): ');
    if (!blueprintPath) {
      console.log('Submission cancelled.');
      rl.close();
      return;
    }

    let resolvedPath = path.resolve(blueprintPath);
    let blueprintContent;

    // If path is a directory, look for blueprint.json inside
    if (fs.statSync(resolvedPath).isDirectory()) {
      resolvedPath = path.join(resolvedPath, 'blueprint.json');
    }

    // Read blueprint.json
    try {
      blueprintContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch (e) {
      console.error(`\nError reading blueprint.json — ${e.message}`);
      rl.close();
      return;
    }

    // Validate blueprint structure
    try {
      validateBlueprint(blueprintContent, blueprintContent.name || name);
    } catch (e) {
      console.error(`\nInvalid blueprint — ${e.message}`);
      rl.close();
      return;
    }

    const description = await prompt('Description (short): ');
    if (!description) {
      console.log('Submission cancelled.');
      rl.close();
      return;
    }

    console.log('\nCategory:');
    console.log('  1. code');
    console.log('  2. test');
    console.log('  3. docs');
    console.log('  4. ops');
    console.log('  5. other');

    const categoryChoice = await prompt('Choice (1-5): ');
    const categoryMap = { '1': 'code', '2': 'test', '3': 'docs', '4': 'ops', '5': 'other' };
    const category = categoryMap[categoryChoice] || 'other';

    rl.close();

    // Validate and prepare submission
    if (!blueprintContent.version) {
      console.error('\nBlueprint is missing required "version" field.');
      process.exit(1);
    }

    const { version } = blueprintContent;

    // Prepare GitHub Issue body
    const jsonBlock = JSON.stringify(blueprintContent, null, 2);
    const issueBody = `## Blueprint Submission: ${name} v${version}

**Description:** ${description}
**Category:** ${category}

<details>
<summary>blueprint.json</summary>

\`\`\`json
${jsonBlock}
\`\`\`

</details>

---
*Submitted via \`conductor hub submit --interactive\`*`;

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
      const issueUrl = execFileSync(
        'gh',
        ['issue', 'create', '--repo', repoUrl, '--title', issueTitle, '--body', issueBody, '--label', 'submission'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      console.log(`\n✅ Blueprint '${name}' v${version} submitted`);
      console.log(`Issue: ${issueUrl}\n`);
    } catch (e) {
      if (e.message.includes('gh CLI not found')) {
        console.error(`\nconductor hub submit: ${e.message}`);
      } else if (e.message.includes('not authenticated')) {
        console.error(`\nconductor hub submit: gh CLI not authenticated. Run 'gh auth login' first.`);
      } else {
        console.error(`\nconductor hub submit: failed to create issue — ${e.message}`);
      }
      process.exit(1);
    }
  } catch (e) {
    rl.close();
    console.error(`conductor hub submit: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { list, search, install, info, submit, discover, submitInteractive, validateBlueprint };
