'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * conductor scoring — keyword-based agent recommendation
 * Copyright © 2026 SolSolis-Sys — MIT License
 *
 * Scores agents against a task description using keyword matching.
 * Top-N recommendations are injected into /conductor:dispatch Step 1.
 * Keywords are loaded dynamically from ~/.claude/conductor/agent-keywords.json
 */

/** Default keyword map (used if config file not found) */
const DEFAULT_KEYWORDS = {
  'backend': ['python', 'fastapi', 'api', 'server', 'database', 'backend', 'json', 'schema'],
  'frontend': ['html', 'css', 'ui', 'design', 'interface', 'component', 'style', 'web'],
  'typescript': ['typescript', 'nodejs', 'node', 'cli', 'automation', 'pipeline', 'js'],
  'docs': ['spec', 'ticket', 'doc', 'docs', 'plan', 'blueprint', 'roadmap', 'readme'],
  'memory': ['memory', 'archive', 'journal', 'log', 'cleanup', 'cache'],
  'code-reviewer': ['review', 'audit', 'quality', 'bug', 'refactor', 'lint'],
  'security-reviewer': ['security', 'vulnerability', 'auth', 'injection', 'owasp'],
};

/**
 * Load agent keywords from config file or use defaults.
 * @returns {object} keyword map { agentName: [keywords...] }
 */
function loadAgentKeywords() {
  const configPath = path.join(os.homedir(), '.claude', 'conductor', 'agent-keywords.json');

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    // Fall through to defaults
  }

  return DEFAULT_KEYWORDS;
}

/** Agent keyword map: dynamically loaded at module init */
const AGENT_KEYWORDS = loadAgentKeywords();

/**
 * Score a single agent against a task.
 * @param {string} agentName
 * @param {string} task
 * @returns {number} number of matched keywords
 */
function scoreAgent(agentName, task) {
  const keywords = AGENT_KEYWORDS[agentName];
  if (!keywords) return 0;
  const t = task.toLowerCase();
  return keywords.filter((k) => t.includes(k.toLowerCase())).length;
}

/**
 * Recommend top-N agents for a task.
 * @param {string} task
 * @param {number} topN
 * @returns {Array<{name: string, score: number, matched: string[]}>}
 */
function recommendAgents(task, topN = 3) {
  const t = task.toLowerCase();
  const scored = Object.entries(AGENT_KEYWORDS).map(([name, keywords]) => ({
    name,
    score: keywords.filter((k) => t.includes(k.toLowerCase())).length,
    matched: keywords.filter((k) => t.includes(k.toLowerCase())),
  }));
  return scored
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Format recommendations as a human-readable string for dispatch context.
 * @param {string} task
 * @param {number} topN
 * @returns {string}
 */
function formatRecommendations(task, topN = 3) {
  const recs = recommendAgents(task, topN);
  if (recs.length === 0) {
    return 'No static keyword match found. Use your best judgment from the registry.';
  }
  const lines = recs.map(
    (r, i) => `  ${i + 1}. ${r.name} (score: ${r.score} — matched: ${r.matched.join(', ')})`
  );
  return `Static keyword recommendations:\n${lines.join('\n')}`;
}

module.exports = { scoreAgent, recommendAgents, formatRecommendations, AGENT_KEYWORDS };
