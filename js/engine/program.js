// The training engine: builds sessions, adjusts them live, and learns from
// what you log. Everything here is pure data in, data out, so it can be
// unit tested without a browser.
import { estimate1RM, loadFor } from './rpe.js';
import { roundBarbell, roundTo, warmupSets, UNIT_CONFIG } from './loads.js';
import {
  MAIN_LIFTS, ACCESSORIES, BLOCKS, TEMPLATES, DELOAD, DELOAD_SECONDARY,
  WEEKS_PER_BLOCK, blockTypeFor,
} from './library.js';
import { buildCardioSession, progressCardio, INTERVAL_LADDER } from './cardio.js';

export const STATE_VERSION = 1;
const MAIN_REST = 150;
const SECONDARY_REST = 120;
const ACCESSORY_REST = 60;
const BREAK_DAYS = 14;

// ---------------------------------------------------------------------------
// Setup

export function defaultProfile() {
  return {
    units: 'lb',
    age: 40,
    liftDays: 3,
    cardioDays: 2,
    length: 'standard',
    z2Start: 25,
    z2Max: 45,
  };
}

// liftInputs: { squat: { weight, reps, rpe }, ... } from a recent set.
export function createState(profile, liftInputs, now = new Date()) {
  const lifts = {};
  for (const key of Object.keys(MAIN_LIFTS)) {
    const input = liftInputs[key] || {};
    const raw = estimate1RM(Number(input.weight), Number(input.reps), Number(input.rpe ?? 8));
    // Start a touch under the estimate so the first block builds momentum.
    const e1rm = raw > 0 ? raw * 0.95 : defaultE1RM(key, profile.units);
    lifts[key] = { e1rm, strikes: 0, history: [{ date: now.toISOString(), e1rm }] };
  }
  const accessories = {};
  for (const [key, acc] of Object.entries(ACCESSORIES)) {
    accessories[key] = acc.loaded
      ? { weight: acc.start[profile.units] }
      : { target: acc.range[0] };
  }
  return {
    version: STATE_VERSION,
    createdAt: now.toISOString(),
    profile: { ...profile },
    lifts,
    accessories,
    cardio: { z2Minutes: profile.z2Start, intervalRung: 0 },
    cursor: { block: 0, week: 1, slot: 0 },
    history: [],
    active: null,
  };
}

function defaultE1RM(lift, units) {
  const lb = { squat: 135, bench: 115, deadlift: 165, press: 75 }[lift];
  return units === 'kg' ? lb / 2.2 : lb;
}

// ---------------------------------------------------------------------------
// Weekly structure

function cardioKinds(count, week) {
  if (count <= 0) return [];
  if (count === 1) return [week % 2 === 0 ? 'intervals' : 'z2'];
  if (count === 2) return ['z2', 'intervals'];
  return ['z2', 'intervals', 'z2'];
}

// Interleave lifting and cardio: lift, cardio, lift, cardio, ...
export function weekPlan(profile, week) {
  const days = TEMPLATES[profile.liftDays];
  const cardio = cardioKinds(profile.cardioDays, week);
  const plan = [];
  let c = 0;
  days.forEach((_, i) => {
    plan.push({ type: 'lift', day: i });
    if (c < cardio.length && i < days.length - 1) plan.push({ type: 'cardio', kind: cardio[c++] });
  });
  while (c < cardio.length) plan.push({ type: 'cardio', kind: cardio[c++] });
  return plan;
}

export function currentSlot(state) {
  const plan = weekPlan(state.profile, state.cursor.week);
  return plan[Math.min(state.cursor.slot, plan.length - 1)];
}

export function advanceCursor(cursor, profile) {
  const plan = weekPlan(profile, cursor.week);
  let { block, week, slot } = cursor;
  slot += 1;
  if (slot >= plan.length) {
    slot = 0;
    week += 1;
    if (week > WEEKS_PER_BLOCK) {
      week = 1;
      block += 1;
    }
  }
  return { block, week, slot };
}

export function blockInfo(cursor) {
  const type = blockTypeFor(cursor.block);
  const deload = cursor.week === WEEKS_PER_BLOCK;
  return {
    type,
    name: BLOCKS[type].name,
    focus: deload ? 'Lighter week to recover and consolidate. You come back stronger.' : BLOCKS[type].focus,
    week: cursor.week,
    deload,
    number: cursor.block + 1,
  };
}

export function daysSinceLastSession(state, now = new Date()) {
  const last = [...state.history].reverse().find((h) => !h.skipped);
  if (!last) return null;
  return Math.floor((now - new Date(last.date)) / 86400000);
}

export function isReturningFromBreak(state, now = new Date()) {
  const d = daysSinceLastSession(state, now);
  return d != null && d >= BREAK_DAYS;
}

// Readiness answers are 1-5 (higher = better). Low overall means an easier day.
export function readinessLevel(r) {
  if (!r) return 'normal';
  const avg = (Number(r.sleep) + Number(r.energy) + Number(r.soreness)) / 3;
  if (avg <= 2.34) return 'low';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Session building

export function buildSession(state, slot = currentSlot(state), { readiness = 'normal', cursor = state.cursor } = {}) {
  const info = blockInfo(cursor);
  const low = readiness === 'low';
  const meta = { block: info.name, blockNumber: info.number, week: cursor.week, deload: info.deload, lowReadiness: low };

  if (slot.type === 'cardio') {
    return { ...buildCardioSession(slot.kind, state.cardio, state.profile, { deload: info.deload, lowReadiness: low }), ...meta };
  }

  const { profile, lifts, accessories } = state;
  const { units } = profile;
  const short = profile.length === 'short';
  const tpl = TEMPLATES[profile.liftDays][slot.day];
  const wave = info.deload ? DELOAD : BLOCKS[info.type].weeks[cursor.week - 1];
  const exercises = [];

  // Main lift: one top set, then back-off sets about 1 RPE lighter.
  const topRpe = wave.rpe - (low ? 1 : 0);
  const backoffRpe = topRpe - 1;
  const backoffCount = Math.max(0, (info.deload ? 1 : 2) - (short ? 1 : 0) - (low ? 1 : 0));
  const e1rm = lifts[tpl.main].e1rm;
  const topWeight = roundBarbell(loadFor(e1rm, wave.reps, topRpe), units);
  const backoffWeight = Math.min(topWeight, roundBarbell(loadFor(e1rm, wave.reps, backoffRpe), units));
  exercises.push({
    role: 'main',
    lift: tpl.main,
    name: MAIN_LIFTS[tpl.main].name,
    rest: MAIN_REST,
    warmup: warmupSets(topWeight, units),
    sets: [
      { type: 'top', weight: topWeight, reps: wave.reps, rpe: topRpe },
      ...Array.from({ length: backoffCount }, () => ({ type: 'backoff', weight: backoffWeight, reps: wave.reps, rpe: backoffRpe })),
    ],
  });

  if (tpl.secondary) {
    const sec = info.deload ? DELOAD_SECONDARY : BLOCKS[info.type].secondary;
    const rpe = sec.rpe - (low ? 1 : 0);
    const count = Math.max(2, 3 - (short ? 1 : 0) - (low || info.deload ? 1 : 0));
    const weight = roundBarbell(loadFor(lifts[tpl.secondary].e1rm, sec.reps, rpe), units);
    exercises.push({
      role: 'secondary',
      lift: tpl.secondary,
      name: MAIN_LIFTS[tpl.secondary].name,
      rest: SECONDARY_REST,
      sets: Array.from({ length: count }, () => ({ type: 'straight', weight, reps: sec.reps, rpe })),
    });
  }

  const accKeys = tpl.accessories.slice(0, short ? 2 : 3);
  const accSets = short || low || info.deload ? 2 : 3;
  for (const key of accKeys) {
    const def = ACCESSORIES[key];
    const st = accessories[key];
    exercises.push({
      role: 'accessory',
      acc: key,
      name: def.name,
      note: def.note || '',
      unit: def.unit || 'reps',
      loaded: def.loaded,
      range: def.range,
      rest: ACCESSORY_REST,
      sets: Array.from({ length: accSets }, () => ({
        type: 'acc',
        weight: def.loaded ? st.weight : null,
        reps: def.loaded ? def.range[1] : st.target,
        min: def.loaded ? def.range[0] : st.target,
        rpe: 8,
      })),
    });
  }

  return {
    kind: 'lift',
    title: tpl.title,
    day: slot.day,
    ...meta,
    exercises,
    minutes: estimateMinutes(exercises),
  };
}

function estimateMinutes(exercises) {
  let total = 4; // general warm-up
  let accessoryCount = 0;
  let accessorySets = 0;
  for (const ex of exercises) {
    if (ex.role === 'main') total += ex.warmup.length * 1.25 + ex.sets.length * (1 + ex.rest / 60);
    else if (ex.role === 'secondary') total += 2 + ex.sets.length * (1 + ex.rest / 60);
    else {
      accessoryCount += 1;
      accessorySets = ex.sets.length;
    }
  }
  // Accessories are done as supersets (pairs).
  total += Math.ceil(accessoryCount / 2) * accessorySets * 2.5;
  return Math.round(total / 5) * 5;
}

export function emptyLog(session) {
  if (session.kind === 'cardio') return { completed: true, minutes: session.minutes, avgHr: '', rpe: null };
  return { exercises: session.exercises.map((ex) => ({ sets: ex.sets.map(() => null) })) };
}

// ---------------------------------------------------------------------------
// Live adjustment during a session

function effectiveRpe(planned, actual) {
  // Missing reps means the set was at (or past) true failure for that many reps.
  if (actual.reps < planned.reps) return 10;
  return actual.rpe ?? planned.rpe;
}

// Call after logging set `setIdx` of exercise `exIdx`. Mutates the remaining
// planned sets of that exercise and returns a coaching note (or null).
export function adjustAfterSet(session, log, exIdx, setIdx, units) {
  const ex = session.exercises[exIdx];
  const planned = ex.sets[setIdx];
  const actual = log.exercises[exIdx].sets[setIdx];
  if (!actual) return null;
  const remaining = ex.sets
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => i > setIdx && !log.exercises[exIdx].sets[i]);

  if (ex.role === 'accessory') {
    if (ex.loaded && actual.weight > 0 && actual.reps < planned.min) {
      const step = UNIT_CONFIG[units].accessoryStep;
      const w = Math.max(0, actual.weight - step);
      remaining.forEach(({ s }) => { s.weight = w; });
      return remaining.length ? `Short of ${planned.min} reps. Drop to ${w} for the next set.` : null;
    }
    if (ex.loaded && actual.reps >= planned.reps + 3 && remaining.length) {
      return 'That looked easy. Stay at this weight today; it goes up next session.';
    }
    return null;
  }

  const rpe = effectiveRpe(planned, actual);
  const missed = actual.reps < planned.reps;

  if (planned.type === 'top') {
    if (!remaining.length) return missed ? 'Missed reps on the top set. The plan will ease off next time.' : null;
    const today = estimate1RM(actual.weight, actual.reps, rpe);
    const target = remaining[0].s;
    const computed = roundBarbell(loadFor(today, target.reps, target.rpe), units);
    const w = Math.min(computed, roundBarbell(actual.weight * 0.95, units));
    remaining.forEach(({ s }) => { s.weight = w; });
    if (missed) return `Missed reps on the top set, no problem. Back-offs dropped to ${w}. Today's work still counts.`;
    if (rpe >= planned.rpe + 1) return `Harder than planned (RPE ${rpe} vs ${planned.rpe}). Back-offs lowered to ${w}.`;
    if (rpe <= planned.rpe - 1) return `That moved well. Back-offs bumped to ${w}.`;
    return `On target. Back-offs at ${w}.`;
  }

  // Back-off or straight sets.
  if (missed || rpe >= planned.rpe + 1.5) {
    ex.struggles = (ex.struggles || 0) + 1;
    if (ex.struggles >= 2) {
      remaining.forEach(({ s }) => { s.optional = true; });
      return remaining.length ? "Two grinders in a row. Skip the rest of this lift; you've done the work that matters." : null;
    }
    const w = roundBarbell(actual.weight * 0.92, units);
    remaining.forEach(({ s }) => { s.weight = Math.min(s.weight, w); });
    return remaining.length ? `That was a grind. Next sets dropped to ${w}.` : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Learning from a finished session

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function loggedSets(ex, exLog) {
  return ex.sets
    .map((planned, i) => ({ planned, actual: exLog.sets[i] }))
    .filter(({ actual }) => actual && actual.weight > 0);
}

function updateMainLift(lift, ex, exLog, deload, units) {
  const sets = loggedSets(ex, exLog);
  const top = sets.find((s) => s.planned.type === 'top');
  if (!top) return { lift, note: null };
  const prev = lift.e1rm;
  const topE1 = estimate1RM(top.actual.weight, top.actual.reps, effectiveRpe(top.planned, top.actual));
  const backoffs = sets.filter((s) => s.planned.type === 'backoff');
  const boE1 = backoffs.map((s) => estimate1RM(s.actual.weight, s.actual.reps, effectiveRpe(s.planned, s.actual)));
  const est = boE1.length ? topE1 * 0.7 + (boE1.reduce((a, b) => a + b, 0) / boE1.length) * 0.3 : topE1;

  const missed = sets.some((s) => s.actual.reps < s.planned.reps);
  const topRpe = effectiveRpe(top.planned, top.actual);
  const hitTarget = !missed && topRpe <= top.planned.rpe;
  const struggled = top.actual.reps < top.planned.reps || topRpe >= top.planned.rpe + 1.5;
  const name = ex.name;
  const fmt = (v) => roundTo(v, units === 'kg' ? 0.5 : 1);

  if (deload) {
    return { lift: { ...lift, strikes: 0 }, note: `${name}: deload logged, estimate held at ${fmt(prev)}.` };
  }

  // Believe drops a little faster than gains; cap single-session swings.
  const delta = est - prev;
  let next = prev + clamp(delta > 0 ? delta * 0.5 : delta * 0.6, -0.08 * prev, 0.03 * prev);
  let reason;
  if (hitTarget) {
    next = Math.max(next, prev * 1.01);
    reason = topRpe <= top.planned.rpe - 1 ? 'felt easy, bigger jump next time' : 'right on target, small bump next time';
  } else if (struggled) {
    reason = 'tougher than planned, eased back a bit';
  } else {
    reason = 'slightly harder than planned, held steady';
  }

  let strikes = struggled ? lift.strikes + 1 : 0;
  if (strikes >= 2) {
    next = Math.min(next, prev * 0.95);
    strikes = 0;
    reason = 'two tough sessions running, so a 5% reset to rebuild momentum';
  }
  return {
    lift: { ...lift, e1rm: next, strikes },
    note: `${name}: est. max ${fmt(prev)} → ${fmt(next)} (${reason}).`,
  };
}

function updateSecondaryLift(lift, ex, exLog, deload) {
  const sets = loggedSets(ex, exLog);
  if (!sets.length || deload) return lift;
  const est = sets.map((s) => estimate1RM(s.actual.weight, s.actual.reps, effectiveRpe(s.planned, s.actual)))
    .reduce((a, b) => a + b, 0) / sets.length;
  const prev = lift.e1rm;
  let next = prev + clamp((est - prev) * 0.25, -0.04 * prev, 0.015 * prev);
  const allGood = sets.every((s) => s.actual.reps >= s.planned.reps && effectiveRpe(s.planned, s.actual) <= s.planned.rpe);
  if (allGood) next = Math.max(next, prev * 1.005);
  return { ...lift, e1rm: next };
}

function updateAccessory(key, st, ex, exLog, units) {
  const def = ACCESSORIES[key];
  const sets = ex.sets.map((planned, i) => ({ planned, actual: exLog.sets[i] })).filter((s) => s.actual);
  if (!sets.length) return { st, note: null };
  const unit = def.unit === 'sec' ? 's' : '';
  const avgRpe = sets.reduce((a, s) => a + (s.actual.rpe ?? 8), 0) / sets.length;

  if (def.loaded) {
    const step = UNIT_CONFIG[units].accessoryStep;
    const weight = Math.max(...sets.map((s) => Number(s.actual.weight) || 0));
    const allTop = sets.length === ex.sets.length && sets.every((s) => s.actual.reps >= def.range[1]);
    const shortSets = sets.filter((s) => s.actual.reps < def.range[0]).length;
    if (allTop && avgRpe <= 8.5) {
      return { st: { weight: weight + step }, note: `${def.name}: hit ${def.range[1]}${unit} on every set, up to ${weight + step}.` };
    }
    if (shortSets >= 2 || avgRpe >= 9.5) {
      const w = Math.max(0, weight - step);
      return { st: { weight: w }, note: `${def.name}: too heavy for now, back to ${w}.` };
    }
    return { st: { weight }, note: null };
  }

  const allHit = sets.length === ex.sets.length && sets.every((s) => s.actual.reps >= st.target);
  if (allHit && avgRpe <= 8.5 && st.target < def.range[1]) {
    const target = Math.min(def.range[1], st.target + (def.step || 1));
    return { st: { target }, note: `${def.name}: target goes up to ${target}${unit}.` };
  }
  return { st, note: null };
}

// Apply a finished (or skipped) session. Returns { state, notes }.
export function completeSession(state, session, log, { now = new Date(), skipped = false, readiness = null } = {}) {
  const next = structuredClone(state);
  const notes = [];
  const { units } = next.profile;

  if (!skipped && session.kind === 'lift') {
    session.exercises.forEach((ex, i) => {
      const exLog = log.exercises[i];
      if (ex.role === 'main') {
        const { lift, note } = updateMainLift(next.lifts[ex.lift], ex, exLog, session.deload, units);
        next.lifts[ex.lift] = lift;
        if (note) notes.push(note);
      } else if (ex.role === 'secondary') {
        next.lifts[ex.lift] = updateSecondaryLift(next.lifts[ex.lift], ex, exLog, session.deload);
      } else {
        const { st, note } = updateAccessory(ex.acc, next.accessories[ex.acc], ex, exLog, units);
        next.accessories[ex.acc] = st;
        if (note) notes.push(note);
      }
    });
    for (const key of new Set(session.exercises.filter((e) => e.lift).map((e) => e.lift))) {
      next.lifts[key].history.push({ date: now.toISOString(), e1rm: next.lifts[key].e1rm });
    }
  } else if (!skipped && session.kind === 'cardio') {
    const { cardio, note } = progressCardio(next.cardio, session, log, next.profile);
    next.cardio = cardio;
    notes.push(note);
  }

  const prevBlock = next.cursor.block;
  next.cursor = advanceCursor(next.cursor, next.profile);
  if (next.cursor.block !== prevBlock) {
    const info = blockInfo(next.cursor);
    notes.push(`Block complete. Next up: ${info.name} block. ${info.focus}`);
  } else if (next.cursor.week === WEEKS_PER_BLOCK && next.cursor.slot === 0) {
    notes.push('Next week is a deload: lighter weights to let the last three weeks sink in.');
  }

  next.history.push({
    id: `${now.getTime()}`,
    date: now.toISOString(),
    skipped,
    readiness,
    session,
    log: skipped ? null : log,
    notes,
  });
  next.active = null;
  return { state: next, notes };
}

// ---------------------------------------------------------------------------
// Looking ahead

// Projects the next `count` sessions assuming targets are hit (so loads show
// the planned progression, not just today's numbers).
export function projectUpcoming(state, count = 8) {
  const sim = structuredClone(state);
  sim.active = null;
  const out = [];
  let cursor = { ...state.cursor };
  for (let n = 0; n < count; n++) {
    const plan = weekPlan(sim.profile, cursor.week);
    const slot = plan[cursor.slot];
    const session = buildSession(sim, slot, { cursor });
    out.push({ cursor: { ...cursor }, session, index: cursor.slot, weekLength: plan.length });
    const deload = cursor.week === WEEKS_PER_BLOCK;
    if (session.kind === 'lift' && !deload) {
      for (const ex of session.exercises) {
        if (ex.role === 'main') sim.lifts[ex.lift].e1rm *= 1.01;
        if (ex.role === 'secondary') sim.lifts[ex.lift].e1rm *= 1.005;
      }
    } else if (session.kind === 'cardio' && !deload) {
      if (session.cardioType === 'z2') sim.cardio.z2Minutes = Math.min(sim.profile.z2Max, sim.cardio.z2Minutes + 5);
      else sim.cardio.intervalRung = Math.min(INTERVAL_LADDER.length - 1, sim.cardio.intervalRung + 1);
    }
    cursor = advanceCursor(cursor, sim.profile);
  }
  return out;
}

// Settings changes can alter the week layout; keep the cursor valid.
export function applyProfileChange(state, profile) {
  const next = structuredClone(state);
  if (profile.units && profile.units !== state.profile.units) {
    const f = profile.units === 'kg' ? 1 / 2.2046 : 2.2046;
    const step = UNIT_CONFIG[profile.units].accessoryStep;
    for (const lift of Object.values(next.lifts)) lift.e1rm *= f;
    for (const acc of Object.values(next.accessories)) {
      if (acc.weight != null) acc.weight = roundTo(acc.weight * f, step);
    }
  }
  next.profile = { ...next.profile, ...profile };
  next.cardio.z2Minutes = Math.min(next.cardio.z2Minutes, next.profile.z2Max);
  const plan = weekPlan(next.profile, next.cursor.week);
  if (next.cursor.slot >= plan.length) next.cursor.slot = 0;
  next.active = null;
  return next;
}
