import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentOf1RM, estimate1RM, warmupSets, roundBarbell,
  createState, defaultProfile, weekPlan, buildSession, emptyLog, adjustAfterSet,
  completeSession, projectUpcoming, advanceCursor, readinessLevel, applyProfileChange,
  progressCardio, buildCardioSession, heartRateZones, INTERVAL_LADDER,
} from '../js/engine/index.js';

const inputs = {
  squat: { weight: 275, reps: 5, rpe: 8 },
  bench: { weight: 205, reps: 5, rpe: 8 },
  deadlift: { weight: 315, reps: 5, rpe: 8 },
  press: { weight: 125, reps: 5, rpe: 8 },
};

function fresh(overrides = {}) {
  return createState({ ...defaultProfile(), ...overrides }, inputs, new Date('2026-01-05'));
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
  const plankBefore = fresh().accessories.plank.target;
  assert.equal(st.accessories.plank.target, plankBefore + 5);
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
