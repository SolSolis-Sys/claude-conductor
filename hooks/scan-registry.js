/**
 * scan-registry.js
 * SessionStart hook for claude-conductor.
 * Scans ~/.claude/agents/ and .claude/agents/ (cwd), parses frontmatter,
 * and writes ~/.claude/conductor-registry.yaml.
 * Zero external dependencies. Silent on errors.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  const homeDir = os.homedir();
  const cwdDir = process.cwd();

  const scanDirs = [
    path.join(homeDir, '.claude', 'agents'),
    path.join(cwdDir, '.claude', 'agents'),
  ];

  /**
   * Parse YAML frontmatter from a markdown string.
   * Extracts the block between the first pair of `---` delimiters.
   * Returns an object with name, description, and model (if present).
   */
  function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const block = match[1];
    const result = {};

    // Simple key: value extraction (no nested YAML support needed)
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
      if (!kv) continue;
      const key = kv[1].trim();
      // Strip surrounding quotes if present
      const value = kv[2].trim().replace(/^["']|["']$/g, '');
      result[key] = value;
    }

    return result;
  }

  /**
   * Scan a directory for .md files and extract agent metadata.
   * Returns { agents: Array, count: number }.
   */
  function scanDir(dirPath) {
    const agents = [];

    if (!fs.existsSync(dirPath)) {
      return { agents, count: 0 };
    }

    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch (_) {
      return { agents, count: 0 };
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;

      const filePath = path.join(dirPath, entry);
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (_) {
        continue;
      }

      const fm = parseFrontmatter(content);
      const agentName = fm.name || entry.replace(/\.md$/, '');

      const agent = { name: agentName };
      if (fm.description) agent.description = fm.description;
      if (fm.model) agent.model = fm.model;

      agents.push(agent);
    }

    return { agents, count: agents.length };
  }

  // Scan all source directories
  const sources = [];
  const allAgents = [];

  for (const dir of scanDirs) {
    const { agents, count } = scanDir(dir);
    // Normalize path separators for YAML output
    sources.push({ path: dir.replace(/\\/g, '/') + '/', count });
    allAgents.push(...agents);
  }

  // Build YAML output manually (zero-dep)
  const today = new Date().toISOString().slice(0, 10);

  let yaml = `generated: ${today}\n`;
  yaml += `sources:\n`;
  for (const src of sources) {
    yaml += `  - path: ${src.path}\n`;
    yaml += `    count: ${src.count}\n`;
  }
  yaml += `agents:\n`;

  if (allAgents.length === 0) {
    yaml += `  []\n`;
  } else {
    for (const agent of allAgents) {
      yaml += `  - name: ${agent.name}\n`;
      if (agent.description) {
        // Wrap description in double quotes and escape inner quotes
        const safe = agent.description.replace(/"/g, '\\"');
        yaml += `    description: "${safe}"\n`;
      }
      if (agent.model) {
        yaml += `    model: ${agent.model}\n`;
      }
    }
  }

  // Write to ~/.claude/conductor-registry.yaml
  const outputPath = path.join(homeDir, '.claude', 'conductor-registry.yaml');
  fs.writeFileSync(outputPath, yaml, 'utf8');

} catch (_) {
  // Silent — never crash a SessionStart hook
}
