#!/usr/bin/env node
'use strict';

/**
 * lib/calendar.js — Conductor Calendar CRUD Library
 * Manages work agenda stored at ~/.claude/conductor-calendar/agenda.json
 * Zero external dependencies (stdlib only: fs, path, os, crypto).
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Config (override via CONDUCTOR_CALENDAR_DIR env var for tests) ──────────

const _defaultDir = process.env.CONDUCTOR_CALENDAR_DIR
  ? process.env.CONDUCTOR_CALENDAR_DIR
  : path.join(os.homedir(), '.claude', 'conductor-calendar');

/**
 * Mutable config — tests can override agendaPath and throttleFile before calling functions.
 * @type {{ agendaDir: string, agendaPath: string, throttleFile: string }}
 */
const _config = {
  agendaDir: _defaultDir,
  agendaPath: path.join(_defaultDir, 'agenda.json'),
  throttleFile: path.join(_defaultDir, '.last-inject'),
};

const THROTTLE_MINUTES = 5;
const PRUNE_WINDOW_HOURS = 24;
const MAX_EVENTS_DISPLAY = 2;

// ── Core I/O ────────────────────────────────────────────────────────────────

/**
 * Read and parse agenda.json.
 * Silent fail on missing or malformed file.
 * @returns {{ version: string, events: Array }} Parsed agenda or empty default
 */
function readAgenda() {
  try {
    const raw = fs.readFileSync(_config.agendaPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data.version || !Array.isArray(data.events)) {
      return { version: '1.0', events: [] };
    }
    return { version: data.version, events: data.events };
  } catch {
    return { version: '1.0', events: [] };
  }
}

/**
 * Write events array to agenda.json (creates dir if missing).
 * Silent fail on I/O errors.
 * @param {Array} events - Array of event objects
 */
function writeAgenda(events) {
  try {
    fs.mkdirSync(path.dirname(_config.agendaPath), { recursive: true });
    fs.writeFileSync(
      _config.agendaPath,
      JSON.stringify({ version: '1.0', events }, null, 2),
      'utf8'
    );
  } catch {
    // Silent fail — callers must not crash on I/O errors
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Add an event to the agenda.
 * @param {string} title - Event title (non-empty)
 * @param {string} isoStart - ISO8601 datetime string (e.g. "2026-06-27T14:00:00Z")
 * @param {string[]} [tags=[]] - Optional tags array
 * @returns {{ id: string, title: string, start: string, done: boolean, tags: string[] }} Created event
 * @throws {Error} If isoStart is not a valid ISO8601 date
 */
function addEvent(title, isoStart, tags = []) {
  const date = new Date(isoStart);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO8601 date: "${isoStart}"`);
  }
  const event = {
    id: crypto.randomUUID(),
    title: String(title),
    start: isoStart,
    done: false,
    tags: Array.isArray(tags) ? tags : [],
  };
  const agenda = readAgenda();
  agenda.events.push(event);
  writeAgenda(agenda.events);
  return event;
}

/**
 * Get upcoming events within the next [hoursAhead] hours.
 * Excludes done events. Returns max MAX_EVENTS_DISPLAY (2), sorted by start asc.
 * @param {number} [hoursAhead=2] - Look-ahead window in hours
 * @returns {Array} Upcoming event objects
 */
function getUpcoming(hoursAhead = 2) {
  const agenda = readAgenda();
  const windowEnd = Date.now() + hoursAhead * 60 * 60 * 1000;

  return agenda.events
    .filter(e => !e.done && new Date(e.start).getTime() <= windowEnd)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, MAX_EVENTS_DISPLAY);
}

/**
 * List all active (non-done) events with optional filters.
 * @param {Object} [filter={}] - Optional filter object
 * @param {string[]} [filter.tags] - Return events matching ANY of these tags
 * @param {string} [filter.from] - Include events with start >= this date
 * @param {string} [filter.to] - Include events with start <= this date
 * @returns {Array} Filtered events sorted by start asc
 */
function listEvents(filter = {}) {
  const agenda = readAgenda();
  let events = agenda.events.filter(e => !e.done);

  if (filter.tags && filter.tags.length > 0) {
    events = events.filter(e =>
      Array.isArray(e.tags) && filter.tags.some(tag => e.tags.includes(tag))
    );
  }

  if (filter.from) {
    const fromMs = new Date(filter.from).getTime();
    events = events.filter(e => new Date(e.start).getTime() >= fromMs);
  }

  if (filter.to) {
    const toMs = new Date(filter.to).getTime();
    events = events.filter(e => new Date(e.start).getTime() <= toMs);
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Mark an event as done.
 * @param {string} eventId - UUID of the event to mark done
 * @returns {boolean} True if found and updated, false if not found
 */
function markDone(eventId) {
  const agenda = readAgenda();
  const event = agenda.events.find(e => e.id === eventId);
  if (!event) return false;
  event.done = true;
  writeAgenda(agenda.events);
  return true;
}

/**
 * Auto-prune expired events:
 * - Events with done: true
 * - Events with start < now - PRUNE_WINDOW_HOURS
 * @returns {number} Count of pruned events
 */
function pruneOld() {
  const agenda = readAgenda();
  const threshold = Date.now() - PRUNE_WINDOW_HOURS * 60 * 60 * 1000;
  const before = agenda.events.length;
  const kept = agenda.events.filter(
    e => !e.done && new Date(e.start).getTime() >= threshold
  );
  writeAgenda(kept);
  return before - kept.length;
}

/**
 * Format events as a compact system message string.
 * Each event formatted as: [YYYY-MM-DD HH:MM] title (UTC times)
 * @param {Array} events - Event array (max MAX_EVENTS_DISPLAY used)
 * @returns {string} Formatted string, or empty string if no events
 */
function formatSystemMessage(events) {
  if (!events || events.length === 0) return '';

  const lines = events.slice(0, MAX_EVENTS_DISPLAY).map(e => {
    const d = new Date(e.start);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    return `[${yyyy}-${mm}-${dd} ${hh}:${min}] ${e.title}`;
  });

  return lines.join('\n');
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  readAgenda,
  writeAgenda,
  addEvent,
  getUpcoming,
  listEvents,
  markDone,
  pruneOld,
  formatSystemMessage,
  // Internal config — tests may mutate _config to redirect to temp paths
  _config,
  THROTTLE_MINUTES,
  PRUNE_WINDOW_HOURS,
  MAX_EVENTS_DISPLAY,
};
