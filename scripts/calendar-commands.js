#!/usr/bin/env node
'use strict';

/**
 * scripts/calendar-commands.js — Calendar sub-command dispatcher
 * Usage: node scripts/calendar-commands.js <calendar:add|calendar:list|calendar:done> [args...]
 * Invoked by commands/calendar.md via Claude Code.
 * Zero external dependencies (stdlib only via lib/calendar.js).
 * Copyright © 2026 SolSolis-Sys — MIT License
 */

const path = require('path');
const calendar = require(path.join(__dirname, '..', 'lib', 'calendar'));

const [, , subcmd, ...args] = process.argv;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format ISO date as "YYYY-MM-DD HH:MM" in UTC */
function fmtUTC(iso) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// ── Sub-commands ─────────────────────────────────────────────────────────────

/**
 * calendar:add <title> <isoStart> [tags]
 * tags: comma-separated string, optional
 */
function cmdAdd([title, isoStart, tagsRaw]) {
  if (!title || !title.trim()) {
    process.stdout.write('✗ Title required\n');
    process.exit(1);
    return;
  }
  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    : [];
  let event;
  try {
    event = calendar.addEvent(title, isoStart, tags);
  } catch {
    process.stdout.write(`✗ Invalid date: "${isoStart}"\n`);
    process.exit(1);
    return;
  }
  const dateStr = fmtUTC(event.start);
  process.stdout.write(`✓ Event added: ${event.id}\n`);
  process.stdout.write(`  ${event.title} @ ${dateStr} (UTC)\n`);
  process.stdout.write(`  Tags: ${event.tags.join(', ')}\n`);
}

/**
 * calendar:list [today|week|all]
 * Renders an ASCII table of non-done events.
 */
function cmdList([filterArg = 'all']) {
  const now = new Date();
  let filter = {};

  if (filterArg === 'today') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    filter = { from: from.toISOString(), to: to.toISOString() };
  } else if (filterArg === 'week') {
    filter = {
      from: now.toISOString(),
      to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const events = calendar.listEvents(filter);

  if (events.length === 0) {
    process.stdout.write(`No events found for filter: ${filterArg}\n`);
    return;
  }

  const COL_TITLE = 30;
  const header =
    `${'ID'.padEnd(8)} | ${'Start'.padEnd(16)} | ${'Title'.padEnd(COL_TITLE)} | Tags`;
  const sep =
    `${'-'.repeat(8)}-+-${'-'.repeat(16)}-+-${'-'.repeat(COL_TITLE)}-+------`;
  process.stdout.write(header + '\n');
  process.stdout.write(sep + '\n');

  for (const e of events) {
    const id8 = e.id.slice(0, 8);
    const start = fmtUTC(e.start);
    const rawTitle = e.title;
    const title = rawTitle.length > COL_TITLE
      ? rawTitle.slice(0, COL_TITLE - 3) + '...'
      : rawTitle.padEnd(COL_TITLE);
    const tags = Array.isArray(e.tags) ? e.tags.join(', ') : '';
    process.stdout.write(`${id8} | ${start.padEnd(16)} | ${title} | ${tags}\n`);
  }
}

/**
 * calendar:done <eventId>
 * Accepts full UUID or 8-char prefix. Marks done then prunes.
 */
function cmdDone([idArg]) {
  if (!idArg) {
    process.stdout.write('✗ Event ID required\n  Hint: run /calendar:list all\n');
    process.exit(1);
    return;
  }

  const { events } = calendar.readAgenda();
  const event = events.find(e => e.id === idArg || e.id.startsWith(idArg));

  if (!event) {
    process.stdout.write(`✗ Event not found: ${idArg}\n  Hint: run /calendar:list all\n`);
    process.exit(1);
    return;
  }

  calendar.markDone(event.id);
  const pruneCount = calendar.pruneOld();
  const short = event.id.slice(0, 8);
  process.stdout.write(`✓ Marked done: ${event.title} (${short})\n`);
  process.stdout.write(`  Pruned ${pruneCount} old events.\n`);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

switch (subcmd) {
  case 'calendar:add':
    cmdAdd(args);
    break;
  case 'calendar:list':
    cmdList(args);
    break;
  case 'calendar:done':
    cmdDone(args);
    break;
  default:
    process.stdout.write(
      'Usage: node scripts/calendar-commands.js <calendar:add|calendar:list|calendar:done> [args...]\n\n' +
      'Sub-commands:\n' +
      '  calendar:add <title> <isoStart> [tags]   Add event (tags: comma-separated)\n' +
      '  calendar:list [today|week|all]            List events (default: all)\n' +
      '  calendar:done <eventId>                   Mark event done (8-char prefix OK)\n'
    );
    process.exit(1);
}
