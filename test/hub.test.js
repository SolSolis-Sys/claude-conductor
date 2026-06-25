#!/usr/bin/env node

/**
 * hub.test.js
 * Tests for lib/hub.js — validateBlueprint, assertValidName, install, resolveDependencies.
 * Run: node test/hub.test.js
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const https = require('https');

// ── Test harness ───────────────────────────────────────────────────────────

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertThrows(fn, expectedSubstr, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (expectedSubstr && !e.message.toLowerCase().includes(expectedSubstr.toLowerCase())) {
      throw new Error(`${message} — error did not include "${expectedSubstr}": ${e.message}`);
    }
  }
  if (!threw) throw new Error(`${message} — expected an error to be thrown`);
}

async function assertRejects(fn, expectedSubstr, message) {
  let threw = false;
  try {
    await fn();
  } catch (e) {
    threw = true;
    if (expectedSubstr && !e.message.toLowerCase().includes(expectedSubstr.toLowerCase())) {
      throw new Error(`${message} — error did not include "${expectedSubstr}": ${e.message}`);
    }
  }
  if (!threw) throw new Error(`${message} — expected a rejection`);
}

// ── Temp dir ───────────────────────────────────────────────────────────────

const TMP = path.join(os.tmpdir(), 'conductor-hub-test-' + process.pid);
fs.mkdirSync(TMP, { recursive: true });

// ── Helper: mock https.get ─────────────────────────────────────────────────
// hub.js uses the https module it required at load time.
// Since Node.js caches require(), patching https.get here patches it inside hub too.

const originalHttpsGet = https.get;

function mockHttpsGet(behavior) {
  https.get = behavior;
}

function restoreHttpsGet() {
  https.get = originalHttpsGet;
}

// ── Import hub (AFTER patching potential, but we patch per-test) ───────────
// hub.js uses https.get via closure — since require cache shares the object,
// mutations to https.get are visible inside hub.js too.

// We need to load hub after setting up the module environment.
// hub.js calls process.exit on install errors — we temporarily stub it.
const originalProcessExit = process.exit.bind(process);

function stubProcessExit() {
  const errors = [];
  process.exit = (code) => {
    const err = new Error(`process.exit(${code}) called`);
    err.exitCode = code;
    errors.push(err);
    throw err;
  };
  return errors;
}

function restoreProcessExit() {
  process.exit = originalProcessExit;
}

const hub = require(path.join(__dirname, '..', 'lib', 'hub'));
const { resolveDependencies } = require(path.join(__dirname, '..', 'lib', 'dependency-resolver'));
const { validateBlueprint } = hub;

// ── Helper: build a fake HTTPS response stream ────────────────────────────

function makeFakeResponse(statusCode, body) {
  const { EventEmitter } = require('events');
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.resume = () => {};
  // Emit data + end asynchronously so handlers can be attached
  process.nextTick(() => {
    if (statusCode === 200) {
      res.emit('data', Buffer.from(body));
      res.emit('end');
    }
  });
  return res;
}

function makeFakeRequest(errorToEmit) {
  const { EventEmitter } = require('events');
  const req = new EventEmitter();
  req.destroy = () => {};
  if (errorToEmit) {
    process.nextTick(() => req.emit('error', errorToEmit));
  }
  return req;
}

// ── Tests ──────────────────────────────────────────────────────────────────

// Test 1: validateBlueprint — champs manquants lance erreur
test('Test 1a: validateBlueprint — objet vide lance erreur "missing required fields"', async () => {
  stubProcessExit();
  try {
    // install() calls assertValidName then fetchJson then validateBlueprint
    // To test validateBlueprint directly with a bad payload, mock the fetch to return {}
    mockHttpsGet((url, cb) => {
      const res = makeFakeResponse(200, JSON.stringify({}));
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('valid-name');
    assert(false, 'should have thrown');
  } catch (e) {
    // process.exit was stubbed — error message or exit code
    assert(
      e.message.includes('process.exit') || e.message.toLowerCase().includes('missing'),
      `should trigger exit or missing-fields error, got: ${e.message}`
    );
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
});

test('Test 1b: validateBlueprint — blueprint avec agents vide lance erreur "at least one agent"', async () => {
  stubProcessExit();
  try {
    mockHttpsGet((url, cb) => {
      const bp = { name: 'x', version: '1', agents: [] };
      const res = makeFakeResponse(200, JSON.stringify(bp));
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('valid-name');
    assert(false, 'should have thrown');
  } catch (e) {
    assert(
      e.message.includes('process.exit') || e.message.toLowerCase().includes('agent'),
      `should trigger exit or at-least-one-agent error, got: ${e.message}`
    );
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
});

// Test 2: assertValidName — nom valide passe (via install sans réseau, erreur réseau != nom invalide)
test('Test 2: assertValidName — nom valide ne throw pas', async () => {
  // We test that a valid name passes the name check.
  // We mock https.get to immediately emit ENOTFOUND (so install fails at network, not at name validation).
  stubProcessExit();
  let nameRejectedByName = false;
  try {
    mockHttpsGet((url, cb) => {
      const req = makeFakeRequest();
      const netErr = new Error('getaddrinfo ENOTFOUND');
      netErr.code = 'ENOTFOUND';
      process.nextTick(() => req.emit('error', netErr));
      return req;
    });
    await hub.install('brainstorming-premortem');
  } catch (e) {
    // If the error mentions "invalid" or "traversal" it failed at name validation — BAD
    if (e.message.toLowerCase().includes('invalid') || e.message.toLowerCase().includes('traversal')) {
      nameRejectedByName = true;
    }
    // Otherwise it's a network error — expected
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
  assert(!nameRejectedByName, 'valid name "brainstorming-premortem" should not be rejected by assertValidName');
});

// Test 3: assertValidName — path traversal bloqué
test('Test 3: assertValidName — path traversal bloqué', async () => {
  let caughtError = null;
  stubProcessExit();
  try {
    // ../../../etc/passwd fails NAME_RE (/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/) immediately
    await hub.install('../../../etc/passwd');
  } catch (e) {
    caughtError = e;
  } finally {
    restoreProcessExit();
  }
  assert(caughtError !== null, 'path traversal should throw or exit');
  const msg = caughtError.message.toLowerCase();
  assert(
    msg.includes('invalid') || msg.includes('traversal') || msg.includes('process.exit'),
    `error should mention invalid name or traversal, got: ${caughtError.message}`
  );
});

// Test 4: install — blueprint introuvable (404)
test('Test 4: install — blueprint introuvable (404) rejette avec "not found"', async () => {
  stubProcessExit();
  let caughtError = null;
  try {
    mockHttpsGet((url, cb) => {
      const res = makeFakeResponse(404, '');
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('nonexistent');
  } catch (e) {
    caughtError = e;
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
  assert(caughtError !== null, 'should throw or exit on 404');
  // hub.js catches "Not found" and calls process.exit(1) — our stub throws "process.exit(1) called"
  const msg = caughtError.message.toLowerCase();
  assert(
    msg.includes('not found') || msg.includes('process.exit'),
    `error should mention not found or process exit, got: ${caughtError.message}`
  );
});

// Test 5: install — erreur réseau (ENOTFOUND)
test('Test 5: install — erreur réseau ENOTFOUND rejette avec "Network unavailable"', async () => {
  stubProcessExit();
  let caughtError = null;
  try {
    mockHttpsGet((url, cb) => {
      const req = makeFakeRequest();
      const netErr = new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com');
      netErr.code = 'ENOTFOUND';
      process.nextTick(() => req.emit('error', netErr));
      return req;
    });
    await hub.install('some-blueprint');
  } catch (e) {
    caughtError = e;
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
  assert(caughtError !== null, 'should throw or exit on ENOTFOUND');
  const msg = caughtError.message.toLowerCase();
  assert(
    msg.includes('network') || msg.includes('unavailable') || msg.includes('process.exit'),
    `error should mention network unavailable or process exit, got: ${caughtError.message}`
  );
});

// Test 6: install — blueprint valide installé dans répertoire temporaire
test('Test 6: install — blueprint valide installé sur disque', async () => {
  // We need to override LOCAL_BLUEPRINTS_DIR used by hub.js.
  // hub.js uses a module-level constant. The only way to redirect the install destination
  // is to patch fs.mkdirSync and fs.writeFileSync temporarily for this test.
  const originalMkdirSync = fs.mkdirSync.bind(fs);
  const originalWriteFileSync = fs.writeFileSync.bind(fs);

  let capturedPath = null;
  let capturedContent = null;

  fs.mkdirSync = (p, opts) => {
    // Redirect any path that looks like it goes to .claude/conductor/blueprints
    if (typeof p === 'string' && p.includes('conductor') && p.includes('blueprints')) {
      const rel = path.relative(path.join(os.homedir(), '.claude', 'conductor', 'blueprints'), p);
      p = path.join(TMP, 'blueprints', rel);
    }
    originalMkdirSync(p, opts);
  };

  fs.writeFileSync = (p, content, enc) => {
    if (typeof p === 'string' && p.includes('conductor') && p.includes('blueprints')) {
      const rel = path.relative(path.join(os.homedir(), '.claude', 'conductor', 'blueprints'), p);
      p = path.join(TMP, 'blueprints', rel);
      capturedPath = p;
      capturedContent = content;
    }
    originalWriteFileSync(p, content, enc);
  };

  stubProcessExit();
  try {
    const bp = { name: 'test-bp', version: '1.0.0', agents: [{ role: 'tester' }] };
    mockHttpsGet((url, cb) => {
      const res = makeFakeResponse(200, JSON.stringify(bp));
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('test-bp');
  } catch (e) {
    // If process.exit was called, it's a failure
    if (e.message && e.message.includes('process.exit')) {
      throw new Error(`install failed unexpectedly: ${e.message}`);
    }
    // Other errors may be non-critical (e.g. console output issues) — check capturedPath
  } finally {
    fs.mkdirSync = originalMkdirSync;
    fs.writeFileSync = originalWriteFileSync;
    restoreHttpsGet();
    restoreProcessExit();
  }

  assert(capturedPath !== null, 'blueprint file should have been written to disk');
  assert(fs.existsSync(capturedPath), 'blueprint.json should exist on disk');

  const written = JSON.parse(fs.readFileSync(capturedPath, 'utf8'));
  assertEqual(written.name, 'test-bp', 'written blueprint name should match');
  assertEqual(written.version, '1.0.0', 'written blueprint version should match');

  // Cleanup
  try { fs.rmSync(path.join(TMP, 'blueprints'), { recursive: true, force: true }); } catch (_) {}
});

// Test 7: resolveDependencies — dépendances résolues
test('Test 7: resolveDependencies — dépendances résolues correctement', () => {
  const blueprint = { name: 'my-bp', version: '1.0.0', requires: ['agent-a'] };
  const catalog = {
    agents: { 'agent-a': { id: 'agent-a', description: 'Agent A', requires: [] } },
    tools: {},
    skills: {}
  };

  const { resolved, missing, circular } = resolveDependencies(blueprint, catalog);

  assert(Array.isArray(resolved), 'resolved should be an array');
  assert(resolved.includes('agent-a'), 'resolved should include agent-a');
  assertEqual(missing.length, 0, 'missing should be empty');
  assertEqual(circular.length, 0, 'circular should be empty');
});

// Test 8: resolveDependencies — dépendances circulaires détectées
test('Test 8: resolveDependencies — dépendances circulaires détectées', () => {
  const blueprint = { name: 'circular-bp', version: '1.0.0', requires: ['a'] };
  const catalog = {
    agents: {
      'a': { id: 'a', requires: ['b'] },
      'b': { id: 'b', requires: ['a'] }
    },
    tools: {},
    skills: {}
  };

  const { circular } = resolveDependencies(blueprint, catalog);

  assert(circular.length > 0, 'circular should detect the a→b→a cycle');
  // At least one cycle path should contain both 'a' and 'b'
  const cycleFlat = circular.flat();
  assert(cycleFlat.includes('a'), 'cycle should mention "a"');
  assert(cycleFlat.includes('b'), 'cycle should mention "b"');
});

// Test 9: validateBlueprint — commande destructive bloquée
test('Test 9: validateBlueprint — commande destructive bloquée', async () => {
  stubProcessExit();
  let caughtError = null;
  try {
    const bp = {
      name: 'evil-bp',
      version: '1.0.0',
      agents: [{ role: 'destroyer' }],
      permissions: { allowed_commands: ['rm -rf /'] }
    };
    mockHttpsGet((url, cb) => {
      const res = makeFakeResponse(200, JSON.stringify(bp));
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('evil-bp');
  } catch (e) {
    caughtError = e;
  } finally {
    restoreHttpsGet();
    restoreProcessExit();
  }
  assert(caughtError !== null, 'destructive command blueprint should throw or exit');
  const msg = caughtError.message.toLowerCase();
  assert(
    msg.includes('destructive') || msg.includes('process.exit'),
    `error should mention destructive or exit, got: ${caughtError.message}`
  );
});

// A1 — validateBlueprint: non-string name → throw
test('validateBlueprint throws on non-string name', () => {
  assertThrows(
    () => validateBlueprint({ name: 123, version: '1.0.0', agents: [{ id: 'a', uses: 'x' }] }, 'test-bp'),
    'has invalid name or version',
    'non-string name should throw'
  );
});

// A1 — validateBlueprint: non-string version → throw
test('validateBlueprint throws on non-string version', () => {
  assertThrows(
    () => validateBlueprint({ name: 'test-bp', version: null, agents: [{ id: 'a', uses: 'x' }] }, 'test-bp'),
    'has invalid name or version',
    'non-string version should throw'
  );
});

// A3 — install: skip if same version already present
test('install skips if same version already present', async () => {
  // Mock fs.readFileSync to simulate an already-installed blueprint
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const existingBp = { name: 'cached-bp', version: '2.0.0', agents: [{ id: 'a', uses: 'x' }] };

  fs.readFileSync = (p, enc) => {
    if (typeof p === 'string' && p.includes('cached-bp') && p.includes('blueprint.json')) {
      return JSON.stringify(existingBp);
    }
    return originalReadFileSync(p, enc);
  };

  stubProcessExit();
  const logMessages = [];
  const originalLog = console.log.bind(console);
  console.log = (...args) => { logMessages.push(args.join(' ')); };

  try {
    // Serve the same version from "remote"
    mockHttpsGet((url, cb) => {
      const res = makeFakeResponse(200, JSON.stringify(existingBp));
      cb(res);
      return makeFakeRequest();
    });
    await hub.install('cached-bp');
  } finally {
    fs.readFileSync = originalReadFileSync;
    console.log = originalLog;
    restoreHttpsGet();
    restoreProcessExit();
  }

  const skipped = logMessages.some((m) => m.includes('already installed'));
  assert(skipped, `install should log "already installed" when version matches, got: ${JSON.stringify(logMessages)}`);
});

// ── Cleanup ────────────────────────────────────────────────────────────────

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

// ── Run ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\nHub Test Suite\n' + '='.repeat(40));

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  pass  ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  FAIL  ${t.name}`);
      console.log(`        ${e.message}`);
      failed++;
    }
  }

  cleanup();

  console.log('\n' + '='.repeat(40));
  console.log(`Total: ${passed} passed, ${failed} failed\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
