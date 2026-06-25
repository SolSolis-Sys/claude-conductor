'use strict';

class MetricsCollector {
  constructor() { this._gates = {}; this._startTimes = {}; }

  startGate(gateId) {
    this._startTimes[gateId] = Date.now();
    if (!this._gates[gateId]) {
      this._gates[gateId] = { attempts: 0, success: false, duration_ms: 0, tokens: 0, errors: [] };
    }
    this._gates[gateId].attempts++;
  }

  endGate(gateId, { success = false, tokens = 0, error = null } = {}) {
    const g = this._gates[gateId];
    if (!g) return;
    g.duration_ms += Date.now() - (this._startTimes[gateId] || Date.now());
    g.tokens += tokens;
    g.success = success;
    if (error) g.errors.push(error);
    delete this._startTimes[gateId];
  }

  flush() {
    const gates = { ...this._gates };
    const total_duration_ms = Object.values(gates).reduce((s, g) => s + g.duration_ms, 0);
    const total_tokens = Object.values(gates).reduce((s, g) => s + g.tokens, 0);
    return { gates, total_duration_ms, total_tokens, total_gates: Object.keys(gates).length };
  }

  writeReport(filePath) {
    require('fs').writeFileSync(filePath || 'run_metrics.json', JSON.stringify({ ...this.flush(), timestamp: new Date().toISOString() }, null, 2));
    return filePath || 'run_metrics.json';
  }
}

module.exports = { MetricsCollector };
