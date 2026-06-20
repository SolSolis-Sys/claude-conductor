'use strict';

/**
 * conductor scoring — static keyword-based agent recommendation
 * Copyright © 2026 SolSolis-Sys — MIT License
 *
 * Scores agents against a task description using keyword matching.
 * Top-N recommendations are injected into /conductor:dispatch Step 1.
 */

/** Static keyword map: agent name → relevant keywords */
const AGENT_KEYWORDS = {
  matos: ['python', 'fastapi', 'api', 'script', 'json', 'build', 'deploy', 'module', 'backend', 'server', 'forge', 'pytest'],
  'matos-script': ['typescript', 'node', 'nodejs', 'script', 'cli', 'tool', 'hub', 'js', 'automation', 'pipeline'],
  'matos-forge': ['json', 'workflow', 'schema', 'nows', 'module', 'config', 'spec'],
  'matos-exec': ['bash', 'deploy', 'install', 'setup', 'venv', 'pip', 'smoke', 'run', 'exec'],
  theia: ['spec', 'ticket', 'doc', 'docs', 'plan', 'specs', 'blueprint', 'roadmap', 'planning', 'structure', 'feature'],
  janus: ['frontend', 'html', 'css', 'ui', 'design', 'interface', 'visual', 'component', 'style', 'layout', 'web'],
  mnemosyne: ['memoire', 'memory', 'archive', 'journal', 'log', 'clean', 'mémoire', 'archiver', 'cleanup', 'doc'],
  librarian: ['livre blanc', 'whitepaper', 'lb-nos', 'chapitre', 'chapter', 'documentation', 'book'],
  'blueprint-forge': ['blueprint', 'workflow', 'multi-agent', 'conductor', 'loop'],
  'code-reviewer': ['review', 'audit', 'quality', 'bug', 'security', 'refactor', 'lint'],
  'security-reviewer': ['security', 'vulnerability', 'auth', 'injection', 'owasp', 'leak'],
};

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
