/**
 * task-log.js
 * PreToolUse hook for claude-conductor — fires before every Agent tool call.
 * Appends a one-line JSON entry to ~/.claude/conductor/task-log.jsonl.
 * Zero external dependencies. Silent on errors.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  // Hook input arrives as JSON on stdin
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      const toolInput = input.tool_input || {};

      const entry = {
        ts: new Date().toISOString(),
        tool: 'Agent',
        description: toolInput.description || '',
        prompt_excerpt: (toolInput.prompt || '').slice(0, 120),
        subagent_type: toolInput.subagent_type || 'general-purpose',
        background: toolInput.run_in_background || false,
      };

      const logDir = path.join(os.homedir(), '.claude', 'conductor');
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'task-log.jsonl');
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (_) {
      // Silent — never block a dispatch
    }
  });
} catch (_) {
  // Silent
}
