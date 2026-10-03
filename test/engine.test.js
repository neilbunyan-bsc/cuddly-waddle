import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentOf1RM, estimate1RM, warmupSets, roundBarbell,
  createState, defaultProfile, weekPlan, buildSession, emptyLog, adjustAfterSet,
  completeSession, projectUpcoming, migrateState, swapAccessory, accessoriesForBlock, repsAtLoad, capFor,
  ACCESSORY_POOLS, ACCESSORIES, TEMPLATES, advanceCursor, readinessLevel, applyProfileChange,
  progressCardio, buildCardioSession, heartRateZones, INTERVAL_LADDER,
} from '../js/engine/index.js';

const inputs = {
  squat: { weight: 275, reps: 5, rpe: 8 },
  bench: { weight: 205, reps: 5, rpe: 8 },
  deadlift: { weight: 315, reps: 5, rpe: 8 },
  press: { weight: 125, reps: 5, rpe: 8 },
};

// Baseline without caps or finisher so the core progression is tested on its own.
const BASE = { cardioDays: 2, finisher: 0, caps: {} };

function fresh(overrides = {}) {
  return createState({ ...defaultProfile(), ...BASE, ...overrides }, inputs, new Date('2026-01-05'));
}

// Log every planned set exactly as prescribed, at a given RPE offset.
function logAsPlanned(session, { rpeOffset = 0, repsOffset = 0 } = {}) {
  const log = emptyLog(session);
  session.exercises.forEach((ex, i) => {
    ex.sets.forEach((s, j) => {
      log.exercises[i].sets[j] = { weight: s.weight, reps: s.reps + repsOffset, rpe: s.rpe + rpeOffset };
    });
  });
  return log;
}

test('RPE chart basics', () => {
  assert.equal(percentOf1RM(1, 10), 1);
  assert.ok(Math.abs(percentOf1RM(5, 8) - 0.811) < 1e-9);
  assert.ok(Math.abs(percentOf1RM(3, 8.5) - (0.892 + 0.863) / 2) < 1e-9);
  assert.ok(Math.abs(estimate1RM(275, 5, 8) - 275 / 0.811) < 1e-9);
  assert.equal(estimate1RM(200, 0, 9), 190);
});

test('warm-ups ramp up and stay below the top set', () => {
  const w = warmupSets(300, 'lb');
  assert.equal(w[0].weight, 45);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].weight > w[i - 1].weight && w[i].weight < 300);
  assert.equal(roundBarbell(12, 'kg'), 20);
});

test('week plan interleaves lifting and cardio', () => {
  const plan = weekPlan({ liftDays: 3, cardioDays: 2 }, 1);
  assert.deepEqual(plan.map((p) => p.type), ['lift', 'cardio', 'lift', 'cardio', 'lift']);
  assert.equal(weekPlan({ liftDays: 4, cardioDays: 0 }, 1).length, 4);
  assert.equal(weekPlan({ liftDays: 2, cardioDays: 3 }, 1).length, 5);
});

test('standard session is ~45 min and short session is shorter', () => {
  const s = buildSession(fresh());
  assert.equal(s.kind, 'lift');
  assert.equal(s.exercises[0].sets.length, 3);
  assert.ok(s.minutes <= 50, `standard ${s.minutes}`);
  const short = buildSession(fresh({ length: 'short' }));
  assert.ok(short.minutes <= 35, `short ${short.minutes}`);
  assert.ok(short.minutes < s.minutes);
});

test('low readiness lowers RPE and volume', () => {
  const st = fresh();
  const normal = buildSession(st);
  const low = buildSession(st, undefined, { readiness: 'low' });
  assert.ok(low.exercises[0].sets[0].weight < normal.exercises[0].sets[0].weight);
  assert.ok(low.exercises[0].sets.length < normal.exercises[0].sets.length);
  assert.equal(readinessLevel({ sleep: 2, energy: 2, soreness: 2 }), 'low');
  assert.equal(readinessLevel({ sleep: 4, energy: 3, soreness: 3 }), 'normal');
});

test('a hard top set lowers the back-offs; an easy one raises them (capped)', () => {
  const st = fresh();
  const s1 = buildSession(st);
  const planned = s1.exercises[0].sets[1].weight;
  const log1 = emptyLog(s1);
  const top = s1.exercises[0].sets[0];
  log1.exercises[0].sets[0] = { weight: top.weight, reps: top.reps, rpe: 9.5 };
  const note = adjustAfterSet(s1, log1, 0, 0, 'lb');
  assert.match(note, /lowered/);
  assert.ok(s1.exercises[0].sets[1].weight < planned);

  const s2 = buildSession(st);
  const log2 = emptyLog(s2);
  log2.exercises[0].sets[0] = { weight: top.weight, reps: top.reps, rpe: 6 };
  adjustAfterSet(s2, log2, 0, 0, 'lb');
  assert.ok(s2.exercises[0].sets[1].weight >= planned);
  assert.ok(s2.exercises[0].sets[1].weight <= top.weight * 0.95 + 5);
});

test('missing reps on the top set drops back-offs', () => {
  const s = buildSession(fresh());
  const log = emptyLog(s);
  const top = s.exercises[0].sets[0];
  const planned = s.exercises[0].sets[1].weight;
  log.exercises[0].sets[0] = { weight: top.weight, reps: top.reps - 2, rpe: 10 };
  assert.match(adjustAfterSet(s, log, 0, 0, 'lb'), /Missed reps/);
  assert.ok(s.exercises[0].sets[1].weight < planned);
});

test('two grinding back-offs mark the rest optional', () => {
  const st = fresh();
  const s = buildSession(st);
  s.exercises[0].sets.push({ ...s.exercises[0].sets[1] }); // 3 back-offs
  const log = emptyLog(s);
  log.exercises[0].sets.push(null);
  const ex = s.exercises[0];
  log.exercises[0].sets[0] = { weight: ex.sets[0].weight, reps: ex.sets[0].reps, rpe: ex.sets[0].rpe };
  adjustAfterSet(s, log, 0, 0, 'lb');
  log.exercises[0].sets[1] = { weight: ex.sets[1].weight, reps: ex.sets[1].reps - 1, rpe: 10 };
  assert.match(adjustAfterSet(s, log, 0, 1, 'lb'), /grind/);
  log.exercises[0].sets[2] = { weight: ex.sets[2].weight, reps: ex.sets[2].reps - 1, rpe: 10 };
  assert.match(adjustAfterSet(s, log, 0, 2, 'lb'), /Skip the rest/);
  assert.equal(ex.sets[3].optional, true);
});

test('hitting targets progressively overloads; failing eases off', () => {
  let st = fresh();
  const before = st.lifts.squat.e1rm;
  const s = buildSession(st);
  ({ state: st } = completeSession(st, s, logAsPlanned(s)));
  assert.ok(st.lifts.squat.e1rm >= before * 1.01 - 1e-9);

  let failing = fresh();
  const s2 = buildSession(failing);
  ({ state: failing } = completeSession(failing, s2, logAsPlanned(s2, { repsOffset: -2 })));
  assert.ok(failing.lifts.squat.e1rm < before);
  assert.equal(failing.lifts.squat.strikes, 1);
});

test('two struggling sessions trigger a reset', () => {
  let st = fresh({ cardioDays: 0, liftDays: 3 });
  const start = st.lifts.squat.e1rm;
  for (let i = 0; i < 6; i++) {
    const s = buildSession(st);
    const offset = s.exercises[0].lift === 'squat' ? { rpeOffset: 1.5 } : {};
    let notes;
    ({ state: st, notes } = completeSession(st, s, logAsPlanned(s, offset)));
    if (i === 3) assert.ok(notes.some((n) => /reset/.test(n)), notes.join('|'));
  }
  assert.ok(st.lifts.squat.e1rm <= start * 0.95);
  assert.equal(st.lifts.squat.strikes, 0);
});

test('weekly weights climb across a block, then deload, then new block', () => {
  let st = fresh({ cardioDays: 0 });
  const tops = [];
  for (let i = 0; i < 12; i++) {
    const s = buildSession(st);
    if (s.exercises[0].lift === 'squat') tops.push({ week: s.week, w: s.exercises[0].sets[0].weight, deload: s.deload });
    ({ state: st } = completeSession(st, s, logAsPlanned(s)));
  }
  assert.equal(tops.length, 4);
  assert.ok(tops[1].w > tops[0].w && tops[2].w > tops[1].w, JSON.stringify(tops));
  assert.ok(tops[3].deload && tops[3].w < tops[2].w);
  assert.equal(st.cursor.block, 1);
  assert.equal(st.cursor.week, 1);
});

test('accessory double progression', () => {
  let st = fresh();
  const s = buildSession(st);
  const i = s.exercises.findIndex((e) => e.acc === 'row');
  const w = st.accessories.row.weight;
  ({ state: st } = completeSession(st, s, logAsPlanned(s)));
  assert.equal(st.accessories.row.weight, w + 5);
  const pullApart = fresh().accessories.pullApart.target;
  assert.equal(st.accessories.pullApart.target, pullApart, 'pull-apart not in this session, unchanged');
  assert.ok(i >= 0);
});

test('cardio: zone 2 grows, intervals climb the ladder, deload swaps intervals', () => {
  const profile = defaultProfile();
  const zones = heartRateZones(40);
  assert.equal(zones.max, 180);
  const cardio = { z2Minutes: 25, intervalRung: 0 };
  const z2 = buildCardioSession('z2', cardio, profile);
  let r = progressCardio(cardio, z2, { completed: true, rpe: 4, avgHr: 120 }, profile);
  assert.equal(r.cardio.z2Minutes, 30);
  r = progressCardio(cardio, z2, { completed: true, rpe: 7, avgHr: 150 }, profile);
  assert.equal(r.cardio.z2Minutes, 25);

  const iv = buildCardioSession('intervals', cardio, profile);
  assert.equal(iv.cardioType, 'intervals');
  assert.equal(progressCardio(cardio, iv, { completed: true, rpe: 8 }, profile).cardio.intervalRung, 1);
  assert.equal(progressCardio({ ...cardio, intervalRung: 2 }, iv, { completed: false, rpe: 10 }, profile).cardio.intervalRung, 1);
  const top = { ...cardio, intervalRung: INTERVAL_LADDER.length - 1 };
  assert.ok(buildCardioSession('intervals', top, profile).minutes <= 40);

  assert.equal(buildCardioSession('intervals', cardio, profile, { deload: true }).cardioType, 'z2');
});

test('projection looks ahead and does not mutate state', () => {
  const st = fresh();
  const snapshot = JSON.stringify(st);
  const up = projectUpcoming(st, 10);
  assert.equal(up.length, 10);
  assert.equal(JSON.stringify(st), snapshot);
  assert.equal(up[5].cursor.week, 2);
  const squats = up.filter((u) => u.session.kind === 'lift' && u.session.exercises[0].lift === 'squat');
  assert.ok(squats[1].session.exercises[0].sets[0].weight > squats[0].session.exercises[0].sets[0].weight);
});

test('cursor wraps weeks and blocks', () => {
  const profile = { liftDays: 2, cardioDays: 0 };
  let c = { block: 0, week: 4, slot: 1 };
  c = advanceCursor(c, profile);
  assert.deepEqual(c, { block: 1, week: 1, slot: 0 });
});

test('switching units converts weights', () => {
  const st = fresh();
  const kg = applyProfileChange(st, { units: 'kg' });
  assert.ok(Math.abs(kg.lifts.squat.e1rm - st.lifts.squat.e1rm / 2.2046) < 1e-6);
  assert.equal(kg.accessories.row.weight % 2.5, 0);
  const s = buildSession(kg);
  assert.equal(s.exercises[0].sets[0].weight % 2.5, 0);
});

test('weight caps hold the load and progress reps instead', () => {
  const caps = { squat: 315, bench: 225, deadlift: 405, press: 135 };
  // Strong lifter: uncapped plans would exceed every cap.
  const strong = { squat: { weight: 365, reps: 5, rpe: 8 }, bench: { weight: 265, reps: 5, rpe: 8 }, deadlift: { weight: 455, reps: 5, rpe: 8 }, press: { weight: 165, reps: 5, rpe: 8 } };
  let st = createState({ ...defaultProfile(), ...BASE, caps }, strong);
  // Build-block sets of 10 sit under the cap; the Strength block reaches it.
  assert.equal(buildSession(st).exercises[0].capped, false);
  st.cursor = { block: 1, week: 1, slot: 0 };
  const s = buildSession(st);
  const main = s.exercises[0];
  assert.equal(main.capped, true);
  assert.equal(main.sets[0].weight, 315);
  assert.ok(main.sets[0].reps > 6, 'reps go above the planned 6 when the weight is capped');
  for (const set of main.sets) assert.ok(set.weight <= 315);

  // Nothing in the projection ever goes over a cap.
  for (const u of projectUpcoming(st, 40)) {
    if (u.session.kind !== 'lift') continue;
    for (const ex of u.session.exercises) {
      if (!ex.lift) continue;
      for (const set of ex.sets) assert.ok(set.weight <= caps[ex.lift], `${ex.lift} ${set.weight}`);
      for (const w of ex.warmup || []) assert.ok(w.weight <= caps[ex.lift]);
    }
  }

  // Hitting targets at the cap leads to more reps next time, and a rep record note.
  const before = main.sets[0].reps;
  let notes;
  ({ state: st, notes } = completeSession(st, s, logAsPlanned(s)));
  assert.match(notes[0], /reps at your 315 cap/);
  st.cursor = { block: 1, week: 1, slot: 0 };
  for (let k = 0; k < 4; k++) st.lifts.squat.e1rm *= 1.01;
  assert.ok(buildSession(st).exercises[0].sets[0].reps > before);
  assert.equal(st.lifts.squat.atCap.reps, before);
});

test('reps at cap respect the ceiling and the plan minimum', () => {
  assert.equal(repsAtLoad(1000, 315, 8, 4, 12), 12);
  assert.equal(repsAtLoad(330, 315, 8, 4, 12), 4);
  assert.equal(capFor({ units: 'lb', caps: { squat: 317 } }, 'squat'), 315);
  assert.equal(capFor({ units: 'lb', caps: { squat: 0 } }, 'squat'), null);
});

test('accessories rotate each block and avoid core work', () => {
  const profile = { ...defaultProfile(), liftDays: 3 };
  const b0 = accessoriesForBlock(profile, 0);
  const b1 = accessoriesForBlock(profile, 1);
  assert.notDeepEqual(b0, b1);
  for (const pool of Object.values(ACCESSORY_POOLS)) for (const id of pool) assert.ok(ACCESSORIES[id], id);
  assert.ok(!ACCESSORIES.plank && !ACCESSORIES.deadBug);
  for (const days of Object.values(TEMPLATES)) for (const t of days) for (const c of t.accessories) assert.ok(ACCESSORY_POOLS[c], c);
  // Same category on two days in one block gets different exercises.
  const st = fresh();
  const a = buildSession(st, { type: 'lift', day: 0 });
  const c = buildSession(st, { type: 'lift', day: 2 });
  assert.notEqual(a.exercises.find((e) => e.category === 'hRow').acc, c.exercises.find((e) => e.category === 'hRow').acc);
});

test('swap gives a different accessory from the same category', () => {
  const st = fresh();
  const s = buildSession(st);
  const i = s.exercises.findIndex((e) => e.role === 'accessory');
  const swapped = swapAccessory(st, s, i);
  assert.equal(swapped.category, s.exercises[i].category);
  assert.notEqual(swapped.acc, s.exercises[i].acc);
  assert.equal(swapped.sets.length, s.exercises[i].sets.length);
});

test('cardio finisher is added, logged, and keeps the session short', () => {
  let st = fresh({ finisher: 10 });
  const s = buildSession(st);
  const fin = s.exercises.at(-1);
  assert.equal(fin.role, 'finisher');
  assert.equal(fin.sets[0].reps, 10);
  assert.ok(s.minutes <= 50, `${s.minutes}`);
  ({ state: st } = completeSession(st, s, logAsPlanned(s)));
  assert.equal(st.history.length, 1);
  assert.equal(weekPlan({ liftDays: 3, cardioDays: 4 }, 1).filter((p) => p.type === 'cardio').length, 4);
});

test('old saved data migrates without losing progress', () => {
  const old = fresh();
  old.version = 1;
  delete old.profile.caps;
  delete old.profile.finisher;
  old.profile.z2Max = 45;
  delete old.accessories.chestRow;
  old.lifts.squat.e1rm = 333;
  old.active = { session: {}, log: {} };
  const m = migrateState(old);
  assert.deepEqual(m.profile.caps, { squat: 315, bench: 225, deadlift: 405, press: 135 });
  assert.equal(m.profile.finisher, 10);
  assert.equal(m.profile.z2Max, 60);
  assert.ok(m.accessories.chestRow);
  assert.equal(m.lifts.squat.e1rm, 333);
  assert.equal(m.active, null);
  assert.equal(migrateState(m).profile.z2Max, 60);
});
